import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import { verifyAccessToken, extractTokenFromHeader, JWTPayload } from '../utils/jwt';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & { _id: string };
    }
  }
}

// Authentication middleware
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extract token from HttpOnly cookie
    const token = req.cookies.accessToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    // Verify token
    const decoded = verifyAccessToken(token);

    // Check if user exists and is active
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.isActive || user.isBanned) {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive or banned'
      });
    }

    // Attach user info to request
    req.user = {
      _id: user._id.toString(),
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      uniqueId: decoded.uniqueId
    };

    // Update last activity
    await User.findByIdAndUpdate(user._id, { lastActivity: new Date() });

    next();
  } catch (error) {
    console.error('Authentication error:', error);

    if (error instanceof Error) {
      if (error.message === 'Access token expired') {
        return res.status(401).json({
          success: false,
          message: 'Access token expired',
          code: 'TOKEN_EXPIRED'
        });
      }

      if (error.message === 'Invalid access token') {
        return res.status(401).json({
          success: false,
          message: 'Invalid access token',
          code: 'INVALID_TOKEN'
        });
      }
    }

    return res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Role-based authorization middleware
export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        requiredRoles: allowedRoles,
        userRole: req.user.role
      });
    }

    next();
  };
};

// Hierarchy-based authorization middleware
export const authorizeHierarchy = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Admins have access to everything
    if (req.user.role === 'admin') {
      return next();
    }

    // For other roles, check if they're accessing their own subordinates
    const targetUserId = req.params.userId || req.params.id;

    if (targetUserId) {
      try {
        const targetUser = await User.findById(targetUserId);

        if (!targetUser) {
          return res.status(404).json({
            success: false,
            message: 'User not found'
          });
        }

        // Check if current user can access this target user
        const canAccess = await checkHierarchyAccess(req.user._id, targetUser);

        if (!canAccess) {
          return res.status(403).json({
            success: false,
            message: 'Cannot access this user - hierarchy violation'
          });
        }
      } catch (error) {
        console.error('Hierarchy check error:', error);
        return res.status(500).json({
          success: false,
          message: 'Error checking hierarchy access'
        });
      }
    }

    next();
  };
};

// Helper function to check hierarchy access
const checkHierarchyAccess = async (currentUserId: string, targetUser: any): Promise<boolean> => {
  // If target user is the same as current user, allow access
  if (targetUser._id.toString() === currentUserId) {
    return true;
  }

  // Check if target user is a direct subordinate
  if (targetUser.parentId && targetUser.parentId.toString() === currentUserId) {
    return true;
  }

  // For deeper hierarchy checks, we might need to traverse up the tree
  // For now, we'll implement a simple check
  const currentUser = await User.findById(currentUserId);

  if (!currentUser) {
    return false;
  }

  // Define hierarchy levels
  const hierarchyLevels = {
    admin: 5,
    super_distributor: 4,
    distributor: 3,
    retailer: 2,
    user: 1
  };

  const currentLevel = hierarchyLevels[currentUser.role as keyof typeof hierarchyLevels] || 0;
  const targetLevel = hierarchyLevels[targetUser.role as keyof typeof hierarchyLevels] || 0;

  // Current user must be higher in hierarchy than target user
  if (currentLevel <= targetLevel) {
    return false;
  }

  // Additional check: target user should be in current user's subtree
  // This is a simplified version - in production, you might want to traverse the tree
  let isInSubtree = false;
  let currentParent = targetUser.parentId;

  while (currentParent) {
    if (currentParent.toString() === currentUserId) {
      isInSubtree = true;
      break;
    }

    const parentUser = await User.findById(currentParent);
    if (!parentUser) break;

    currentParent = parentUser.parentId;
  }

  return isInSubtree;
};

// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies.accessToken;

    if (token) {
      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.userId);

      if (user && user.isActive && !user.isBanned) {
        req.user = {
          _id: user._id.toString(),
          userId: decoded.userId,
          username: decoded.username,
          role: decoded.role,
          uniqueId: decoded.uniqueId
        };
      }
    }
  } catch (error) {
    // Silently fail for optional auth
    console.log('Optional auth failed:', error);
  }

  next();
};
