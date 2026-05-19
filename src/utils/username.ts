import User, { type IUser } from '../models/User';
import type { HydratedDocument } from 'mongoose';

/** Trim whitespace only; preserve letter casing (e.g. AS1 stays AS1). */
export function trimUsername(username: string): string {
  return username.trim();
}

/** Case-insensitive lookup (AS1 matches stored as1 and vice versa). */
export async function findUserByUsername(
  username: string
): Promise<HydratedDocument<IUser> | null> {
  const trimmed = trimUsername(username);
  if (!trimmed) return null;

  return User.findOne({ username: trimmed }).collation({ locale: 'en', strength: 2 });
}
