export type PermissionState = { granted: string[]; denied: string[] };
export type Scope = { scope_type: 'city' | 'department' | 'equipment_type'; scope_value: string };
export type User = {
  id: number;
  name: string;
  email: string;
  profile_base: string;
  must_change_password: boolean;
  totp_enabled: boolean;
  permissions: PermissionState;
  scopes: Scope[];
};
export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type Employee = {
  id: number;
  code?: string;
  name: string;
  email?: string;
  city?: string;
  department?: string;
  status: string;
  corporate_phone?: string;
  created_at?: string;
};
export type Asset = {
  id: number;
  hostname?: string;
  equipment_type: string;
  model?: string;
  serial?: string;
  reference?: string;
  status: string;
  employee_name?: string;
  city?: string;
  updated_at?: string;
};
export type Approval = {
  id: number;
  type: string;
  status: string;
  requester_name?: string;
  requester_user_id: number;
  justification: string;
  created_at: string;
  employee_id?: number;
};
export type ApiError = { code: string; message: string; details?: unknown };
