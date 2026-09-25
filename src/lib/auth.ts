// Role-based auth across multiple businesses (tenants).
// Phone = user ID. Each business has its own admin + employees.

import {
  listTenants, setActiveTenant, upsertTenantLocally, seedNewTenantStore,
  LEGACY_STORE_KEY, type Tenant,
} from "@/lib/tenant";
import { sb_fetchTenantByPhone } from "@/lib/tenant-supabase";
import { reloadStore, actions } from "@/lib/store";

export type Role = "Admin" | "Manager" | "Cashier" | "Pharmacist";

export type AuthUser = {
  id: string;         // Employee ID e.g. E001 or "ADMIN"
  phone: string;      // login username
  name: string;
  role: Role;
  store: string;
  tenantId?: string;
  isMainAdmin?: boolean;
};

const KEY = "rsp_auth_user";

// Legacy demo admin (ANAM Medical Store) — kept for existing installs.
export const MAIN_ADMIN = {
  id: "ADMIN",
  phone: "9876543210",
  password: "anam@2026",
  name: "Manjju",
  role: "Admin" as Role,
  store: "ANAM Medical Store",
};

const LEGACY_EMAIL = "manjju@anam.com";

type EmployeeRecord = { id: string; name: string; role: string; phone: string; password?: string; active?: boolean };

function readEmployeesOf(t: Tenant): EmployeeRecord[] {
  try {
    const raw = localStorage.getItem(t.storeKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return (parsed?.employees ?? []) as EmployeeRecord[];
  } catch {
    return [];
  }
}

function commit(user: AuthUser, remember: boolean): AuthUser {
  (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(user));
  if (user.tenantId) {
    setActiveTenant(user.tenantId);
    reloadStore();
  }
  return user;
}

export async function login(usernameOrPhone: string, password: string, remember: boolean): Promise<AuthUser | null> {
  const u = usernameOrPhone.trim();
  const uLower = u.toLowerCase();

  // 1. Check Supabase public.tenants table for the shop/business owner
  try {
    const { tenant, error } = await sb_fetchTenantByPhone(u);
    if (!error && tenant) {
      if (tenant.active && tenant.admin.password === password) {
        upsertTenantLocally(tenant);
        seedNewTenantStore(tenant);

        const authUser: AuthUser = {
          id: "ADMIN",
          phone: tenant.admin.phone,
          name: tenant.admin.name,
          role: "Admin",
          store: tenant.name,
          tenantId: tenant.id,
          isMainAdmin: tenant.storeKey === LEGACY_STORE_KEY,
        };
        return commit(authUser, remember);
      }
    }
  } catch (err) {
    console.error("[auth] Supabase client lookup error:", err);
  }

  // 2. Fallback to local store / in-memory tenants (and staff/employee logins)
  for (const t of listTenants()) {
    if (!t.active) continue;

    // Business owner / admin login
    const isLegacyEmail = t.admin.phone === MAIN_ADMIN.phone && uLower === LEGACY_EMAIL;
    if ((uLower === t.admin.phone.toLowerCase() || isLegacyEmail) && password === t.admin.password) {
      return commit({
        id: "ADMIN", phone: t.admin.phone, name: t.admin.name,
        role: "Admin", store: t.name, tenantId: t.id, isMainAdmin: t.id === "T001" || t.storeKey === LEGACY_STORE_KEY,
      }, remember);
    }

    // Staff logins for this business
    const match = readEmployeesOf(t).find(
      (e) => e.phone.trim().toLowerCase() === uLower && (e.password ?? "") === password && (e.active ?? true),
    );
    if (match) {
      return commit({
        id: match.id, phone: match.phone, name: match.name,
        role: normalizeRole(match.role), store: t.name, tenantId: t.id,
      }, remember);
    }
  }

  return null;
}

function normalizeRole(r: string): Role {
  const x = r.toLowerCase();
  if (x.includes("admin")) return "Admin";
  if (x.includes("manag")) return "Manager";
  if (x.includes("pharm")) return "Pharmacist";
  return "Cashier";
}


export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function logout() {
  const u = getUser();
  if (u) {
    actions.logLogout({ id: u.id, name: u.name });
  }
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
}

export function updateStoredUser(patch: Partial<AuthUser>) {
  const u = getUser();
  if (!u) return;
  const next = { ...u, ...patch };
  const store = localStorage.getItem(KEY) ? localStorage : sessionStorage;
  store.setItem(KEY, JSON.stringify(next));
}

export function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Role-based capability map
export const CAN: Record<Role, {
  billing: boolean;
  sales: boolean;
  cancelBill: boolean;
  purchase: boolean;
  inventory: boolean;
  medicines: boolean;
  customers: boolean;
  suppliers: boolean;
  employees: boolean;
  reports: boolean;
  gst: boolean;
  accounts: boolean;
  barcode: boolean;
  qr: boolean;
  settings: boolean;
  backup: boolean;
  audit: boolean;
  dashboard: boolean;
}> = {
  Admin:      { billing: true, sales: true, cancelBill: true, purchase: true, inventory: true, medicines: true, customers: true, suppliers: true, employees: true, reports: true, gst: true, accounts: true, barcode: true, qr: true, settings: true, backup: true, audit: true, dashboard: true },
  Manager:    { billing: true, sales: true, cancelBill: true, purchase: true, inventory: true, medicines: true, customers: true, suppliers: true, employees: false, reports: true, gst: true, accounts: true, barcode: true, qr: true, settings: false, backup: true, audit: true, dashboard: true },
  Pharmacist: { billing: true, sales: true, cancelBill: false, purchase: true, inventory: true, medicines: true, customers: true, suppliers: false, employees: false, reports: false, gst: false, accounts: false, barcode: true, qr: true, settings: false, backup: false, audit: false, dashboard: true },
  Cashier:    { billing: true, sales: true, cancelBill: false, purchase: false, inventory: false, medicines: false, customers: true, suppliers: false, employees: false, reports: false, gst: false, accounts: false, barcode: false, qr: true, settings: false, backup: false, audit: false, dashboard: true },
};

export const DEMO_CREDENTIALS = { phone: MAIN_ADMIN.phone, password: MAIN_ADMIN.password };
