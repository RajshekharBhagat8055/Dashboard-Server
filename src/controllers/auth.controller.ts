import { Request, Response } from "express";
import User from "../models/User";
import { generateTokenPair, verifyRefreshToken, generateAccessToken } from "../utils/jwt";
import { canCreateRole, validateHierarchyChain, getRequiredHierarchyFields } from "../utils/hierarchy.helper";
import { findUserByUsername, trimUsername } from "../utils/username";
import jwt from "jsonwebtoken";

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

    // Find user by username (case-insensitive; login works with AS1 or as1)
    const user = await findUserByUsername(username);

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

    // Panel login is not game presence — isOnline is owned by skill-game sockets
    const updateFields: any = { lastLogin: new Date(), lastActivity: new Date() };
    if (!user.plainPassword) {
      updateFields.plainPassword = password;
    }
    await User.findByIdAndUpdate(user._id, updateFields);

    // Generate token pair
    const tokenPayload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      uniqueId: user.uniqueId
    };

    const tokens = generateTokenPair(tokenPayload);

    // Set HttpOnly cookies for secure token storage
    const isProduction = process.env.NODE_ENV === 'production';
    const isNetworkAccess = req.hostname.startsWith('192.168.');
    const isHttpServer = req.protocol === 'http' && req.hostname === '72.60.220.10';

    // Configure cookie options based on environment
    const baseCookieOptions: any = {
      httpOnly: true,        // Prevents JavaScript access (XSS protection)
      secure: isProduction && !isHttpServer,  // HTTPS only in production, but allow HTTP for 72.60.220.10
      sameSite: (isProduction && !isHttpServer) ? 'none' : 'lax', // 'none' for cross-domain, 'lax' for localhost/HTTP
      maxAge: 15 * 60 * 1000 // 15 minutes (access token expiry)
    };

    // For network access (192.168.x.x), set domain to share cookies across ports
    if (isNetworkAccess) {
      baseCookieOptions.domain = req.hostname; // e.g., '192.168.1.100'
    }

    res.cookie('accessToken', tokens.accessToken, baseCookieOptions);

    // Refresh token with longer expiry
    const refreshCookieOptions = {
      ...baseCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days (refresh token expiry)
    };

    res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions);

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
          isOnline: user.isOnline,
          lastLogin: user.lastLogin,
          // Hierarchy fields
          superDistributorId: user.superDistributorId,
          distributorId: user.distributorId,
          retailerId: user.retailerId,
          parentId: user.parentId,
          createdBy: user.createdBy
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
    const isProduction = process.env.NODE_ENV === 'production';
    const isNetworkAccess = req.hostname.startsWith('192.168.');
    const isHttpServer = req.protocol === 'http' && req.hostname === '72.60.220.10';

    const clearCookieOptions: any = {
      httpOnly: true,
      secure: isProduction && !isHttpServer,  // HTTPS only in production, but allow HTTP for 72.60.220.10
      sameSite: (isProduction && !isHttpServer) ? 'none' : 'lax' // 'none' for cross-domain, 'lax' for localhost/HTTP
    };

    // For network access, include domain
    if (isNetworkAccess) {
      clearCookieOptions.domain = req.hostname;
    }

    res.clearCookie('accessToken', clearCookieOptions);
    res.clearCookie('refreshToken', clearCookieOptions);

    // Get user from request (set by auth middleware)
    const userId = req.user?._id;

    if (userId) {
      // Update user status to offline
      await User.findByIdAndUpdate(userId, {
        isOnline: false
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
    const isProduction = process.env.NODE_ENV === 'production';
    const isNetworkAccess = req.hostname.startsWith('192.168.');
    const isHttpServer = req.protocol === 'http' && req.hostname === '72.60.220.10';

    const refreshCookieOptions: any = {
      httpOnly: true,
      secure: isProduction && !isHttpServer,  // HTTPS only in production, but allow HTTP for 72.60.220.10
      sameSite: (isProduction && !isHttpServer) ? 'none' : 'lax', // 'none' for cross-domain, 'lax' for localhost/HTTP
      maxAge: 15 * 60 * 1000 // 15 minutes
    };

    // For network access, include domain
    if (isNetworkAccess) {
      refreshCookieOptions.domain = req.hostname;
    }

    res.cookie('accessToken', newAccessToken, refreshCookieOptions);

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

    const user = await User.findById(userId).select('-password -plainPassword');

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
          updatedAt: user.updatedAt,
          // Hierarchy fields
          superDistributorId: user.superDistributorId,
          distributorId: user.distributorId,
          retailerId: user.retailerId,
          parentId: user.parentId,
          createdBy: user.createdBy
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

    // Update password
    user.password = newPassword;
    user.plainPassword = newPassword;
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
    const {
      username,
      password,
      email,
      role,
      creditBalance,
      commissionRate,
      status,
      createdBy,
      superDistributorId,
      distributorId,
    } = req.body;

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

    // Check if creator has permission to create this role
    const creatorRole = req.user?.role;
    if (!creatorRole) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    // Check if creator can create this role
    if (!canCreateRole(creatorRole, role)) {
      return res.status(403).json({
        success: false,
        message: `${creatorRole} cannot create ${role} role`
      });
    }

    // Validate hierarchy chain based on target role
    const requiredFields = getRequiredHierarchyFields(role);

    // Build hierarchy chain object
    const hierarchyChain: any = {};
    if (requiredFields.includes('superDistributorId')) {
      if (!superDistributorId) {
        return res.status(400).json({
          success: false,
          message: `Super Distributor is required for creating ${role}`
        });
      }
      hierarchyChain.superDistributorId = superDistributorId;
    }

    if (requiredFields.includes('distributorId')) {
      if (!distributorId) {
        return res.status(400).json({
          success: false,
          message: `Distributor is required for creating ${role}`
        });
      }
      hierarchyChain.distributorId = distributorId;
    }

    // Validate the hierarchy chain
    if (requiredFields.length > 0) {
      const validation = await validateHierarchyChain(hierarchyChain, role);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: validation.error || "Invalid hierarchy chain"
        });
      }
    }

    // Validate commission does not exceed parent's commission
    // super_distributor is the top of the commission chain — only the 0-100 range applies
    if (commissionRate !== undefined && commissionRate !== null && role !== 'super_distributor') {
      let parentCommissionId: string | undefined;
      if (role === 'distributor') parentCommissionId = superDistributorId;
      else if (role === 'retailer' || role === 'user') parentCommissionId = distributorId;

      if (parentCommissionId) {
        const parentUser = await User.findById(parentCommissionId).select('commissionRate username');
        if (parentUser && commissionRate > parentUser.commissionRate) {
          return res.status(400).json({
            success: false,
            message: `Commission rate cannot exceed parent's commission of ${parentUser.commissionRate}%`
          });
        }
      }
    }

    const normalizedUsername = trimUsername(username);

    // Check if user already exists (case-insensitive: SD2 conflicts with sd2)
    const existingUser = await findUserByUsername(normalizedUsername);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: `Username "${existingUser.username}" already exists. Usernames are not case-sensitive.`
      });
    }

    // Generate uniqueId
    const uniqueId = (User as any).generateUniqueId(role);

    // Determine parentId based on role
    // Both user and retailer are direct children of distributor
    let parentId;
    if ((role === 'user' || role === 'retailer') && distributorId) {
      parentId = distributorId;
    } else if (role === 'distributor' && superDistributorId) {
      parentId = superDistributorId;
    } else if (role === 'super_distributor') {
      parentId = req.user?._id;
    }

    // Create new user with hierarchy chain
    const newUser = new User({
      username: normalizedUsername,
      password,
      email,
      role,
      uniqueId,
      creditBalance: creditBalance || 0,
      commissionRate: commissionRate || 0,
      status: status || 'active',
      createdBy: createdBy || req.user?._id,
      parentId,
      superDistributorId: hierarchyChain.superDistributorId,
      distributorId: hierarchyChain.distributorId,
    });

    // Store plain password
    newUser.plainPassword = password;

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
          superDistributorId: newUser.superDistributorId,
          distributorId: newUser.distributorId,
          createdAt: newUser.createdAt
        }
      }
    });

  } catch (error: any) {
    console.error("Create user error:", error);
    if (error?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Username already exists. Usernames are not case-sensitive."
      });
    }
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Get skill game token for current authenticated admin user
const getSkillGameToken = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    // Only allow admin, super_distributor, distributor, and retailer roles
    const allowedRoles = ['admin', 'super_distributor', 'distributor', 'retailer'];
    if (!req.user?.role || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only admin, super_distributor, distributor, and retailer can access skill game."
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
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

    // Generate skill game compatible token (same format as skill_game_server expects)
    // Use the same JWT secret so skill_game_server can verify it
    const JWT_ACCESS_SECRET: jwt.Secret = process.env.JWT_ACCESS_SECRET || 'your-access-secret-key';
    const JWT_ACCESS_EXPIRE = process.env.JWT_ACCESS_EXPIRE || '15m';

    // Log secret info (without exposing the full secret)
    const secretStr = typeof JWT_ACCESS_SECRET === 'string' ? JWT_ACCESS_SECRET : 'not-string';
    const envSecret = process.env.JWT_ACCESS_SECRET || 'NOT_SET';
    console.log('[getSkillGameToken] Using JWT secret:', {
      secretLength: secretStr.length,
      secretSet: !!process.env.JWT_ACCESS_SECRET,
      secretPreview: secretStr.substring(0, 4) + '...' + secretStr.substring(secretStr.length - 4),
      envSecretLength: envSecret.length,
      envSecretPreview: envSecret !== 'NOT_SET' ? (envSecret.substring(0, 4) + '...' + envSecret.substring(envSecret.length - 4)) : 'NOT_SET',
      usingDefault: !process.env.JWT_ACCESS_SECRET,
    });

    // Generate token without issuer/audience to be compatible with skill_game_server
    // skill_game_server doesn't check issuer/audience, so we omit them
    const skillGameToken = jwt.sign(
      {
        userId: user._id.toString(),
        username: user.username,
        role: user.role,
        uniqueId: user.uniqueId,
        wallet: user.creditBalance ?? 0, // Map creditBalance to wallet
        // No sessionId for admin access - skill game will handle this differently
      },
      JWT_ACCESS_SECRET,
      {
        expiresIn: JWT_ACCESS_EXPIRE,
        // Don't set issuer/audience - skill_game_server doesn't verify them
      } as jwt.SignOptions
    );
    
    console.log('[getSkillGameToken] Generated token for user:', {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      tokenLength: skillGameToken.length,
    });

    return res.status(200).json({
      success: true,
      data: {
        accessToken: skillGameToken,
        user: {
          id: user._id.toString(),
          username: user.username,
          role: user.role,
          wallet: user.creditBalance ?? 0,
        }
      }
    });

  } catch (error) {
    console.error("Get skill game token error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Get Dus Ka Dum game token for current authenticated admin user
const getDusKaDumToken = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const allowedRoles = ['admin', 'super_distributor', 'distributor', 'retailer'];
    if (!req.user?.role || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied."
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.isActive || user.isBanned) {
      return res.status(401).json({ success: false, message: "Account is inactive or banned" });
    }

    const JWT_ACCESS_SECRET: jwt.Secret = process.env.JWT_ACCESS_SECRET || 'your-access-secret-key';
    const JWT_ACCESS_EXPIRE = process.env.JWT_ACCESS_EXPIRE || '15m';

    const accessToken = jwt.sign(
      {
        userId: user._id.toString(),
        username: user.username,
        role: user.role,
        uniqueId: user.uniqueId,
        wallet: user.creditBalance ?? 0,
      },
      JWT_ACCESS_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRE } as jwt.SignOptions
    );

    return res.status(200).json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user._id.toString(),
          username: user.username,
          role: user.role,
          wallet: user.creditBalance ?? 0,
        }
      }
    });
  } catch (error) {
    console.error("Get Dus Ka Dum token error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export { login, logout, refreshToken, getProfile, changePassword, createUser, getSkillGameToken, getDusKaDumToken };