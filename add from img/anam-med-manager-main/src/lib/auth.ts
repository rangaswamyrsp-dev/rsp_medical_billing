// Role-based auth across multiple businesses (tenants).
// Phone = user ID. Each business has its own admin + employees.

import { listTenants, setActiveTenant, type Tenant } from "@/lib/tenant";
import { reloadStore } from "@/lib/store";

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

export function login(usernameOrPhone: string, password: string, remember: boolean): AuthUser | null {
  const u = usernameOrPhone.trim().toLowerCase();

  for (const t of listTenants()) {
    if (!t.active) continue;

    // Business owner / admin login
    const isLegacyEmail = t.admin.phone === MAIN_ADMIN.phone && u === LEGACY_EMAIL;
    if ((u === t.admin.phone.toLowerCase() || isLegacyEmail) && password === t.admin.password) {
      return commit({
        id: "ADMIN", phone: t.admin.phone, name: t.admin.name,
        role: "Admin", store: t.name, tenantId: t.id, isMainAdmin: true,
      }, remember);
    }

    // Staff logins for this business
    const match = readEmployeesOf(t).find(
      (e) => e.phone.trim().toLowerCase() === u && (e.password ?? "") === password && (e.active ?? true),
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
