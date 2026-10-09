import type { PermissionState, User } from '../types';
export function can(permissions: PermissionState | undefined, permission: string) {
  if (!permissions) return false;
  return (
    !permissions.denied.includes(permission) &&
    !permissions.denied.includes('*:*') &&
    (permissions.granted.includes('*:*') || permissions.granted.includes(permission))
  );
}
export const canUser = (user: User | undefined, permission: string) =>
  can(user?.permissions, permission);
