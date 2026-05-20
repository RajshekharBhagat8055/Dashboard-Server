import mongoose from 'mongoose';
import User from '../models/User';

/**
 * Hierarchy structure definition
 * admin -> super_distributor -> distributor -> retailer
 *                                           -> user
 * Both retailer and user are direct children of distributor.
 */

export interface HierarchyChain {
  superDistributorId?: mongoose.Types.ObjectId | string;
  distributorId?: mongoose.Types.ObjectId | string;
}

export interface HierarchyValidationResult {
  isValid: boolean;
  error?: string;
  chain?: HierarchyChain;
}

/**
 * Get required hierarchy fields based on target role
 */
export function getRequiredHierarchyFields(targetRole: string): string[] {
  switch (targetRole) {
    case 'user':
      return ['superDistributorId', 'distributorId'];
    case 'retailer':
      return ['superDistributorId', 'distributorId'];
    case 'distributor':
      return ['superDistributorId'];
    case 'super_distributor':
      return [];
    case 'admin':
      return [];
    default:
      return [];
  }
}

/**
 * Check if a user can create a specific role
 */
export function canCreateRole(creatorRole: string, targetRole: string): boolean {
  const roleHierarchy: Record<string, string[]> = {
    admin: ['super_distributor', 'distributor', 'retailer', 'user'],
    super_distributor: ['distributor', 'retailer', 'user'],
    distributor: ['retailer', 'user'],
    retailer: [],
    user: [],
  };

  return roleHierarchy[creatorRole]?.includes(targetRole) || false;
}

/**
 * Get the immediate parent role for a given role
 */
export function getImmediateParentRole(targetRole: string): string | null {
  const parentMap: Record<string, string> = {
    super_distributor: 'admin',
    distributor: 'super_distributor',
    retailer: 'distributor',
    user: 'distributor',
  };

  return parentMap[targetRole] || null;
}

/**
 * Validate that a user exists and has the expected role
 */
export async function validateUserRole(
  userId: mongoose.Types.ObjectId | string,
  expectedRole: string
): Promise<{ isValid: boolean; error?: string; user?: any }> {
  try {
    const user = await User.findById(userId);

    if (!user) {
      return {
        isValid: false,
        error: `User with ID ${userId} not found`,
      };
    }

    if (user.role !== expectedRole) {
      return {
        isValid: false,
        error: `User ${user.username} is not a ${expectedRole} (current role: ${user.role})`,
      };
    }

    return {
      isValid: true,
      user,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Error validating user: ${error}`,
    };
  }
}

/**
 * Validate the complete hierarchy chain
 */
export async function validateHierarchyChain(
  chain: HierarchyChain,
  targetRole: string
): Promise<HierarchyValidationResult> {
  try {
    const { superDistributorId, distributorId } = chain;

    if (targetRole === 'user' || targetRole === 'retailer') {
      if (!superDistributorId || !distributorId) {
        return {
          isValid: false,
          error: `${targetRole === 'user' ? 'User' : 'Retailer'} creation requires Super Distributor and Distributor`,
        };
      }

      const sdValidation = await validateUserRole(superDistributorId, 'super_distributor');
      if (!sdValidation.isValid) {
        return { isValid: false, error: sdValidation.error };
      }

      const distValidation = await validateUserRole(distributorId, 'distributor');
      if (!distValidation.isValid) {
        return { isValid: false, error: distValidation.error };
      }

      if (distValidation.user.superDistributorId?.toString() !== superDistributorId.toString()) {
        return {
          isValid: false,
          error: `Distributor ${distValidation.user.username} is not under the selected Super Distributor`,
        };
      }

      return { isValid: true, chain };
    } else if (targetRole === 'distributor') {
      if (!superDistributorId) {
        return {
          isValid: false,
          error: 'Distributor creation requires Super Distributor',
        };
      }

      const sdValidation = await validateUserRole(superDistributorId, 'super_distributor');
      if (!sdValidation.isValid) {
        return { isValid: false, error: sdValidation.error };
      }

      return { isValid: true, chain };
    } else if (targetRole === 'super_distributor') {
      return { isValid: true, chain: {} };
    }

    return {
      isValid: false,
      error: 'Invalid target role',
    };
  } catch (error: any) {
    return {
      isValid: false,
      error: `Hierarchy validation error: ${error.message}`,
    };
  }
}

/**
 * Build hierarchy chain for a new user based on parent selection
 */
export async function buildHierarchyChain(
  parentId: mongoose.Types.ObjectId | string,
  targetRole: string
): Promise<HierarchyValidationResult> {
  try {
    const parent = await User.findById(parentId);

    if (!parent) {
      return {
        isValid: false,
        error: 'Parent user not found',
      };
    }

    const chain: HierarchyChain = {};

    if (targetRole === 'user' || targetRole === 'retailer') {
      if (parent.role !== 'distributor') {
        return {
          isValid: false,
          error: `${targetRole === 'user' ? 'Users' : 'Retailers'} must be created under a Distributor`,
        };
      }

      chain.distributorId = parent._id;
      chain.superDistributorId = parent.superDistributorId;
    } else if (targetRole === 'distributor') {
      if (parent.role !== 'super_distributor') {
        return {
          isValid: false,
          error: 'Distributors must be created under a Super Distributor',
        };
      }

      chain.superDistributorId = parent._id;
    } else if (targetRole === 'super_distributor') {
      if (parent.role !== 'admin') {
        return {
          isValid: false,
          error: 'Super Distributors must be created under an Admin',
        };
      }
    }

    return validateHierarchyChain(chain, targetRole);
  } catch (error: any) {
    return {
      isValid: false,
      error: `Error building hierarchy chain: ${error.message}`,
    };
  }
}
