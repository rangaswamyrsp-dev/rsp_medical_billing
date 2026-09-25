// Multi-business (client) registry. Each business = one tenant with its own
// isolated data key in localStorage. The super admin only ever sees tenant
// accounts + feature flags — never any client business data.

import { useEffect, useSyncExternalStore } from "react";

export type BusinessType = "Medical" | "Hotel" | "Supermarket" | "Garage";

export const BUSINESS_TYPES: { value: BusinessType; label: string; hint: string }[] = [
  { value: "Medical", label: "Medical / Pharmacy", hint: "Batches, expiry, FEFO, GST, low-stock alerts" },
  { value: "Hotel", label: "Hotel / Restaurant", hint: "Menu items, fast counter billing, no customer details" },
  { value: "Supermarket", label: "Supermarket", hint: "Barcode items, stock, low-stock alerts" },
  { value: "Garage", label: "Bike Garage", hint: "Parts & services, job billing" },
];

/** Feature flags. Module flags match sidebar capability names. */
export type Features = {
  // modules
  dashboard: boolean;
  billing: boolean;
  sales: boolean;
  purchase: boolean;
  inventory: boolean;
  medicines: boolean; // "items" master (menu / products / parts)
  customers: boolean;
  suppliers: boolean;
  employees: boolean;
  reports: boolean;
  gst: boolean;
  accounts: boolean;
  audit: boolean;
  barcode: boolean;
  qr: boolean;
  help: boolean;
  settings: boolean;
  backup: boolean;
  // behaviour
  lowStockAlerts: boolean;
  expiryTracking: boolean;
  batchTracking: boolean;
  customerCapture: boolean;
  doctorField: boolean;
  helpAssistant: boolean;
};

export type FeatureKey = keyof Features;

export const FEATURE_GROUPS: { title: string; keys: { key: FeatureKey; label: string }[] }[] = [
  {
    title: "Modules",
    keys: [
      { key: "dashboard", label: "Dashboard" },
      { key: "billing", label: "Billing" },
      { key: "sales", label: "Sales / Invoices" },
      { key: "purchase", label: "Purchase" },
      { key: "inventory", label: "Inventory" },
      { key: "medicines", label: "Item master" },
      { key: "customers", label: "Customers" },
      { key: "suppliers", label: "Suppliers" },
      { key: "employees", label: "Employees" },
      { key: "reports", label: "Reports" },
      { key: "gst", label: "GST" },
      { key: "accounts", label: "Accounts" },
      { key: "audit", label: "Audit log" },
      { key: "barcode", label: "Barcode labels" },
      { key: "qr", label: "UPI QR" },
      { key: "help", label: "Help & guide" },
      { key: "settings", label: "Settings" },
      { key: "backup", label: "Backup" },
    ],
  },
  {
    title: "Behaviour",
    keys: [
      { key: "lowStockAlerts", label: "Low-stock alerts" },
      { key: "expiryTracking", label: "Expiry tracking" },
      { key: "batchTracking", label: "Batch numbers" },
      { key: "customerCapture", label: "Ask customer details on bill" },
      { key: "doctorField", label: "Doctor field" },
      { key: "helpAssistant", label: "Floating help assistant" },
    ],
  },
];

const ALL_ON: Features = {
  dashboard: true, billing: true, sales: true, purchase: true, inventory: true,
  medicines: true, customers: true, suppliers: true, employees: true, reports: true,
  gst: true, accounts: true, audit: true, barcode: true, qr: true, help: true,
  settings: true, backup: true,
  lowStockAlerts: true, expiryTracking: true, batchTracking: true,
  customerCapture: true, doctorField: true, helpAssistant: true,
};

export function defaultFeatures(type: BusinessType): Features {
  switch (type) {
    case "Hotel":
      return {
        ...ALL_ON,
        barcode: false,
        customers: false,
        lowStockAlerts: false,
        expiryTracking: false,
        batchTracking: false,
        customerCapture: false,
        doctorField: false,
        helpAssistant: false,
      };
    case "Supermarket":
      return {
        ...ALL_ON,
        batchTracking: false,
        doctorField: false,
        helpAssistant: false,
      };
    case "Garage":
      return {
        ...ALL_ON,
        barcode: false,
        expiryTracking: false,
        batchTracking: false,
        doctorField: false,
        helpAssistant: false,
      };
    default:
      return { ...ALL_ON };
  }
}

/** Wording per business type. */
export type TypeCopy = {
  item: string;        // singular
  items: string;       // plural / module label
  itemsIcon: "pill" | "utensils" | "shoppingBasket" | "wrench";
  billTitle: string;
  searchHint: string;
};

export const TYPE_COPY: Record<BusinessType, TypeCopy> = {
  Medical: { item: "Medicine", items: "Medicines", itemsIcon: "pill", billTitle: "Billing", searchHint: "Search medicine name, salt, batch or scan…" },
  Hotel: { item: "Menu item", items: "Menu Items", itemsIcon: "utensils", billTitle: "Order Billing", searchHint: "Search dish or menu item…" },
  Supermarket: { item: "Product", items: "Products", itemsIcon: "shoppingBasket", billTitle: "Counter Billing", searchHint: "Search product or scan barcode…" },
  Garage: { item: "Part / Service", items: "Parts & Services", itemsIcon: "wrench", billTitle: "Job Billing", searchHint: "Search part or service…" },
};

export type Tenant = {
  id: string;
  name: string;
  type: BusinessType;
  storeKey: string;
  admin: { name: string; phone: string; password: string };
  features: Features;
  active: boolean;
  createdAt: string;
};

export const SUPER_ADMIN = {
  name: "RSP Super Admin",
  phone: "9000000000",
  password: "rsp@super",
};

const TENANTS_KEY = "rsp_tenants_v1";
const ACTIVE_KEY = "rsp_active_tenant";
const SUPER_KEY = "rsp_super_session";
export const LEGACY_STORE_KEY = "rsp_store_v1";

const LEGACY_TENANT: Tenant = {
  id: "T001",
  name: "ANAM Medical Store",
  type: "Medical",
  storeKey: LEGACY_STORE_KEY,
  admin: { name: "Manjju", phone: "9876543210", password: "anam@2026" },
  features: defaultFeatures("Medical"),
  active: true,
  createdAt: "2026-01-01",
};

let tenants: Tenant[] = [LEGACY_TENANT];
let activeId: string = LEGACY_TENANT.id;
let loaded = false;
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

function loadTenants() {
  if (loaded || typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(TENANTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Tenant[];
      if (Array.isArray(parsed) && parsed.length) {
        tenants = parsed.map((t) => ({ ...t, features: { ...defaultFeatures(t.type), ...t.features } }));
      }
    } else {
      localStorage.setItem(TENANTS_KEY, JSON.stringify(tenants));
    }
    activeId = localStorage.getItem(ACTIVE_KEY) ?? tenants[0].id;
    if (!tenants.find((t) => t.id === activeId)) activeId = tenants[0].id;
  } catch {
    /* keep defaults */
  }
  loaded = true;
}

function persistTenants() {
  if (typeof window === "undefined") return;
  localStorage.setItem(TENANTS_KEY, JSON.stringify(tenants));
}

export function listTenants(): Tenant[] {
  loadTenants();
  return tenants;
}

export function getActiveTenant(): Tenant {
  loadTenants();
  return tenants.find((t) => t.id === activeId) ?? tenants[0];
}

export function getActiveStoreKey(): string {
  return getActiveTenant().storeKey;
}

export function setActiveTenant(id: string) {
  loadTenants();
  activeId = id;
  if (typeof window !== "undefined") localStorage.setItem(ACTIVE_KEY, id);
  emit();
}

export function upsertTenantLocally(tenant: Tenant): void {
  loadTenants();
  const idx = tenants.findIndex((t) => t.id === tenant.id);
  if (idx >= 0) {
    tenants[idx] = { ...tenants[idx], ...tenant };
  } else {
    tenants = [tenant, ...tenants];
  }
  persistTenants();
  emit();
}

export function createTenant(input: {
  name: string; type: BusinessType; adminName: string; adminPhone: string; adminPassword: string;
}): Tenant {
  loadTenants();
  const id = "T" + (Date.now() % 1000000).toString().padStart(6, "0");
  const tenant: Tenant = {
    id,
    name: input.name.trim(),
    type: input.type,
    storeKey: `rsp_store::${id}`,
    admin: { name: input.adminName.trim(), phone: input.adminPhone.trim(), password: input.adminPassword },
    features: defaultFeatures(input.type),
    active: true,
    createdAt: new Date().toISOString(),
  };
  tenants = [tenant, ...tenants];
  persistTenants();
  // Seed a completely empty dataset with just the owner/admin employee.
  if (typeof window !== "undefined") {
    localStorage.setItem(tenant.storeKey, JSON.stringify({
      medicines: [], customers: [], suppliers: [], sales: [], purchases: [], audit: [], held: [],
      employees: [{
        id: "E001", name: tenant.admin.name, role: "Admin", phone: tenant.admin.phone,
        salary: 0, password: tenant.admin.password, active: true, createdAt: tenant.createdAt,
      }],
      printer: {
        paperSize: "80mm", storeName: tenant.name, storeAddress: "", storePhone: tenant.admin.phone,
        gstin: "", drugLicense: "", footer: "Thank you, visit again!", showLogo: true, copies: 1, autoPrint: false,
      },
    }));
  }
  emit();
  return tenant;
}

export function updateTenant(id: string, patch: Partial<Omit<Tenant, "id" | "storeKey">>) {
  loadTenants();
  tenants = tenants.map((t) => (t.id === id ? { ...t, ...patch, features: { ...t.features, ...(patch.features ?? {}) } } : t));
  persistTenants();
  emit();
}

export function setFeature(id: string, key: FeatureKey, value: boolean) {
  loadTenants();
  tenants = tenants.map((t) => (t.id === id ? { ...t, features: { ...t.features, [key]: value } } : t));
  persistTenants();
  emit();
}

export function deleteTenant(id: string) {
  loadTenants();
  const t = tenants.find((x) => x.id === id);
  if (!t || t.storeKey === LEGACY_STORE_KEY) return;
  tenants = tenants.filter((x) => x.id !== id);
  if (typeof window !== "undefined") localStorage.removeItem(t.storeKey);
  if (activeId === id) setActiveTenant(tenants[0]?.id ?? LEGACY_TENANT.id);
  persistTenants();
  emit();
}

/* ---------- super admin session ---------- */

export function loginSuperAdmin(phone: string, password: string): boolean {
  if (phone.trim() !== SUPER_ADMIN.phone || password !== SUPER_ADMIN.password) return false;
  if (typeof window !== "undefined") sessionStorage.setItem(SUPER_KEY, "1");
  return true;
}
export function isSuperAdmin(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SUPER_KEY) === "1";
}
export function logoutSuperAdmin() {
  if (typeof window !== "undefined") sessionStorage.removeItem(SUPER_KEY);
}

/* ---------- react bindings ---------- */

function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }

export function useTenant(): Tenant {
  useEffect(() => { loadTenants(); emit(); }, []);
  return useSyncExternalStore(subscribe, getActiveTenant, () => LEGACY_TENANT);
}

export function useTenants(): Tenant[] {
  useEffect(() => { loadTenants(); emit(); }, []);
  return useSyncExternalStore(subscribe, listTenants, () => [LEGACY_TENANT]);
}

export function useFeatures(): Features {
  return useTenant().features;
}

export function useTypeCopy(): TypeCopy {
  return TYPE_COPY[useTenant().type];
}

// ── Super Admin helpers (used by superadmin.tsx + tenant-supabase.ts) ─────────

/**
 * Build a new Tenant object from form input WITHOUT any side effects.
 * Does not write to localStorage or emit. Call sb_insertTenant() then
 * seedNewTenantStore() after a successful Supabase insert.
 */
export function buildNewTenant(input: {
  name: string; type: BusinessType; adminName: string; adminPhone: string; adminPassword: string;
}): Tenant {
  const id = "T" + (Date.now() % 1000000).toString().padStart(6, "0");
  return {
    id,
    name: input.name.trim(),
    type: input.type,
    storeKey: `rsp_store::${id}`,
    admin: { name: input.adminName.trim(), phone: input.adminPhone.trim(), password: input.adminPassword },
    features: defaultFeatures(input.type),
    active: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Seed the billing localStorage store for a newly created tenant so the
 * owner can log in immediately. Mirrors the seeding previously inside createTenant().
 */
export function seedNewTenantStore(tenant: Tenant): void {
  if (typeof window === "undefined") return;
  // Only seed if there is no existing data for this key
  if (localStorage.getItem(tenant.storeKey)) return;
  localStorage.setItem(tenant.storeKey, JSON.stringify({
    medicines: [], customers: [], suppliers: [], sales: [], purchases: [], audit: [], held: [],
    employees: [{
      id: "E001", name: tenant.admin.name, role: "Admin", phone: tenant.admin.phone,
      salary: 0, password: tenant.admin.password, active: true, createdAt: tenant.createdAt,
    }],
    printer: {
      paperSize: "80mm", storeName: tenant.name, storeAddress: "", storePhone: tenant.admin.phone,
      gstin: "", drugLicense: "", footer: "Thank you, visit again!", showLogo: true, copies: 1, autoPrint: false,
    },
  }));
}

/**
 * Replace the in-memory tenant list with data from Supabase and persist it to
 * localStorage so the billing app can still find the active tenant.
 * Always keeps LEGACY_TENANT (ANAM Medical Store / rsp_store_v1) in the list
 * so the pre-existing billing data is never lost.
 */
export function injectTenants(data: Tenant[]): void {
  const hasLegacy = data.some((t) => t.storeKey === LEGACY_STORE_KEY);
  tenants = hasLegacy ? [...data] : [...data, LEGACY_TENANT];
  persistTenants();
  loaded = true; // prevent loadTenants() from overwriting immediately
  emit();
}
