import { get } from './db';
import type { User, UserRole } from '../types/auth.types';

export type AuthzAction =
  // Users / auth
  | 'user:create'
  | 'user:update'
  | 'user:change_password'
  // Leads
  | 'lead:create'
  | 'lead:update'
  | 'lead:status'
  // Plans / BOM
  | 'plan:create'
  | 'plan:update'
  | 'plan:bom_mutate'
  | 'plan:version'
  | 'plan:rollback'
  | 'plan:share'
  // Deliveries
  | 'delivery:create'
  | 'delivery:schedule'
  | 'delivery:pod'
  | 'delivery:exception'
  | 'delivery:cancel'
  | 'delivery:export_queue'
  // Ledger
  | 'ledger:create'
  | 'ledger:mutate'
  | 'ledger:reconcile'
  | 'ledger:read'
  // Backup
  | 'backup:export'
  | 'backup:import'
  // Notifications
  | 'notification:settings'
  | 'notification:retry'
  // Jobs
  | 'job:enqueue'
  | 'job:cancel'
  // Audit
  | 'audit:read';

const ALL_ROLES: UserRole[] = [
  'administrator',
  'sales_coordinator',
  'planner',
  'dispatcher',
  'auditor'
];

const OPERATOR_ROLES: UserRole[] = ['administrator', 'sales_coordinator', 'planner', 'dispatcher'];

export const ACTION_PERMISSIONS: Record<AuthzAction, UserRole[]> = {
  'user:create': ['administrator'],
  'user:update': ['administrator'],
  'user:change_password': ALL_ROLES,

  'lead:create': ['administrator', 'sales_coordinator'],
  'lead:update': ['administrator', 'sales_coordinator'],
  'lead:status': ['administrator', 'sales_coordinator'],

  'plan:create': ['administrator', 'planner'],
  'plan:update': ['administrator', 'planner'],
  'plan:bom_mutate': ['administrator', 'planner'],
  'plan:version': ['administrator', 'planner'],
  'plan:rollback': ['administrator', 'planner'],
  'plan:share': ['administrator', 'planner'],

  'delivery:create': ['administrator', 'dispatcher', 'planner'],
  'delivery:schedule': ['administrator', 'dispatcher'],
  'delivery:pod': ['administrator', 'dispatcher'],
  'delivery:exception': ['administrator', 'dispatcher'],
  'delivery:cancel': ['administrator', 'dispatcher'],
  'delivery:export_queue': ['administrator', 'dispatcher'],

  'ledger:create': ['administrator', 'sales_coordinator'],
  'ledger:mutate': ['administrator', 'sales_coordinator', 'planner', 'dispatcher'],
  'ledger:reconcile': ['administrator', 'sales_coordinator', 'planner', 'dispatcher'],
  'ledger:read': ['administrator', 'sales_coordinator', 'planner', 'dispatcher', 'auditor'],

  'backup:export': ['administrator'],
  'backup:import': ['administrator'],

  'notification:settings': OPERATOR_ROLES,
  'notification:retry': OPERATOR_ROLES,

  'job:enqueue': ['administrator', 'planner', 'dispatcher'],
  'job:cancel': ['administrator', 'planner', 'dispatcher'],

  'audit:read': ['administrator', 'auditor']
};

export class AuthorizationError extends Error {
  code = 'UNAUTHORIZED';
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export async function authorize(actorId: string | undefined, action: AuthzAction): Promise<void> {
  if (!actorId) {
    throw new AuthorizationError(`Not authorized: missing actor for ${action}`);
  }
  if (actorId === 'system') return;
  const user = (await get('users', actorId)) as User | undefined;
  if (!user) {
    throw new AuthorizationError(`Not authorized: unknown actor for ${action}`);
  }
  if (!user.isActive) {
    throw new AuthorizationError(`Not authorized: actor inactive for ${action}`);
  }
  const allowed = ACTION_PERMISSIONS[action];
  if (!allowed || !allowed.includes(user.role)) {
    throw new AuthorizationError(
      `Role ${user.role} is not permitted to ${action}`
    );
  }
}

export async function can(actorId: string | undefined, action: AuthzAction): Promise<boolean> {
  try {
    await authorize(actorId, action);
    return true;
  } catch {
    return false;
  }
}

export const authzService = {
  authorize,
  can,
  ACTION_PERMISSIONS,
  AuthorizationError
};
