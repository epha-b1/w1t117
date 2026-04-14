import type { UserRole } from '../types/auth.types';

export const ROLE_ACCESS: Record<string, UserRole[]> = {
  leads: ['administrator', 'sales_coordinator', 'planner', 'dispatcher'],
  plans: ['administrator', 'sales_coordinator', 'planner', 'dispatcher'],
  deliveries: ['administrator', 'sales_coordinator', 'planner', 'dispatcher'],
  ledger: ['administrator', 'sales_coordinator', 'planner', 'dispatcher', 'auditor'],
  notifications: ['administrator', 'sales_coordinator', 'planner', 'dispatcher'],
  audit: ['administrator', 'auditor'],
  admin_users: ['administrator'],
  backup: ['administrator'],
  jobs: ['administrator', 'planner', 'dispatcher']
};

export function canAccess(area: keyof typeof ROLE_ACCESS, role: UserRole | null): boolean {
  if (!role) return false;
  return ROLE_ACCESS[area].includes(role);
}

export function defaultRouteFor(role: UserRole | null): string {
  switch (role) {
    case 'administrator':
    case 'sales_coordinator':
      return '/leads';
    case 'planner':
      return '/plans';
    case 'dispatcher':
      return '/deliveries';
    case 'auditor':
      return '/audit';
    default:
      return '/login';
  }
}
