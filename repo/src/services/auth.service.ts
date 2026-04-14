import { getAll, getByIndex, put } from './db';
import { uid } from '../utils/uid';
import { hashPassword, verifyPassword } from '../utils/crypto';
import { lsGet, lsSet, LS_KEYS } from '../utils/local-storage';
import {
  setSession,
  clearSession,
  getCurrentSession,
  refreshSession
} from '../stores/session.store';
import type { Session, User, UserRole } from '../types/auth.types';
import * as audit from './audit.service';
import { authorize } from './authz.service';

const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'Admin@12345',
  role: 'administrator' as UserRole
};

const ANOMALY_WINDOW_MS = 5 * 60 * 1000;
const ANOMALY_THRESHOLD = 10;

async function findByUsername(username: string): Promise<User | undefined> {
  return await getByIndex('users', 'by_username', username);
}

export async function listUsers(): Promise<User[]> {
  return await getAll('users');
}

export async function ensureFirstRunSeed(): Promise<{ seeded: boolean }> {
  const users = await listUsers();
  if (users.length > 0) return { seeded: false };
  const { hash, salt } = await hashPassword(DEFAULT_ADMIN.password);
  const now = Date.now();
  const admin: User = {
    id: uid(),
    username: DEFAULT_ADMIN.username,
    passwordHash: hash,
    salt,
    role: DEFAULT_ADMIN.role,
    isActive: true,
    createdAt: now,
    updatedAt: now
  };
  await put('users', admin);
  await audit.log({
    actor: 'system',
    action: 'first_run_seed',
    resourceType: 'user',
    resourceId: admin.id,
    detail: { username: admin.username, role: admin.role }
  });
  return { seeded: true };
}

export async function register(
  username: string,
  password: string,
  role: UserRole,
  actorId: string
): Promise<User> {
  await authorize(actorId, 'user:create');
  const existing = await findByUsername(username);
  if (existing) throw new Error('Username already exists');
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  const { hash, salt } = await hashPassword(password);
  const now = Date.now();
  const user: User = {
    id: uid(),
    username,
    passwordHash: hash,
    salt,
    role,
    isActive: true,
    createdAt: now,
    updatedAt: now
  };
  await put('users', user);
  await audit.log({
    actor: actorId,
    action: 'user_created',
    resourceType: 'user',
    resourceId: user.id,
    detail: { username, role }
  });
  return user;
}

export async function updateUser(
  userId: string,
  patch: Partial<Pick<User, 'role' | 'isActive'>>,
  actorId: string
): Promise<User> {
  await authorize(actorId, 'user:update');
  const users = await listUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error('User not found');
  const before = { role: user.role, isActive: user.isActive };
  const updated: User = {
    ...user,
    role: patch.role ?? user.role,
    isActive: patch.isActive ?? user.isActive,
    updatedAt: Date.now()
  };
  await put('users', updated);
  const after = { role: updated.role, isActive: updated.isActive };
  if (before.role !== after.role) {
    await audit.log({
      actor: actorId,
      action: 'role_change',
      resourceType: 'user',
      resourceId: userId,
      detail: { before, after }
    });
  }
  if (before.isActive !== after.isActive) {
    await audit.log({
      actor: actorId,
      action: 'user_active_toggle',
      resourceType: 'user',
      resourceId: userId,
      detail: { before, after }
    });
  }
  return updated;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (newPassword.length < 8) throw new Error('Password must be at least 8 characters');
  const users = await listUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error('User not found');
  const ok = await verifyPassword(currentPassword, user.passwordHash, user.salt);
  if (!ok) throw new Error('Current password does not match');
  const { hash, salt } = await hashPassword(newPassword);
  const updated: User = { ...user, passwordHash: hash, salt, updatedAt: Date.now() };
  await put('users', updated);
  await audit.log({
    actor: userId,
    action: 'password_change',
    resourceType: 'user',
    resourceId: userId,
    detail: {}
  });
}

function recordFailedLogin(): number {
  const now = Date.now();
  const list = lsGet<number[]>(LS_KEYS.FAILED_LOGINS) ?? [];
  const pruned = [...list.filter((t) => now - t < ANOMALY_WINDOW_MS), now];
  lsSet(LS_KEYS.FAILED_LOGINS, pruned);
  return pruned.length;
}

export function getRecentFailedLoginCount(): number {
  const now = Date.now();
  const list = lsGet<number[]>(LS_KEYS.FAILED_LOGINS) ?? [];
  return list.filter((t) => now - t < ANOMALY_WINDOW_MS).length;
}

export function resetFailedLogins(): void {
  lsSet(LS_KEYS.FAILED_LOGINS, []);
}

export async function login(username: string, password: string): Promise<Session> {
  const user = await findByUsername(username);
  if (!user || !user.isActive) {
    const count = recordFailedLogin();
    await audit.log({
      actor: username || 'unknown',
      action: 'failed_login',
      resourceType: 'user',
      resourceId: user?.id ?? '',
      detail: { reason: !user ? 'unknown_user' : 'inactive', recentFailures: count }
    });
    if (count > ANOMALY_THRESHOLD) {
      await audit.log({
        actor: 'system',
        action: 'anomaly_failed_logins',
        resourceType: 'user',
        resourceId: '',
        detail: { count, windowMs: ANOMALY_WINDOW_MS }
      });
    }
    throw new Error('Invalid credentials');
  }
  const ok = await verifyPassword(password, user.passwordHash, user.salt);
  if (!ok) {
    const count = recordFailedLogin();
    await audit.log({
      actor: user.id,
      action: 'failed_login',
      resourceType: 'user',
      resourceId: user.id,
      detail: { reason: 'bad_password', recentFailures: count }
    });
    if (count > ANOMALY_THRESHOLD) {
      await audit.log({
        actor: 'system',
        action: 'anomaly_failed_logins',
        resourceType: 'user',
        resourceId: '',
        detail: { count, windowMs: ANOMALY_WINDOW_MS }
      });
    }
    throw new Error('Invalid credentials');
  }
  resetFailedLogins();
  setSession({ userId: user.id, username: user.username, role: user.role });
  const session = getCurrentSession()!;
  await audit.log({
    actor: user.id,
    action: 'login',
    resourceType: 'user',
    resourceId: user.id,
    detail: {}
  });
  return session;
}

export async function logout(): Promise<void> {
  const s = getCurrentSession();
  clearSession();
  if (s) {
    await audit.log({
      actor: s.userId,
      action: 'logout',
      resourceType: 'user',
      resourceId: s.userId,
      detail: {}
    });
  }
}

export function getSession(): Session | null {
  return getCurrentSession();
}

export function refresh(): void {
  refreshSession();
}

export const authService = {
  register,
  login,
  logout,
  getSession,
  refresh,
  changePassword,
  getRecentFailedLoginCount,
  listUsers,
  updateUser,
  ensureFirstRunSeed
};
