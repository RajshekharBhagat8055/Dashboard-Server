import { Request, Response } from "express";
import User from "../models/User";
import { generateTokenPair, verifyRefreshToken, generateAccessToken } from "../utils/jwt";

// Login controller
const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      console.error("Login validation error: Username and password are required");
      return res.status(400).json({
        success: false,
        message: "Username and password are required"
      });
    }

    // Find user by username
    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Check if user is active and not banned
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account is deactivated"
      });
    }

    if (user.isBanned) {
      return res.status(401).json({
        success: false,
        message: "Account is banned"
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Update last login and set online status
    await User.findByIdAndUpdate(user._id, {
      lastLogin: new Date(),
      isOnline: true,
      lastActivity: new Date()
    });

    // Generate token pair
    const tokenPayload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      uniqueId: user.uniqueId
    };

    const tokens = generateTokenPair(tokenPayload);

    // Set HttpOnly cookies for secure token storage
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,        // Prevents JavaScript access (XSS protection)
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict',    // CSRF protection
      maxAge: 15 * 60 * 1000 // 15 minutes (access token expiry)
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,        // Prevents JavaScript access
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days (refresh token expiry)
    });

    // Return success response WITHOUT tokens (they're in cookies now)
    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          uniqueId: user.uniqueId,
          creditBalance: user.creditBalance,
          isOnline: true,
          lastLogin: user.lastLogin
        }
        // Remove tokens from response - they're in HttpOnly cookies
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Logout controller
const logout = async (req: Request, res: Response) => {
  try {
    // Clear HttpOnly cookies containing tokens
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    // Get user from request (set by auth middleware)
    const userId = req.user?._id;

    if (userId) {
      // Update user status to offline
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastActivity: new Date()
      });
    }

    return res.status(200).json({
      success: true,
      message: "Logout successful"
    });

  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Refresh token controller
const refreshToken = async (req: Request, res: Response) => {
  try {
    // Get refresh token from HttpOnly cookie
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token not found"
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Check if user exists and is active
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found"
      });
    }

    if (!user.isActive || user.isBanned) {
      return res.status(401).json({
        success: false,
        message: "Account is inactive or banned"
      });
    }

    // Generate new access token
    const tokenPayload = {
      userId: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      uniqueId: user.uniqueId
    };

    const newAccessToken = generateAccessToken(tokenPayload);

    // Set new access token cookie
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully"
    });

  } catch (error) {
    console.error("Refresh token error:", error);

    if (error instanceof Error) {
      if (error.message === 'Refresh token expired') {
        return res.status(401).json({
          success: false,
          message: 'Refresh token expired',
          code: 'REFRESH_TOKEN_EXPIRED'
        });
      }

      if (error.message === 'Invalid refresh token') {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Get current user profile
const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          uniqueId: user.uniqueId,
          creditBalance: user.creditBalance,
          playPoints: user.playPoints,
          winPoints: user.winPoints,
          claimPoints: user.claimPoints,
          endPoints: user.endPoints,
          isActive: user.isActive,
          isOnline: user.isOnline,
          isBanned: user.isBanned,
          status: user.status,
          commissionRate: user.commissionRate,
          totalCommissionEarned: user.totalCommissionEarned,
          totalSubordinates: user.totalSubordinates,
          lastLogin: user.lastLogin,
          lastActivity: user.lastActivity,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
    });

  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Change password
const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "All password fields are required"
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New passwords don't match"
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long"
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Verify old password
    const isOldPasswordValid = await user.comparePassword(oldPassword);

    if (!isOldPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    // Update password and hash it
    user.password = newPassword;
    await user.hashPassword();
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully"
    });

  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Create new user (admin functionality)
const createUser = async (req: Request, res: Response) => {
  try {
    const { username, password, email, role, creditBalance, commissionRate, status, createdBy } = req.body;

    // Validate required fields
    if (!username || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Username, password, and role are required"
      });
    }

    // Validate role
    const validRoles = ['admin', 'super_distributor', 'distributor', 'retailer', 'user'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified"
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Username already exists"
      });
    }

    // Generate uniqueId
    const uniqueId = (User as any).generateUniqueId(role);

    // Create new user
    const newUser = new User({
      username: username.toLowerCase(),
      password, // Will be hashed by hashPassword method
      email,
      role,
      uniqueId,
      creditBalance: creditBalance || 0,
      commissionRate: commissionRate || 0,
      status: status || 'active',
      createdBy: createdBy || req.user?._id // Default to current user if not specified
    });

    // Hash password
    await newUser.hashPassword();

    // Save user
    await newUser.save();

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        user: {
          _id: newUser._id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          uniqueId: newUser.uniqueId,
          isActive: newUser.isActive,
          createdAt: newUser.createdAt
        }
      }
    });

  } catch (error) {
    console.error("Create user error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export { login, logout, refreshToken, getProfile, changePassword, createUser };