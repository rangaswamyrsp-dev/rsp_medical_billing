import { useEffect, useState, useSyncExternalStore } from "react";
import { MEDICINES as SEED_MEDICINES, type Medicine } from "@/data/medicines";
import { getActiveStoreKey } from "@/lib/tenant";


export type { Medicine };

export type Customer = {
  id: string;
  name: string;
  phone: string;
  doctor?: string;
  address?: string;
  balance: number;
  createdAt: string;
};

export type Supplier = {
  id: string;
  name: string;
  phone: string;
  gstin?: string;
  city?: string;
  balance: number;
};

export type Employee = {
  id: string;
  name: string;
  role: string;
  phone: string;
  salary: number;
  password?: string;
  active?: boolean;
  createdAt?: string;
};

export type SaleItem = {
  id: string;
  name: string;
  batch: string;
  qty: number;
  mrp: number;
  gst: number;
  discount: number;
  total: number;
};

export type Sale = {
  id: string;
  date: string;
  customerId: string | null;
  customerName: string;
  phone: string;
  doctor?: string;
  items: SaleItem[];
  sub: number;
  disc: number;
  gst: number;
  grand: number;
  payment: string;
  status: "paid" | "held" | "cancelled";
  cashierId?: string;
  cashierName?: string;
};

export type Purchase = {
  id: string;
  date: string;
  supplier: string;
  invoiceNo: string;
  items: { name: string; batch: string; qty: number; rate: number; gst: number }[];
  total: number;
};

export type PrinterSettings = {
  paperSize: "58mm" | "80mm" | "A4";
  storeName: string;
  storeAddress: string;
  storePhone: string;
  gstin: string;
  drugLicense: string;
  footer: string;
  showLogo: boolean;
  copies: number;
  autoPrint: boolean;
};

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;        // "E001 · Manjju"
  action: "bill.save" | "bill.cancel" | "bill.hold" | "bill.resume" | "stock.adjust" | "medicine.add" | "medicine.update" | "medicine.delete" | "employee.add" | "employee.delete" | "purchase.add" | "login";
  target?: string;
  detail?: string;
};

export type HeldBill = {
  id: string;
  at: string;
  customerName: string;
  phone: string;
  doctor?: string;
  items: { id: string; name: string; batch: string; qty: number; mrp: number; gst: number; discount: number; company?: string }[];
  cashierId?: string;
  cashierName?: string;
};

const DEFAULT_PRINTER: PrinterSettings = {
  paperSize: "80mm",
  storeName: "ANAM Medical Store",
  storeAddress: "KL Road, Hindupur - 515201",
  storePhone: "+91 98765 43210",
  gstin: "37ABCDE1234F1Z5",
  drugLicense: "AP/HND/20B-21B/1234",
  footer: "Thank you! Get well soon.",
  showLogo: true,
  copies: 1,
  autoPrint: false,
};

const SEED_CUSTOMERS: Customer[] = [];

const SEED_SUPPLIERS: Supplier[] = [];

const SEED_EMPLOYEES: Employee[] = [
  { id: "E001", name: "Manjju", role: "Admin", phone: "9876543210", salary: 35000, password: "anam@2026", active: true, createdAt: "2026-01-01" },
];

const SEED_PURCHASES: Purchase[] = [];

type State = {
  medicines: Medicine[];
  customers: Customer[];
  suppliers: Supplier[];
  employees: Employee[];
  sales: Sale[];
  purchases: Purchase[];
  printer: PrinterSettings;
  audit: AuditEntry[];
  held: HeldBill[];
};

const KEY = "rsp_store_v1";

const DEMO: State = {
  medicines: SEED_MEDICINES,
  customers: SEED_CUSTOMERS,
  suppliers: SEED_SUPPLIERS,
  employees: SEED_EMPLOYEES,
  sales: [],
  purchases: SEED_PURCHASES,
  printer: DEFAULT_PRINTER,
  audit: [],
  held: [],
};

const EMPTY: State = {
  medicines: [], customers: [], suppliers: [], employees: [], sales: [],
  purchases: [], printer: DEFAULT_PRINTER, audit: [], held: [],
};

const DEFAULT: State = EMPTY;

function storeKey(): string {
  try { return getActiveStoreKey(); } catch { return KEY; }
}

let state: State = DEFAULT;
let hydrated = false;
const listeners = new Set<() => void>();

function load(): State {
  if (typeof window === "undefined") return DEFAULT;
  const key = storeKey();
  const isLegacy = key === KEY;
  const base = isLegacy ? DEMO : EMPTY;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(base);
    const parsed = JSON.parse(raw) as Partial<State>;
    const employees = parsed.employees ?? base.employees;
    if (isLegacy && !employees.find((e) => e.phone === "9876543210")) {
      employees.unshift(DEMO.employees[0]);
    }
    return {
      ...base,
      ...parsed,
      employees,
      audit: parsed.audit ?? [],
      held: parsed.held ?? [],
      printer: { ...DEFAULT_PRINTER, ...(parsed.printer ?? {}) },
    };
  } catch {
    return structuredClone(base);
  }
}

function persist() {
  if (typeof window === "undefined") return;
  localStorage.setItem(storeKey(), JSON.stringify(state));
}
function emit() { listeners.forEach((l) => l()); }

export function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  state = load();
  hydrated = true;
  emit();
}

/** Re-read data after switching business (tenant). */
export function reloadStore() {
  if (typeof window === "undefined") return;
  state = load();
  hydrated = true;
  emit();
}
function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }

export function useStore<T>(selector: (s: State) => T): T {
  useEffect(() => hydrate(), []);
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(DEFAULT));
}

function setState(mut: (s: State) => void) {
  const next = structuredClone(state);
  mut(next);
  state = next;
  persist();
  emit();
}


function audit(entry: Omit<AuditEntry, "id" | "at">) {
  setState((s) => {
    s.audit.unshift({
      ...entry,
      id: "A" + Date.now().toString().slice(-8) + Math.floor(Math.random() * 100),
      at: new Date().toISOString(),
    });
    if (s.audit.length > 500) s.audit = s.audit.slice(0, 500);
  });
}

function actorLabel(actor?: { id: string; name: string }) {
  if (!actor) return "system";
  return `${actor.id} · ${actor.name}`;
}

/** Product key = same name + same company. Every batch of it shares one product code. */
function productKey(name: string, company: string) {
  return `${(name ?? "").trim().toLowerCase()}|${(company ?? "").trim().toLowerCase()}`;
}

/** Reuse the existing product code when the same product already exists (different batch / expiry / price). */
function resolveCode(list: Medicine[], m: { name: string; company: string; code?: string }): string {
  if (m.code?.trim()) return m.code.trim();
  const key = productKey(m.name, m.company);
  const twin = list.find((x) => productKey(x.name, x.company) === key && x.code);
  if (twin?.code) return twin.code;
  const used = new Set(list.map((x) => x.code).filter(Boolean) as string[]);
  let n = list.length + 1;
  let code = "";
  do {
    code = "M" + String(n).padStart(4, "0");
    n++;
  } while (used.has(code));
  return code;
}

export function nextProductCode(name: string, company: string): string {
  return resolveCode(state.medicines, { name, company });
}

export const actions = {
  addMedicine(m: Omit<Medicine, "id">, actor?: { id: string; name: string }) {
    setState((s) => {
      const code = resolveCode(s.medicines, m);
      s.medicines.unshift({ ...m, code, id: "M" + Date.now().toString().slice(-6) });
    });
    audit({ actor: actorLabel(actor), action: "medicine.add", target: m.name });
  },
  updateMedicine(id: string, patch: Partial<Medicine>, actor?: { id: string; name: string }) {
    setState((s) => {
      const i = s.medicines.findIndex((x) => x.id === id);
      if (i >= 0) s.medicines[i] = { ...s.medicines[i], ...patch };
    });
    audit({ actor: actorLabel(actor), action: "medicine.update", target: id, detail: JSON.stringify(patch) });
  },
  deleteMedicine(id: string, actor?: { id: string; name: string }) {
    setState((s) => { s.medicines = s.medicines.filter((x) => x.id !== id); });
    audit({ actor: actorLabel(actor), action: "medicine.delete", target: id });
  },
  bulkAddMedicines(list: Omit<Medicine, "id">[]) {
    setState((s) => {
      list.forEach((m, i) => {
        const code = resolveCode(s.medicines, m);
        s.medicines.unshift({ ...m, code, id: "M" + (Date.now() + i).toString().slice(-6) });
      });
    });
    audit({ actor: "system", action: "medicine.add", target: `${list.length} products (bulk)` });
  },

  adjustStock(id: string, delta: number, reason: string, actor?: { id: string; name: string }) {
    setState((s) => {
      const m = s.medicines.find((x) => x.id === id);
      if (m) m.stock = Math.max(0, m.stock + delta);
    });
    audit({ actor: actorLabel(actor), action: "stock.adjust", target: id, detail: `${delta > 0 ? "+" : ""}${delta} · ${reason}` });
  },

  upsertCustomerByPhone(input: { name: string; phone: string; doctor?: string }): Customer {
    const phone = input.phone.trim();
    if (!phone) {
      return { id: "WALK", name: input.name || "Walk-in", phone: "", doctor: input.doctor, balance: 0, createdAt: new Date().toISOString() };
    }
    const existing = state.customers.find((c) => c.phone === phone);
    if (existing) {
      if (input.name && input.name !== existing.name) {
        setState((s) => {
          const c = s.customers.find((x) => x.phone === phone);
          if (c) { c.name = input.name; if (input.doctor) c.doctor = input.doctor; }
        });
      }
      return state.customers.find((c) => c.phone === phone)!;
    }
    const created: Customer = {
      id: "C" + Date.now().toString().slice(-6),
      name: input.name || "Walk-in", phone, doctor: input.doctor,
      balance: 0, createdAt: new Date().toISOString(),
    };
    setState((s) => { s.customers.unshift(created); });
    return created;
  },
  addCustomer(c: Omit<Customer, "id" | "createdAt" | "balance"> & { balance?: number }) {
    setState((s) => {
      s.customers.unshift({ ...c, id: "C" + Date.now().toString().slice(-6), balance: c.balance ?? 0, createdAt: new Date().toISOString() });
    });
  },
  bulkAddCustomers(list: (Omit<Customer, "id" | "createdAt" | "balance"> & { balance?: number })[]) {
    setState((s) => {
      list.forEach((c, i) => s.customers.unshift({ ...c, id: "C" + (Date.now() + i).toString().slice(-6), balance: c.balance ?? 0, createdAt: new Date().toISOString() }));
    });
  },
  deleteCustomer(id: string) {
    setState((s) => { s.customers = s.customers.filter((c) => c.id !== id); });
  },

  addSupplier(s: Omit<Supplier, "id">) {
    setState((st) => { st.suppliers.unshift({ ...s, id: "S" + Date.now().toString().slice(-6) }); });
  },

  addEmployee(e: Omit<Employee, "id" | "createdAt">, actor?: { id: string; name: string }): Employee {
    const id = "E" + (100 + state.employees.length + 1).toString().padStart(3, "0");
    const rec: Employee = { ...e, id, active: e.active ?? true, createdAt: new Date().toISOString() };
    setState((s) => { s.employees.unshift(rec); });
    audit({ actor: actorLabel(actor), action: "employee.add", target: id, detail: `${rec.name} · ${rec.role}` });
    return rec;
  },
  updateEmployee(id: string, patch: Partial<Employee>) {
    setState((s) => {
      const i = s.employees.findIndex((x) => x.id === id);
      if (i >= 0) s.employees[i] = { ...s.employees[i], ...patch };
    });
  },
  deleteEmployee(id: string, actor?: { id: string; name: string }) {
    setState((s) => { s.employees = s.employees.filter((e) => e.id !== id); });
    audit({ actor: actorLabel(actor), action: "employee.delete", target: id });
  },

  addPurchase(p: Omit<Purchase, "id">, actor?: { id: string; name: string }) {
    setState((s) => {
      const rec = { ...p, id: "P" + Date.now().toString().slice(-6) };
      s.purchases.unshift(rec);
      // Increase stock (FEFO friendly: keeps batch expiry data intact per medicine)
      p.items.forEach((it) => {
        const m = s.medicines.find((x) => x.name === it.name && x.batch === it.batch);
        if (m) m.stock += it.qty;
      });
    });
    audit({ actor: actorLabel(actor), action: "purchase.add", target: p.invoiceNo, detail: `${p.supplier} · ₹${p.total}` });
  },

  saveSale(
    sale: Omit<Sale, "id" | "date" | "status">,
    actor?: { id: string; name: string },
  ): Sale {
    const record: Sale = {
      ...sale,
      cashierId: actor?.id,
      cashierName: actor?.name,
      id: "INV" + Date.now().toString().slice(-6),
      date: new Date().toISOString(),
      status: "paid",
    };
    setState((s) => {
      s.sales.unshift(record);
      // FEFO deduction: for each line, deduct from earliest-expiry batch of same medicine name first
      sale.items.forEach((it) => {
        let remaining = it.qty;
        const candidates = s.medicines
          .filter((m) => m.name === it.name && m.stock > 0)
          .sort((a, b) => a.expiry.localeCompare(b.expiry));
        for (const m of candidates) {
          if (remaining <= 0) break;
          const take = Math.min(m.stock, remaining);
          m.stock -= take;
          remaining -= take;
        }
        if (remaining > 0) {
          const exact = s.medicines.find((x) => x.name === it.name && x.batch === it.batch);
          if (exact) exact.stock = Math.max(0, exact.stock - remaining);
        }
      });
    });
    audit({ actor: actorLabel(actor), action: "bill.save", target: record.id, detail: `₹${record.grand} · ${record.payment}` });
    return record;
  },
  cancelSale(id: string, actor?: { id: string; name: string }) {
    setState((s) => {
      const sale = s.sales.find((x) => x.id === id);
      if (!sale || sale.status === "cancelled") return;
      sale.status = "cancelled";
      sale.items.forEach((it) => {
        const m = s.medicines.find((x) => x.name === it.name && x.batch === it.batch)
          ?? s.medicines.find((x) => x.name === it.name);
        if (m) m.stock += it.qty;
      });
    });
    audit({ actor: actorLabel(actor), action: "bill.cancel", target: id });
  },

  holdBill(bill: Omit<HeldBill, "id" | "at">, actor?: { id: string; name: string }): HeldBill {
    const rec: HeldBill = {
      ...bill,
      id: "H" + Date.now().toString().slice(-6),
      at: new Date().toISOString(),
      cashierId: actor?.id,
      cashierName: actor?.name,
    };
    setState((s) => { s.held.unshift(rec); });
    audit({ actor: actorLabel(actor), action: "bill.hold", target: rec.id });
    return rec;
  },
  resumeHeld(id: string): HeldBill | null {
    const found = state.held.find((h) => h.id === id) ?? null;
    if (found) setState((s) => { s.held = s.held.filter((h) => h.id !== id); });
    return found;
  },
  deleteHeld(id: string) {
    setState((s) => { s.held = s.held.filter((h) => h.id !== id); });
  },

  updatePrinter(patch: Partial<PrinterSettings>) {
    setState((s) => { s.printer = { ...s.printer, ...patch }; });
  },

  logLogin(actor: { id: string; name: string }) {
    audit({ actor: actorLabel(actor), action: "login" });
  },

  resetAll() {
    state = structuredClone(DEFAULT);
    persist();
    emit();
  },

  exportJSON(): string { return JSON.stringify(state, null, 2); },
  importJSON(json: string) {
    const parsed = JSON.parse(json) as State;
    state = { ...DEFAULT, ...parsed };
    persist();
    emit();
  },
};

export function useHydrated() {
  const [ok, setOk] = useState(false);
  useEffect(() => { hydrate(); setOk(true); }, []);
  return ok;
}
