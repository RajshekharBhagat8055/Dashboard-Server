import mongoose from 'mongoose';
import User from '../models/User';

/**
 * Apex hierarchy (mobile-first):
 * admin → super_distributor → distributor → retailer → user
 *
 * Each role may only create the next level down. Users log into the mobile app.
 */

export interface HierarchyChain {
  superDistributorId?: mongoose.Types.ObjectId | string;
  distributorId?: mongoose.Types.ObjectId | string;
  retailerId?: mongoose.Types.ObjectId | string;
}

export interface HierarchyInput {
  superDistributorId?: string;
  distributorId?: string;
  retailerId?: string;
}

export interface ResolvedHierarchy {
  parentId: mongoose.Types.ObjectId;
  superDistributorId?: mongoose.Types.ObjectId;
  distributorId?: mongoose.Types.ObjectId;
  retailerId?: mongoose.Types.ObjectId;
}

export interface HierarchyValidationResult {
  isValid: boolean;
  error?: string;
  chain?: HierarchyChain;
}

/**
 * Fields the client must pick in the create-user form (topmost parent only).
 * Lower levels are derived from the selected parent on the server.
 */
export function getRequiredHierarchyFields(
  targetRole: string,
  creatorRole?: string,
): string[] {
  switch (targetRole) {
    case 'distributor':
      return creatorRole === 'admin' ? ['superDistributorId'] : [];
    case 'retailer':
      if (creatorRole === 'admin' || creatorRole === 'super_distributor') {
        return ['distributorId'];
      }
      return [];
    case 'user':
      return creatorRole === 'admin' ? ['retailerId'] : [];
    default:
      return [];
  }
}

export function canCreateRole(creatorRole: string, targetRole: string): boolean {
  const roleHierarchy: Record<string, string[]> = {
    admin: ['super_distributor', 'distributor', 'retailer', 'user'],
    super_distributor: ['distributor', 'retailer'],
    distributor: ['retailer'],
    retailer: ['user'],
    user: [],
  };

  return roleHierarchy[creatorRole]?.includes(targetRole) || false;
}

export function getImmediateParentRole(targetRole: string): string | null {
  const parentMap: Record<string, string> = {
    super_distributor: 'admin',
    distributor: 'super_distributor',
    retailer: 'distributor',
    user: 'retailer',
  };

  return parentMap[targetRole] || null;
}

export async function validateUserRole(
  userId: mongoose.Types.ObjectId | string,
  expectedRole: string,
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
 * Resolve full hierarchy chain + parentId from creator context and optional parent pick.
 */
export async function resolveHierarchyForCreation(
  creator: {
    _id: mongoose.Types.ObjectId | string;
    role: string;
    superDistributorId?: mongoose.Types.ObjectId | string;
    distributorId?: mongoose.Types.ObjectId | string;
    retailerId?: mongoose.Types.ObjectId | string;
  },
  targetRole: string,
  input: HierarchyInput,
): Promise<{ isValid: boolean; error?: string; hierarchy?: ResolvedHierarchy }> {
  const creatorId = creator._id.toString();

  switch (targetRole) {
    case 'super_distributor': {
      if (creator.role !== 'admin') {
        return { isValid: false, error: 'Only admin can create super distributors' };
      }
      return {
        isValid: true,
        hierarchy: {
          parentId: new mongoose.Types.ObjectId(creatorId),
        },
      };
    }

    case 'distributor': {
      if (creator.role === 'super_distributor') {
        return {
          isValid: true,
          hierarchy: {
            parentId: new mongoose.Types.ObjectId(creatorId),
            superDistributorId: new mongoose.Types.ObjectId(creatorId),
          },
        };
      }
      if (creator.role === 'admin') {
        if (!input.superDistributorId) {
          return { isValid: false, error: 'Super Distributor is required' };
        }
        const sdValidation = await validateUserRole(input.superDistributorId, 'super_distributor');
        if (!sdValidation.isValid) {
          return { isValid: false, error: sdValidation.error };
        }
        return {
          isValid: true,
          hierarchy: {
            parentId: new mongoose.Types.ObjectId(input.superDistributorId),
            superDistributorId: new mongoose.Types.ObjectId(input.superDistributorId),
          },
        };
      }
      return { isValid: false, error: `${creator.role} cannot create distributor` };
    }

    case 'retailer': {
      if (creator.role === 'distributor') {
        if (!creator.superDistributorId) {
          return { isValid: false, error: 'Your account is missing super distributor information' };
        }
        return {
          isValid: true,
          hierarchy: {
            parentId: new mongoose.Types.ObjectId(creatorId),
            superDistributorId: new mongoose.Types.ObjectId(creator.superDistributorId.toString()),
            distributorId: new mongoose.Types.ObjectId(creatorId),
          },
        };
      }

      if (!input.distributorId) {
        return { isValid: false, error: 'Distributor is required' };
      }

      const distValidation = await validateUserRole(input.distributorId, 'distributor');
      if (!distValidation.isValid) {
        return { isValid: false, error: distValidation.error };
      }

      const distributor = distValidation.user;
      if (creator.role === 'super_distributor') {
        if (distributor.superDistributorId?.toString() !== creatorId) {
          return { isValid: false, error: 'Selected distributor is not under you' };
        }
      } else if (creator.role !== 'admin') {
        return { isValid: false, error: `${creator.role} cannot create retailer` };
      }

      if (!distributor.superDistributorId) {
        return { isValid: false, error: 'Selected distributor has no super distributor assigned' };
      }

      return {
        isValid: true,
        hierarchy: {
          parentId: distributor._id,
          superDistributorId: distributor.superDistributorId,
          distributorId: distributor._id,
        },
      };
    }

    case 'user': {
      if (creator.role === 'retailer') {
        if (!creator.distributorId || !creator.superDistributorId) {
          return { isValid: false, error: 'Your account is missing hierarchy information' };
        }
        return {
          isValid: true,
          hierarchy: {
            parentId: new mongoose.Types.ObjectId(creatorId),
            superDistributorId: new mongoose.Types.ObjectId(creator.superDistributorId.toString()),
            distributorId: new mongoose.Types.ObjectId(creator.distributorId.toString()),
            retailerId: new mongoose.Types.ObjectId(creatorId),
          },
        };
      }

      if (!input.retailerId) {
        return { isValid: false, error: 'Retailer is required' };
      }

      const retValidation = await validateUserRole(input.retailerId, 'retailer');
      if (!retValidation.isValid) {
        return { isValid: false, error: retValidation.error };
      }

      const retailer = retValidation.user;
      if (creator.role !== 'admin') {
        return { isValid: false, error: `${creator.role} cannot create mobile user` };
      }

      if (!retailer.distributorId || !retailer.superDistributorId) {
        return { isValid: false, error: 'Selected retailer has incomplete hierarchy' };
      }

      return {
        isValid: true,
        hierarchy: {
          parentId: retailer._id,
          superDistributorId: retailer.superDistributorId,
          distributorId: retailer.distributorId,
          retailerId: retailer._id,
        },
      };
    }

    default:
      return { isValid: false, error: 'Invalid target role' };
  }
}

/** @deprecated Use resolveHierarchyForCreation instead */
export async function validateHierarchyChain(
  chain: HierarchyChain,
  targetRole: string,
): Promise<HierarchyValidationResult> {
  try {
    if (targetRole === 'retailer') {
      if (!chain.distributorId) {
        return { isValid: false, error: 'Distributor is required for retailer' };
      }
      const distValidation = await validateUserRole(chain.distributorId, 'distributor');
      if (!distValidation.isValid) {
        return { isValid: false, error: distValidation.error };
      }
      return { isValid: true, chain };
    }

    if (targetRole === 'user') {
      if (!chain.retailerId) {
        return { isValid: false, error: 'Retailer is required for mobile user' };
      }
      const retValidation = await validateUserRole(chain.retailerId, 'retailer');
      if (!retValidation.isValid) {
        return { isValid: false, error: retValidation.error };
      }
      return { isValid: true, chain };
    }

    if (targetRole === 'distributor') {
      if (!chain.superDistributorId) {
        return { isValid: false, error: 'Super Distributor is required for distributor' };
      }
      const sdValidation = await validateUserRole(chain.superDistributorId, 'super_distributor');
      if (!sdValidation.isValid) {
        return { isValid: false, error: sdValidation.error };
      }
      return { isValid: true, chain };
    }

    if (targetRole === 'super_distributor') {
      return { isValid: true, chain: {} };
    }

    return { isValid: false, error: 'Invalid target role' };
  } catch (error: any) {
    return {
      isValid: false,
      error: `Hierarchy validation error: ${error.message}`,
    };
  }
}

/** @deprecated Use resolveHierarchyForCreation instead */
export async function buildHierarchyChain(
  parentId: mongoose.Types.ObjectId | string,
  targetRole: string,
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

    if (targetRole === 'retailer') {
      if (parent.role !== 'distributor') {
        return {
          isValid: false,
          error: 'Retailers must be created under a Distributor',
        };
      }
      chain.distributorId = parent._id;
      chain.superDistributorId = parent.superDistributorId;
    } else if (targetRole === 'user') {
      if (parent.role !== 'retailer') {
        return {
          isValid: false,
          error: 'Mobile users must be created under a Retailer',
        };
      }
      chain.retailerId = parent._id;
      chain.distributorId = parent.distributorId;
      chain.superDistributorId = parent.superDistributorId;
    } else if (targetRole === 'distributor') {
      if (parent.role !== 'super_distributor') {
        return {
          isValid: false,
          error: 'Distributors must be created under a Super Distributor',
        };
      }
      chain.superDistributorId = parent._id;
    }

    return validateHierarchyChain(chain, targetRole);
  } catch (error: any) {
    return {
      isValid: false,
      error: `Error building hierarchy chain: ${error.message}`,
    };
  }
}
