import { useEffect, useState, useSyncExternalStore } from "react";
import { MEDICINES as SEED_MEDICINES, type Medicine } from "@/data/medicines";
import { getActiveStoreKey, getActiveTenant } from "@/lib/tenant";
import {
  sb_fetchMedicines,
  sb_insertMedicine,
  sb_updateMedicine,
  sb_deleteMedicine,
  sb_bulkInsertMedicines,
  sb_generateMedicineId,
  sb_generateMedicineCode,
  extractMedicinePrefix,
  formatMedicineId,
  parsePrefixCodeSeq,
  normalizeMedName,
  normaliseMedName,
  findMatchingMedicine,
} from "@/lib/medicines-supabase";
import { parsePackInfo } from "@/lib/medicine-units";
import {
  sb_fetchCustomers,
  sb_insertCustomer,
  sb_updateCustomer,
  sb_deleteCustomer,
  sb_bulkInsertCustomers,
} from "@/lib/customers-supabase";
import {
  sb_fetchSuppliers,
  sb_insertSupplier,
  sb_updateSupplier,
  sb_deleteSupplier,
} from "@/lib/suppliers-supabase";
import {
  sb_fetchPurchases,
  sb_insertPurchase,
  sb_updatePurchase,
  sb_deletePurchase,
} from "@/lib/purchases-supabase";
import {
  sb_fetchSales,
  sb_insertSale,
  sb_updateSaleStatus,
  sb_deleteSale,
} from "@/lib/sales-supabase";
import {
  sb_fetchLoans,
  sb_createLoan,
  sb_recordRepayment,
  type CreateLoanInput,
  type DbLoan,
} from "@/lib/loans-supabase";
import {
  sb_fetchFinanceEntries,
  sb_insertFinanceEntry,
  sb_deleteFinanceEntry,
} from "@/lib/finance-supabase";
import {
  sb_fetchSalaryPayments,
  sb_insertSalaryPayment,
  sb_deleteSalaryPayment,
} from "@/lib/salary-supabase";
import {
  sb_fetchAttendance,
  sb_upsertAttendance,
  sb_deleteAttendance,
} from "@/lib/attendance-supabase";
import {
  sb_fetchGSTProfile,
  sb_upsertGSTProfile,
} from "@/lib/gst-supabase";
import {
  sb_fetchAuditLogs,
  sb_insertAuditLog,
} from "@/lib/audit-supabase";
import {
  sb_fetchSalesReturns,
  sb_insertSalesReturn,
  sb_deleteSalesReturn,
} from "@/lib/sales-returns-supabase";
import {
  sb_fetchPurchaseReturns,
  sb_insertPurchaseReturn,
  sb_deletePurchaseReturn,
} from "@/lib/purchase-returns-supabase";
import { DEFAULT_BARCODE_LABEL_SETTINGS, type BarcodeLabelSettings } from "@/lib/barcode-settings";
import type { TenantBackupPayload } from "@/lib/gdrive-backup";


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
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  city?: string;
  balance?: number;
  createdAt?: string;
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
  pack?: string;
  packSize?: number;
  packQty?: number;
  looseQty?: number;
  totalUnits?: number;
  unitMrp?: number;
  sellingUnit?: string;
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

export type SalesReturnItem = {
  medicineId: string;
  medicineName: string;
  batch: string;
  expiry: string;
  returnedQty: number;  // base units being returned
  originalQty: number;  // original base units sold
  unit: string;
  rate: number;         // per-unit rate (unitMrp)
  gst: number;
  returnAmount: number;
};

export type SalesReturn = {
  id: string;
  tenantId?: string;
  returnNo: string;
  originalSaleId: string;
  customerId: string | null;
  customerName: string;
  phone: string;
  items: SalesReturnItem[];
  returnAmount: number;
  gstAmount: number;
  reason: string;
  returnDate: string;
  status: "completed" | "cancelled";
  processedBy: string;
  processedByName: string;
  createdAt: string;
};

export type PurchaseItem = {
  name: string;
  batch: string;
  qty: number;
  rate: number;
  gst: number;
  mrp?: number;
  expiry?: string;
  pack?: string;
  units?: string;
};

export type Purchase = {
  id: string;
  date: string;
  supplier: string;
  supplierId?: string;
  invoiceNo: string;
  items: PurchaseItem[];
  total: number;
  status?: "PENDING" | "RECEIVED" | "RETURNED";
  notes?: string;
};

export type PurchaseReturnItem = {
  medicineId: string;
  medicineName: string;
  batch: string;
  expiry: string;
  returnedQty: number;  // units being returned to supplier
  originalQty: number;  // original qty in purchase
  purchaseRate: number; // rate per unit from purchase
  gst: number;
  returnAmount: number;
};

export type PurchaseReturn = {
  id: string;
  tenantId?: string;
  returnNo: string;
  originalPurchaseId: string;
  supplierId: string | null;
  supplierName: string;
  returnAmount: number;
  gstAmount: number;
  reason: string;
  returnDate: string;
  status: "completed" | "cancelled";
  processedBy: string;
  processedByName: string;
  items: PurchaseReturnItem[];
  createdAt: string;
};

export type PrinterSettings = {
  paperSize: "50mm" | "58mm" | "80mm" | "A4";
  storeName: string;
  storeAddress: string;
  storePhone: string;
  gstin: string;
  drugLicense: string;
  footer: string;
  showLogo: boolean;
  copies: number;
  autoPrint: boolean;
  labelSettings?: BarcodeLabelSettings;
};

export type AuditEntry = {
  id: string;
  tenantId?: string;
  at: string;
  actor: string;        // "E001 · Manjju"
  action: string;
  module?: string;
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

export type FinanceEntry = {
  id: string;
  tenantId?: string;
  date: string;          // ISO date string YYYY-MM-DD
  type: "income" | "expense";
  title: string;
  category: string;
  amount: number;
  paymentMode: "Cash" | "Online/UPI" | "Bank Transfer" | "Cheque" | string;
  reference?: string;    // optional notes / ref number
  sourceType?: string;   // MANUAL_INCOME, MANUAL_EXPENSE, SALE, PURCHASE
  createdAt?: string;
};

export type AttendanceRecord = {
  id: string;
  tenantId?: string;
  employeeId: string;
  employeeName: string;
  date: string;          // YYYY-MM-DD
  status: "full" | "half" | "absent";  // 1.0 / 0.5 / 0.0
  tasks?: number;        // optional classes / tasks count
  createdAt: string;
  updatedAt?: string;
};

export type SalaryPayment = {
  id: string;
  tenantId?: string;
  employeeId: string;
  employeeName?: string;
  month: string;         // YYYY-MM
  netPayable?: number;
  amountPaid?: number;
  amount: number;        // backwards compat, equals amountPaid
  paymentDate?: string;  // YYYY-MM-DD
  paymentMode?: "Cash" | "Online / UPI" | "Bank Transfer" | "Cheque" | string;
  status?: "paid" | "partial";
  notes?: string;
  paidAt: string;
  createdAt?: string;
};

export type LoanRecord = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  type: "issue" | "payment";  // issue = credit given, payment = repayment received
  amount: number;
  date: string;              // YYYY-MM-DD
  note?: string;
  saleId?: string;           // invoice ID when created from Billing
  createdAt: string;
};

export type GSTProfile = {
  businessName: string;
  gstin: string;
  pan: string;
  address: string;
  state: string;
  stateCode: string;
  contact: string;
  email: string;
  financialYear: string;
  registrationType: "Regular" | "Composition" | "Unregistered";
};

export type CustomCategories = {
  income: string[];
  expense: string[];
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
  labelSettings: DEFAULT_BARCODE_LABEL_SETTINGS,
};

const SEED_CUSTOMERS: Customer[] = [];

const SEED_SUPPLIERS: Supplier[] = [];

const SEED_EMPLOYEES: Employee[] = [
  { id: "E001", name: "Manjju", role: "Admin", phone: "9876543210", salary: 35000, password: "anam@2026", active: true, createdAt: "2026-01-01" },
];

const SEED_PURCHASES: Purchase[] = [];

export type State = {
  medicines: Medicine[];
  customers: Customer[];
  suppliers: Supplier[];
  employees: Employee[];
  sales: Sale[];
  purchases: Purchase[];
  salesReturns: SalesReturn[];
  purchaseReturns: PurchaseReturn[];
  printer: PrinterSettings;
  audit: AuditEntry[];
  held: HeldBill[];
  financeEntries: FinanceEntry[];
  attendance: AttendanceRecord[];
  salaryPayments: SalaryPayment[];
  loans: LoanRecord[];
  gstProfile: GSTProfile;
  customCategories: CustomCategories;
};

const KEY = "rsp_store_v1";

const DEFAULT_GST_PROFILE: GSTProfile = {
  businessName: "ANAM Medical Store",
  gstin: "37ABCDE1234F1Z5",
  pan: "",
  address: "KL Road, Hindupur - 515201",
  state: "Andhra Pradesh",
  stateCode: "37",
  contact: "+91 98765 43210",
  email: "",
  financialYear: "2026-27",
  registrationType: "Regular",
};

const DEMO: State = {
  medicines: SEED_MEDICINES,
  customers: SEED_CUSTOMERS,
  suppliers: SEED_SUPPLIERS,
  employees: SEED_EMPLOYEES,
  sales: [],
  purchases: SEED_PURCHASES,
  salesReturns: [],
  purchaseReturns: [],
  printer: DEFAULT_PRINTER,
  audit: [],
  held: [],
  financeEntries: [],
  attendance: [],
  salaryPayments: [],
  loans: [],
  gstProfile: DEFAULT_GST_PROFILE,
  customCategories: { income: [], expense: [] },
};

const EMPTY: State = {
  medicines: [], customers: [], suppliers: [], employees: [], sales: [],
  purchases: [], salesReturns: [], purchaseReturns: [], printer: DEFAULT_PRINTER, audit: [], held: [],
  financeEntries: [], attendance: [], salaryPayments: [],
  loans: [],
  gstProfile: DEFAULT_GST_PROFILE,
  customCategories: { income: [], expense: [] },
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
      financeEntries: parsed.financeEntries ?? [],
      attendance: parsed.attendance ?? [],
      loans: parsed.loans ?? [],
      salesReturns: parsed.salesReturns ?? [],
      purchaseReturns: [], // Supabase is the primary and only persistent data source
      gstProfile: { ...DEFAULT_GST_PROFILE, ...(parsed.gstProfile ?? {}) },
      customCategories: {
        income: parsed.customCategories?.income ?? [],
        expense: parsed.customCategories?.expense ?? [],
      },
      salaryPayments: parsed.salaryPayments ?? [],
      printer: {
        ...DEFAULT_PRINTER,
        ...(parsed.printer ?? {}),
        labelSettings: {
          ...DEFAULT_BARCODE_LABEL_SETTINGS,
          ...(parsed.printer?.labelSettings ?? {}),
        },
      },
    };
  } catch {
    return structuredClone(base);
  }
}

function persist() {
  if (typeof window === "undefined") return;
  // Exclude purchaseReturns from localStorage: Supabase is the primary and only persistent source
  const { purchaseReturns: _pr, ...rest } = state;
  localStorage.setItem(storeKey(), JSON.stringify(rest));
}
function emit() { listeners.forEach((l) => l()); }

function getCurrentTenantId(): string {
  if (typeof window === "undefined") return "T001";
  try {
    const raw = localStorage.getItem("rsp_auth_user") ?? sessionStorage.getItem("rsp_auth_user");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.tenantId) return parsed.tenantId;
    }
  } catch {}
  try {
    return getActiveTenant().id;
  } catch {
    return "T001";
  }
}

export async function syncMedicinesFromSupabase(tenantId?: string): Promise<Medicine[]> {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) return state.medicines;
  try {
    const { medicines, error } = await sb_fetchMedicines(tid);
    if (!error && Array.isArray(medicines)) {
      setState((s) => {
        s.medicines = medicines;
      });
      return medicines;
    }
  } catch (err) {
    console.error("[store] syncMedicines error:", err);
  }
  return state.medicines;
}

export async function syncCustomersFromSupabase(tenantId?: string): Promise<Customer[]> {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) return state.customers;
  try {
    const { customers, error } = await sb_fetchCustomers(tid);
    if (!error && Array.isArray(customers)) {
      setState((s) => {
        s.customers = customers;
      });
      return customers;
    }
  } catch (err) {
    console.error("[store] syncCustomers error:", err);
  }
  return state.customers;
}

export async function syncSuppliersFromSupabase(tenantId?: string): Promise<Supplier[]> {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) return state.suppliers;
  try {
    const { suppliers, error } = await sb_fetchSuppliers(tid);
    if (!error && Array.isArray(suppliers)) {
      setState((s) => {
        s.suppliers = suppliers;
      });
      return suppliers;
    }
  } catch (err) {
    console.error("[store] syncSuppliers error:", err);
  }
  return state.suppliers;
}

export async function syncPurchasesFromSupabase(tenantId?: string): Promise<Purchase[]> {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) return state.purchases;
  try {
    const { purchases, error } = await sb_fetchPurchases(tid);
    if (!error && Array.isArray(purchases)) {
      setState((s) => {
        s.purchases = purchases;
      });
      return purchases;
    }
  } catch (err) {
    console.error("[store] syncPurchases error:", err);
  }
  return state.purchases;
}

export async function syncSalesFromSupabase(tenantId?: string): Promise<Sale[]> {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) return state.sales;
  try {
    const { sales, error } = await sb_fetchSales(tid);
    if (!error && Array.isArray(sales)) {
      setState((s) => {
        s.sales = sales;
      });
      return sales;
    }
  } catch (err) {
    console.error("[store] syncSales error:", err);
  }
  return state.sales;
}

export async function syncFinanceEntriesFromSupabase(tenantId?: string): Promise<FinanceEntry[]> {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) return state.financeEntries;
  try {
    const { entries, error } = await sb_fetchFinanceEntries(tid);
    if (!error && Array.isArray(entries)) {
      setState((s) => {
        s.financeEntries = entries;
      });
      return entries;
    }
  } catch (err) {
    console.error("[store] syncFinanceEntries error:", err);
  }
  return state.financeEntries;
}

export async function syncSalaryPaymentsFromSupabase(tenantId?: string): Promise<SalaryPayment[]> {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) return state.salaryPayments;
  try {
    const { payments, error } = await sb_fetchSalaryPayments(tid);
    if (!error && Array.isArray(payments)) {
      setState((s) => {
        // Merge Supabase records with local state
        const map = new Map<string, SalaryPayment>();
        for (const p of s.salaryPayments) {
          map.set(p.id, p);
        }
        for (const p of payments) {
          map.set(p.id, p);
        }
        s.salaryPayments = Array.from(map.values()).sort((a, b) => {
          const d1 = a.paymentDate || a.paidAt || "";
          const d2 = b.paymentDate || b.paidAt || "";
          return d2.localeCompare(d1);
        });
      });
      return state.salaryPayments;
    }
  } catch (err) {
    console.error("[store] syncSalaryPayments error:", err);
  }
  return state.salaryPayments;
}

export async function syncLoansFromSupabase(tenantId?: string): Promise<DbLoan[]> {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) return [];
  try {
    const { loans, error } = await sb_fetchLoans(tid);
    if (!error && Array.isArray(loans)) {
      setState((s) => {
        const existingIds = new Set(s.loans.map((l) => l.id));
        const newRecords: LoanRecord[] = [];
        for (const l of loans) {
          if (!existingIds.has(l.id)) {
            newRecords.push({
              id: l.id,
              customerId: l.customer_id || "",
              customerName: l.customer_name,
              customerPhone: l.phone || "",
              type: "issue",
              amount: l.amount,
              date: (l.loan_date || l.created_at || "").slice(0, 10),
              note: l.note || undefined,
              saleId: l.sale_id || undefined,
              createdAt: l.created_at,
            });
          }
        }
        if (newRecords.length > 0) {
          s.loans = [...newRecords, ...s.loans];
        }
      });
      return loans;
    }
  } catch (err) {
    console.error("[store] syncLoans error:", err);
  }
  return [];
}

export async function syncAttendanceFromSupabase(tenantId?: string): Promise<AttendanceRecord[]> {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) return state.attendance;
  try {
    const { records, error } = await sb_fetchAttendance(tid);
    if (!error && Array.isArray(records)) {
      setState((s) => {
        // Merge Supabase records with local state (deduplicating by employeeId + date)
        const map = new Map<string, AttendanceRecord>();
        for (const a of s.attendance) {
          map.set(`${a.employeeId}|${a.date}`, a);
        }
        for (const a of records) {
          map.set(`${a.employeeId}|${a.date}`, a);
        }
        s.attendance = Array.from(map.values()).sort((a, b) => {
          return (b.date || "").localeCompare(a.date || "");
        });
      });
      return state.attendance;
    }
  } catch (err) {
    console.error("[store] syncAttendance error:", err);
  }
  return state.attendance;
}

export async function syncGSTProfileFromSupabase(tenantId?: string): Promise<GSTProfile> {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) return state.gstProfile;
  try {
    const { profile, error } = await sb_fetchGSTProfile(tid);
    if (!error && profile) {
      setState((s) => {
        s.gstProfile = profile;
      });
      return profile;
    }
  } catch (err) {
    console.error("[store] syncGSTProfile error:", err);
  }
  return state.gstProfile;
}

export async function syncAuditLogsFromSupabase(tenantId?: string): Promise<AuditEntry[]> {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) return state.audit;
  try {
    const { logs, error } = await sb_fetchAuditLogs(tid);
    if (!error && Array.isArray(logs)) {
      setState((s) => {
        // Merge Supabase logs with local state (deduplicating by id)
        const map = new Map<string, AuditEntry>();
        for (const a of s.audit) {
          map.set(a.id, a);
        }
        for (const a of logs) {
          map.set(a.id, a);
        }
        s.audit = Array.from(map.values())
          .sort((a, b) => (b.at || "").localeCompare(a.at || ""))
          .slice(0, 500);
      });
      return state.audit;
    }
  } catch (err) {
    console.error("[store] syncAuditLogs error:", err);
  }
  return state.audit;
}

export async function syncSalesReturnsFromSupabase(tenantId?: string): Promise<SalesReturn[]> {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) return state.salesReturns;
  try {
    const { returns, error } = await sb_fetchSalesReturns(tid);
    if (!error && Array.isArray(returns)) {
      setState((s) => { s.salesReturns = returns; });
      return returns;
    }
  } catch (err) {
    console.error("[store] syncSalesReturns error:", err);
  }
  return state.salesReturns;
}

export async function syncPurchaseReturnsFromSupabase(tenantId?: string): Promise<PurchaseReturn[]> {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) return state.purchaseReturns;
  try {
    const { returns, error } = await sb_fetchPurchaseReturns(tid);
    if (!error && Array.isArray(returns)) {
      setState((s) => { s.purchaseReturns = returns; });
      return returns;
    }
  } catch (err) {
    console.error("[store] syncPurchaseReturns error:", err);
  }
  return state.purchaseReturns;
}

export function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  state = load();
  hydrated = true;
  emit();
  syncMedicinesFromSupabase().catch(() => {});
  syncCustomersFromSupabase().catch(() => {});
  syncSuppliersFromSupabase().catch(() => {});
  syncPurchasesFromSupabase().catch(() => {});
  syncSalesFromSupabase().catch(() => {});
  syncFinanceEntriesFromSupabase().catch(() => {});
  syncSalaryPaymentsFromSupabase().catch(() => {});
  syncLoansFromSupabase().catch(() => {});
  syncAttendanceFromSupabase().catch(() => {});
  syncGSTProfileFromSupabase().catch(() => {});
  syncAuditLogsFromSupabase().catch(() => {});
  syncSalesReturnsFromSupabase().catch(() => {});
  syncPurchaseReturnsFromSupabase().catch(() => {});
}

/** Re-read data after switching business (tenant). */
export function reloadStore() {
  if (typeof window === "undefined") return;
  state = load();
  hydrated = true;
  emit();
  syncMedicinesFromSupabase().catch(() => {});
  syncCustomersFromSupabase().catch(() => {});
  syncSuppliersFromSupabase().catch(() => {});
  syncPurchasesFromSupabase().catch(() => {});
  syncSalesFromSupabase().catch(() => {});
  syncFinanceEntriesFromSupabase().catch(() => {});
  syncSalaryPaymentsFromSupabase().catch(() => {});
  syncLoansFromSupabase().catch(() => {});
  syncAttendanceFromSupabase().catch(() => {});
  syncGSTProfileFromSupabase().catch(() => {});
  syncAuditLogsFromSupabase().catch(() => {});
  syncSalesReturnsFromSupabase().catch(() => {});
  syncPurchaseReturnsFromSupabase().catch(() => {});
}
function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }

export interface UseStoreHook {
  <T>(selector: (s: State) => T): T;
  getState: <T = State>(selector?: (s: State) => T) => T;
}

function useStoreBase<T>(selector: (s: State) => T): T {
  useEffect(() => hydrate(), []);
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(DEFAULT));
}

useStoreBase.getState = <T = State>(selector?: (s: State) => T): T => {
  hydrate();
  return selector ? selector(state) : (state as any);
};

export const useStore: UseStoreHook = useStoreBase;

export function getStoreState(): State {
  hydrate();
  return state;
}

function setState(mut: (s: State) => void) {
  const next = structuredClone(state);
  mut(next);
  state = next;
  persist();
  emit();
}


function getActionModule(action: string): string {
  const a = action.toLowerCase();
  if (a.startsWith("bill.") || a.includes("sale")) return "Billing";
  if (a.startsWith("stock.") || a.startsWith("medicine.")) return "Inventory";
  if (a.startsWith("customer.")) return "Customers";
  if (a.startsWith("supplier.")) return "Suppliers";
  if (a.startsWith("purchase.")) return "Purchases";
  if (a.startsWith("employee.")) return "Employees";
  if (a.startsWith("salary.")) return "Payroll";
  if (a.startsWith("attendance.")) return "Attendance";
  if (a.startsWith("loan.")) return "Loans";
  if (a.startsWith("finance.") || a.startsWith("income.") || a.startsWith("expense.")) return "Accounts";
  if (a.startsWith("gst.")) return "GST";
  if (a.startsWith("printer.") || a.startsWith("settings.")) return "Settings";
  if (a === "login" || a === "logout") return "Auth";
  return "General";
}

function audit(entry: Omit<AuditEntry, "id" | "at"> & { id?: string; at?: string }) {
  const tid = entry.tenantId || getCurrentTenantId();
  const id = entry.id || ("A" + Date.now().toString().slice(-8) + Math.floor(Math.random() * 100));
  const at = entry.at || new Date().toISOString();
  const module = entry.module || getActionModule(entry.action);
  const fullEntry: AuditEntry = {
    ...entry,
    id,
    at,
    tenantId: tid,
    module,
  };

  setState((s) => {
    s.audit.unshift(fullEntry);
    if (s.audit.length > 500) s.audit = s.audit.slice(0, 500);
  });

  // Non-blocking persistence to Supabase
  sb_insertAuditLog(tid, fullEntry).catch((err) => {
    console.error("[store] audit supabase insert error:", err);
  });
}

function actorLabel(actor?: { id: string; name: string }) {
  if (!actor) return "system";
  return `${actor.id} · ${actor.name}`;
}

/**
 * Resolve the product code for a new medicine:
 *  1. If the medicine already has a code, keep it.
 *  2. If an existing medicine matches (by normalized name, strength, and composition), reuse its code.
 *  3. Otherwise return null — caller must request a new code from the DB.
 */
function resolveExistingCode(
  list: Medicine[],
  m: { name: string; company?: string; code?: string; generic?: string },
): string | null {
  if (m.code?.trim()) return m.code.trim();
  const match = findMatchingMedicine(m, list);
  return match?.code ?? null;
}

/** Local fallback if DB code generation is unreachable. */
function resolveCode(list: Medicine[], m: { name: string; company?: string; code?: string }): string {
  const existing = resolveExistingCode(list, m);
  if (existing) return existing;
  const pfx = extractMedicinePrefix(m.name);
  let maxSeq = 0;
  list.forEach((x) => {
    const n = parsePrefixCodeSeq(x.code, pfx);
    if (n > maxSeq) maxSeq = n;
  });
  return formatMedicineId(pfx, maxSeq + 1);
}

export function nextProductCode(name: string, company?: string): string {
  return resolveCode(state.medicines, { name, company });
}

export const actions = {
  syncMedicines(tenantId?: string) {
    return syncMedicinesFromSupabase(tenantId);
  },
  async addMedicine(m: Omit<Medicine, "id">, actor?: { id: string; name: string }): Promise<{ medicine: Medicine; error: string | null }> {
    const tid = getCurrentTenantId();
    // Reuse code from an existing matching product (same normalized name, strength, composition),
    // else mint a new ACA0001 / ACE0001 / ACI0001 code from DB
    const existingCode = resolveExistingCode(state.medicines, m);
    let code = existingCode;
    if (!code) {
      const { codes } = await sb_generateMedicineId(tid, m.name, 1);
      code = codes[0] ?? resolveCode(state.medicines, m); // fallback to local sequence if DB unreachable
    }
    const purchaseRate = m.new_rate !== undefined ? Number(m.new_rate) : (m.cost !== undefined ? Number(m.cost) : 0);
    const profit = Math.max(0, (Number(m.mrp) || 0) - purchaseRate);
    const newMed: Medicine = {
      ...m,
      cost: purchaseRate,
      new_rate: purchaseRate,
      profit,
      code,
      created_at: m.created_at || new Date().toISOString(),
      id: "M" + Date.now().toString().slice(-6),
    };
    setState((s) => {
      s.medicines.unshift(newMed);
    });
    audit({ actor: actorLabel(actor), action: "medicine.add", target: m.name });

    const { error } = await sb_insertMedicine(tid, newMed);
    return { medicine: newMed, error };
  },
  async updateMedicine(id: string, patch: Partial<Medicine>, actor?: { id: string; name: string }): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    setState((s) => {
      const i = s.medicines.findIndex((x) => x.id === id);
      if (i >= 0) {
        const merged = { ...s.medicines[i], ...patch };
        const pRate = merged.new_rate !== undefined ? Number(merged.new_rate) : (merged.cost !== undefined ? Number(merged.cost) : 0);
        merged.profit = Math.max(0, (Number(merged.mrp) || 0) - pRate);
        s.medicines[i] = merged;
      }
    });
    audit({ actor: actorLabel(actor), action: "medicine.update", target: id, detail: JSON.stringify(patch) });

    const { error } = await sb_updateMedicine(tid, id, patch);
    return { error };
  },
  async deleteMedicine(id: string, actor?: { id: string; name: string }): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    setState((s) => { s.medicines = s.medicines.filter((x) => x.id !== id); });
    audit({ actor: actorLabel(actor), action: "medicine.delete", target: id });

    const { error } = await sb_deleteMedicine(tid, id);
    return { error };
  },
  async bulkAddMedicines(list: Omit<Medicine, "id">[]): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    if (list.length === 0) return { error: null };

    const snapshot = state.medicines;

    // Group items needing new codes by 3-letter prefix so sequential codes are reserved properly per prefix
    const neededByPrefix = new Map<string, Array<{ index: number; name: string }>>();
    list.forEach((m, idx) => {
      const ex = resolveExistingCode(snapshot, m);
      if (!ex) {
        const pfx = extractMedicinePrefix(m.name);
        if (!neededByPrefix.has(pfx)) neededByPrefix.set(pfx, []);
        neededByPrefix.get(pfx)!.push({ index: idx, name: m.name });
      }
    });

    const codeByIndex = new Map<number, string>();
    for (const [pfx, items] of neededByPrefix.entries()) {
      const { codes } = await sb_generateMedicineId(tid, items[0].name, items.length);
      items.forEach((it, i) => {
        codeByIndex.set(it.index, codes[i] || resolveCode(snapshot, { name: it.name }));
      });
    }

    const createdList: Medicine[] = [];
    const nowIso = new Date().toISOString();

    list.forEach((m, i) => {
      const existingCode = resolveExistingCode(snapshot, m);
      const code = existingCode || codeByIndex.get(i) || resolveCode(snapshot, m);
      const purchaseRate = m.new_rate !== undefined ? Number(m.new_rate) : (m.cost !== undefined ? Number(m.cost) : 0);
      const profit = Math.max(0, (Number(m.mrp) || 0) - purchaseRate);
      const item: Medicine = {
        ...m,
        cost: purchaseRate,
        new_rate: purchaseRate,
        profit,
        code,
        created_at: m.created_at || nowIso,
        id: "M" + Date.now().toString(36) + "-" + (i + 1) + "-" + Math.random().toString(36).slice(2, 6),
      };
      createdList.push(item);
    });

    setState((s) => {
      s.medicines = [...createdList, ...s.medicines];
    });
    audit({ actor: "system", action: "medicine.add", target: `${list.length} products (bulk)` });

    const { error } = await sb_bulkInsertMedicines(tid, createdList);
    return { error };
  },


  async adjustStock(id: string, delta: number, reason: string, actor?: { id: string; name: string }) {
    const tid = getCurrentTenantId();
    let newStock = 0;
    setState((s) => {
      const m = s.medicines.find((x) => x.id === id);
      if (m) {
        m.stock = Math.max(0, m.stock + delta);
        newStock = m.stock;
      }
    });
    audit({ actor: actorLabel(actor), action: "stock.adjust", target: id, detail: `${delta > 0 ? "+" : ""}${delta} · ${reason}` });

    await sb_updateMedicine(tid, id, { stock: newStock });
  },

  syncCustomers(tenantId?: string) {
    return syncCustomersFromSupabase(tenantId);
  },
  upsertCustomerByPhone(input: { name: string; phone: string; doctor?: string }): Customer {
    const tid = getCurrentTenantId();
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
        sb_updateCustomer(tid, existing.id, { name: input.name, doctor: input.doctor || existing.doctor }).catch(() => {});
      }
      return state.customers.find((c) => c.phone === phone)!;
    }
    const created: Customer = {
      id: "C" + Date.now().toString().slice(-6),
      name: input.name || "Walk-in", phone, doctor: input.doctor,
      balance: 0, createdAt: new Date().toISOString(),
    };
    setState((s) => { s.customers.unshift(created); });
    sb_insertCustomer(tid, created).catch(() => {});
    return created;
  },
  async addCustomer(c: Omit<Customer, "id" | "createdAt" | "balance"> & { balance?: number }): Promise<{ customer: Customer; error: string | null }> {
    const tid = getCurrentTenantId();
    const created: Customer = {
      ...c,
      id: "C" + Date.now().toString().slice(-6),
      balance: c.balance ?? 0,
      createdAt: new Date().toISOString(),
    };
    setState((s) => {
      s.customers.unshift(created);
    });
    audit({ actor: "system", action: "customer.add", module: "Customers", target: created.name, detail: `Phone: ${created.phone || "—"} · Balance: ₹${created.balance}` });
    const { error } = await sb_insertCustomer(tid, created);
    return { customer: created, error };
  },
  async updateCustomer(id: string, patch: Partial<Customer>): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    setState((s) => {
      const i = s.customers.findIndex((x) => x.id === id);
      if (i >= 0) s.customers[i] = { ...s.customers[i], ...patch };
    });
    audit({ actor: "system", action: "customer.update", module: "Customers", target: id, detail: JSON.stringify(patch) });
    const { error } = await sb_updateCustomer(tid, id, patch);
    return { error };
  },
  async bulkAddCustomers(list: (Omit<Customer, "id" | "createdAt" | "balance"> & { balance?: number })[]): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    const createdList: Customer[] = [];
    setState((s) => {
      list.forEach((c, i) => {
        const item: Customer = { ...c, id: "C" + (Date.now() + i).toString().slice(-6), balance: c.balance ?? 0, createdAt: new Date().toISOString() };
        s.customers.unshift(item);
        createdList.push(item);
      });
    });
    audit({ actor: "system", action: "customer.add", module: "Customers", target: `${list.length} customers (bulk)` });
    const { error } = await sb_bulkInsertCustomers(tid, createdList);
    return { error };
  },
  async deleteCustomer(id: string): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    setState((s) => { s.customers = s.customers.filter((c) => c.id !== id); });
    audit({ actor: "system", action: "customer.delete", module: "Customers", target: id });
    const { error } = await sb_deleteCustomer(tid, id);
    return { error };
  },

  syncSuppliers(tenantId?: string) {
    return syncSuppliersFromSupabase(tenantId);
  },
  async addSupplier(s: Omit<Supplier, "id">): Promise<{ supplier: Supplier; error: string | null }> {
    const tid = getCurrentTenantId();
    const created: Supplier = { ...s, id: "S" + Date.now().toString().slice(-6), balance: s.balance ?? 0 };
    setState((st) => { st.suppliers.unshift(created); });
    audit({ actor: "system", action: "supplier.add", module: "Suppliers", target: created.name, detail: `Phone: ${created.phone || "—"} · GSTIN: ${created.gstin || "—"}` });
    const { error } = await sb_insertSupplier(tid, created);
    return { supplier: created, error };
  },
  async updateSupplier(id: string, patch: Partial<Supplier>): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    setState((s) => {
      const i = s.suppliers.findIndex((x) => x.id === id);
      if (i >= 0) s.suppliers[i] = { ...s.suppliers[i], ...patch };
    });
    audit({ actor: "system", action: "supplier.update", module: "Suppliers", target: id, detail: JSON.stringify(patch) });
    const { error } = await sb_updateSupplier(tid, id, patch);
    return { error };
  },
  async deleteSupplier(id: string): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    setState((s) => { s.suppliers = s.suppliers.filter((x) => x.id !== id); });
    audit({ actor: "system", action: "supplier.delete", module: "Suppliers", target: id });
    const { error } = await sb_deleteSupplier(tid, id);
    return { error };
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
    audit({ actor: "system", action: "employee.update", module: "Employees", target: id, detail: JSON.stringify(patch) });
  },
  deleteEmployee(id: string, actor?: { id: string; name: string }) {
    setState((s) => { s.employees = s.employees.filter((e) => e.id !== id); });
    audit({ actor: actorLabel(actor), action: "employee.delete", target: id });
  },

  syncPurchases(tenantId?: string) {
    return syncPurchasesFromSupabase(tenantId);
  },
  async addPurchaseDraft(p: Omit<Purchase, "id">, actor?: { id: string; name: string }): Promise<{ purchase: Purchase; error: string | null }> {
    const tid = getCurrentTenantId();
    const rec: Purchase = {
      ...p,
      id: "P" + Date.now().toString().slice(-6),
      status: "PENDING",
    };
    setState((s) => {
      s.purchases.unshift(rec);
    });
    audit({
      actor: actorLabel(actor),
      action: "purchase.draft_create",
      target: p.invoiceNo,
      detail: `Draft: ${p.supplier} · ₹${p.total}`,
    });
    const { error } = await sb_insertPurchase(tid, rec);
    return { purchase: rec, error };
  },

  async confirmPurchase(id: string, actor?: { id: string; name: string }): Promise<{ purchase?: Purchase; error: string | null; alreadyConfirmed?: boolean }> {
    const tid = getCurrentTenantId();
    const current = state.purchases.find((p) => p.id === id);
    if (!current) return { error: "Purchase not found" };

    // Idempotency guard: cannot finalize an already finalized purchase
    if (current.status === "RECEIVED") {
      return { purchase: current, error: null, alreadyConfirmed: true };
    }

    const affectedMeds: { id: string; patch: Partial<Medicine> }[] = [];
    let updatedPurchase: Purchase = { ...current, status: "RECEIVED" };

    setState((s) => {
      const idx = s.purchases.findIndex((p) => p.id === id);
      if (idx >= 0) {
        s.purchases[idx] = { ...s.purchases[idx], status: "RECEIVED" };
        updatedPurchase = s.purchases[idx];
      }

      // Update medicine stock once upon final confirmation using standard formula:
      // Stock Added = (Qty in Packs × Units Per Pack) + Extra Qty
      updatedPurchase.items.forEach((it) => {
        const m = s.medicines.find(
          (x) =>
            x.name.trim().toLowerCase() === it.name.trim().toLowerCase() &&
            x.batch.trim().toLowerCase() === it.batch.trim().toLowerCase()
        );
        if (m) {
          const pInfo = parsePackInfo(m);
          const packSize = (it as any).packSize || pInfo.packSize || 1;
          const extra = Number((it as any).extraQty) || 0;
          const unitsToAdd = (Number(it.qty) || 0) * packSize + extra;
          m.stock += unitsToAdd;
          const patch: Partial<Medicine> = { stock: m.stock };
          if (it.rate && it.rate > 0) {
            const currentRate = m.new_rate ?? m.cost ?? 0;
            if (currentRate > 0 && currentRate !== it.rate) {
              m.old_rate = currentRate;
              patch.old_rate = currentRate;
            }
            m.new_rate = it.rate;
            m.cost = it.rate;
            m.profit = Math.max(0, m.mrp - it.rate);
            patch.new_rate = it.rate;
            patch.cost = it.rate;
          }
          if (updatedPurchase.supplier && !m.supplier) {
            m.supplier = updatedPurchase.supplier;
            patch.supplier = updatedPurchase.supplier;
          }
          if (updatedPurchase.supplierId && !m.supplierId) {
            m.supplierId = updatedPurchase.supplierId;
            patch.supplierId = updatedPurchase.supplierId;
          }
          affectedMeds.push({ id: m.id, patch });
        }
      });
    });

    audit({
      actor: actorLabel(actor),
      action: "purchase.confirm",
      target: updatedPurchase.invoiceNo,
      detail: `Finalized: ${updatedPurchase.supplier} · ₹${updatedPurchase.total}`,
    });

    const { error } = await sb_updatePurchase(tid, id, { status: "RECEIVED" });
    if (affectedMeds.length > 0) {
      const BATCH_SIZE = 25;
      (async () => {
        for (let i = 0; i < affectedMeds.length; i += BATCH_SIZE) {
          const batch = affectedMeds.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map((item) =>
              sb_updateMedicine(tid, item.id, item.patch).catch((err) =>
                console.error("[store] confirmPurchase stock update failed:", err)
              )
            )
          );
        }
      })();
    }

    return { purchase: updatedPurchase, error };
  },

  async addPurchase(p: Omit<Purchase, "id">, actor?: { id: string; name: string }): Promise<{ purchase: Purchase; error: string | null }> {
    const tid = getCurrentTenantId();
    const statusVal = p.status || "RECEIVED";
    const rec: Purchase = { ...p, id: "P" + Date.now().toString().slice(-6), status: statusVal };
    const affectedMeds: { id: string; patch: Partial<Medicine> }[] = [];
    setState((s) => {
      s.purchases.unshift(rec);
      // Only increase stock if status is RECEIVED (finalized)
      if (statusVal === "RECEIVED") {
        p.items.forEach((it) => {
          const m = s.medicines.find(
            (x) =>
              x.name.trim().toLowerCase() === it.name.trim().toLowerCase() &&
              x.batch.trim().toLowerCase() === it.batch.trim().toLowerCase()
          );
          if (m) {
            const pInfo = parsePackInfo(m);
            const packSize = (it as any).packSize || pInfo.packSize || 1;
            const extra = Number((it as any).extraQty) || 0;
            const unitsToAdd = (it as any).qtyMode === "packs"
              ? (Number(it.qty) || 0) * packSize + extra
              : (Number(it.qty) || 0);
            m.stock += unitsToAdd;
            const patch: Partial<Medicine> = { stock: m.stock };
            if (it.rate && it.rate > 0) {
              const current = m.new_rate ?? m.cost ?? 0;
              if (current > 0 && current !== it.rate) {
                m.old_rate = current;
                patch.old_rate = current;
              }
              m.new_rate = it.rate;
              m.cost = it.rate;
              m.profit = Math.max(0, m.mrp - it.rate);
              patch.new_rate = it.rate;
              patch.cost = it.rate;
            }
            if (p.supplier && !m.supplier) {
              m.supplier = p.supplier;
              patch.supplier = p.supplier;
            }
            if (p.supplierId && !m.supplierId) {
              m.supplierId = p.supplierId;
              patch.supplierId = p.supplierId;
            }
            affectedMeds.push({ id: m.id, patch });
          }
        });
      }
    });
    audit({ actor: actorLabel(actor), action: statusVal === "PENDING" ? "purchase.draft_create" : "purchase.add", target: p.invoiceNo, detail: `${p.supplier} · ₹${p.total}` });

    const { error } = await sb_insertPurchase(tid, rec);
    if (affectedMeds.length > 0) {
      const BATCH_SIZE = 25;
      (async () => {
        for (let i = 0; i < affectedMeds.length; i += BATCH_SIZE) {
          const batch = affectedMeds.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map((item) =>
              sb_updateMedicine(tid, item.id, item.patch).catch((err) =>
                console.error("[store] addPurchase stock/rate update failed:", err)
              )
            )
          );
        }
      })();
    }
    return { purchase: rec, error };
  },
  async updatePurchase(id: string, patch: Partial<Purchase>): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    setState((s) => {
      const idx = s.purchases.findIndex((x) => x.id === id);
      if (idx >= 0) {
        s.purchases[idx] = { ...s.purchases[idx], ...patch };
      }
    });
    audit({ actor: "system", action: "purchase.update", module: "Purchases", target: id, detail: JSON.stringify(patch) });
    const { error } = await sb_updatePurchase(tid, id, patch);
    return { error };
  },
  async deletePurchase(id: string): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    setState((s) => { s.purchases = s.purchases.filter((x) => x.id !== id); });
    audit({ actor: "system", action: "purchase.delete", module: "Purchases", target: id });
    const { error } = await sb_deletePurchase(tid, id);
    return { error };
  },

  syncSales(tenantId?: string) {
    return syncSalesFromSupabase(tenantId);
  },
  async saveSale(
    sale: Omit<Sale, "id" | "date" | "status">,
    actor?: { id: string; name: string },
  ): Promise<{ sale: Sale; error: string | null }> {
    const tid = getCurrentTenantId();
    const record: Sale = {
      ...sale,
      cashierId: actor?.id,
      cashierName: actor?.name,
      id: "INV" + Date.now().toString().slice(-6),
      date: new Date().toISOString(),
      status: "paid",
    };
    const modifiedMeds: { id: string; stock: number }[] = [];
    setState((s) => {
      s.sales.unshift(record);
      // FEFO deduction: for each line, deduct from earliest-expiry batch of same medicine name first
      sale.items.forEach((it) => {
        let remaining = it.totalUnits !== undefined ? it.totalUnits : it.qty;
        const candidates = s.medicines
          .filter((m) => m.name === it.name && m.stock > 0)
          .sort((a, b) => a.expiry.localeCompare(b.expiry));
        for (const m of candidates) {
          if (remaining <= 0) break;
          const take = Math.min(m.stock, remaining);
          m.stock -= take;
          remaining -= take;
          modifiedMeds.push({ id: m.id, stock: m.stock });
        }
        if (remaining > 0) {
          const exact = s.medicines.find((x) => x.name === it.name && x.batch === it.batch);
          if (exact) {
            exact.stock = Math.max(0, exact.stock - remaining);
            modifiedMeds.push({ id: exact.id, stock: exact.stock });
          }
        }
      });
    });
    audit({ actor: actorLabel(actor), action: "bill.save", target: record.id, detail: `₹${record.grand} · ${record.payment}` });

    const { error } = await sb_insertSale(tid, record);
    for (const item of modifiedMeds) {
      sb_updateMedicine(tid, item.id, { stock: item.stock }).catch((err) =>
        console.error("[store] saveSale stock deduction failed:", err)
      );
    }
    return { sale: record, error };
  },
  async cancelSale(id: string, actor?: { id: string; name: string }): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    const restoredMeds: { id: string; stock: number }[] = [];
    setState((s) => {
      const sale = s.sales.find((x) => x.id === id);
      if (!sale || sale.status === "cancelled") return;
      sale.status = "cancelled";
      sale.items.forEach((it) => {
        const unitsToRestore = it.totalUnits !== undefined ? it.totalUnits : it.qty;
        const m = s.medicines.find((x) => x.name === it.name && x.batch === it.batch)
          ?? s.medicines.find((x) => x.name === it.name);
        if (m) {
          m.stock += unitsToRestore;
          restoredMeds.push({ id: m.id, stock: m.stock });
        }
      });
    });
    audit({ actor: actorLabel(actor), action: "bill.cancel", target: id });

    const { error } = await sb_updateSaleStatus(tid, id, "cancelled");
    for (const item of restoredMeds) {
      sb_updateMedicine(tid, item.id, { stock: item.stock }).catch((err) =>
        console.error("[store] cancelSale stock restore failed:", err)
      );
    }
    return { error };
  },
  async deleteSale(id: string): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    setState((s) => { s.sales = s.sales.filter((x) => x.id !== id); });
    audit({ actor: "system", action: "sale.delete", module: "Billing", target: id });
    const { error } = await sb_deleteSale(tid, id);
    return { error };
  },

  syncSalesReturns(tenantId?: string) {
    return syncSalesReturnsFromSupabase(tenantId);
  },

  /**
   * Create a sales return.
   *
   * - Accepts returnItems where each item has returnedQty in BASE UNITS.
   * - Restores stock by exact base-unit count (not full strips).
   * - Does NOT alter the original sale record.
   */
  async createSalesReturn(
    payload: {
      originalSaleId: string;
      customerId: string | null;
      customerName: string;
      phone: string;
      returnItems: {
        medicineId: string;
        medicineName: string;
        batch: string;
        expiry: string;
        returnedQty: number;   // base units being returned
        originalQty: number;   // original base units in sale line
        unit: string;
        rate: number;          // per-unit rate (unitMrp from sale)
        gst: number;
        returnAmount: number;
      }[];
      reason: string;
    },
    actor?: { id: string; name: string },
  ): Promise<{ ret: SalesReturn; error: string | null }> {
    const tid = getCurrentTenantId();
    const now = new Date().toISOString();
    const id = "SR" + Date.now().toString().slice(-8);
    const returnNo = "RTN" + Date.now().toString().slice(-6);

    const totalReturn = payload.returnItems.reduce((s, it) => s + it.returnAmount, 0);
    const totalGst = payload.returnItems.reduce((s, it) => {
      const taxable = it.returnAmount / (1 + it.gst / 100);
      return s + (it.returnAmount - taxable);
    }, 0);

    const record: SalesReturn = {
      id,
      tenantId: tid,
      returnNo,
      originalSaleId: payload.originalSaleId,
      customerId: payload.customerId,
      customerName: payload.customerName,
      phone: payload.phone ?? "",
      items: payload.returnItems.map((it) => ({
        medicineId: it.medicineId,
        medicineName: it.medicineName,
        batch: it.batch,
        expiry: it.expiry,
        returnedQty: it.returnedQty,
        originalQty: it.originalQty,
        unit: it.unit,
        rate: it.rate,
        gst: it.gst,
        returnAmount: it.returnAmount,
      })),
      returnAmount: +totalReturn.toFixed(2),
      gstAmount: +totalGst.toFixed(2),
      reason: payload.reason,
      returnDate: now,
      status: "completed",
      processedBy: actor?.id ?? "system",
      processedByName: actor?.name ?? "system",
      createdAt: now,
    };

    // 0. Validate return quantities against previously returned amounts for this sale
    const existingReturns = state.salesReturns.filter((r) => r.originalSaleId === payload.originalSaleId);
    for (const it of payload.returnItems) {
      const previouslyReturned = existingReturns.reduce((sum, r) => {
        const found = r.items.find(
          (ri) =>
            (ri.medicineId && ri.medicineId === it.medicineId) ||
            (ri.medicineName.trim().toLowerCase() === it.medicineName.trim().toLowerCase() &&
              (ri.batch || "").trim().toLowerCase() === (it.batch || "").trim().toLowerCase())
        );
        return sum + (found ? Number(found.returnedQty) || 0 : 0);
      }, 0);
      const remainingReturnable = Math.max(0, it.originalQty - previouslyReturned);
      if (it.returnedQty > remainingReturnable) {
        return {
          ret: {} as any,
          error: `Return quantity (${it.returnedQty}) for ${it.medicineName} exceeds eligible sold quantity (${remainingReturnable}).`,
        };
      }
    }

    // 1. Optimistic state update
    const restoredMeds: { id: string; stock: number }[] = [];
    setState((s) => {
      s.salesReturns.unshift(record);
      // Restore stock only for saleable items physically accepted back
      payload.returnItems.forEach((it) => {
        if ((it as any).isSaleable !== false) {
          const unitsToRestore = it.returnedQty; // exact base units only
          let med = s.medicines.find((m) => m.id === it.medicineId && it.medicineId)
            ?? s.medicines.find((m) => m.name === it.medicineName && m.batch === it.batch)
            ?? s.medicines.find((m) => m.name === it.medicineName);
          if (med) {
            med.stock += unitsToRestore;
            restoredMeds.push({ id: med.id, stock: med.stock });
          }
        }
      });
    });

    audit({
      actor: actorLabel(actor),
      action: "sale.return",
      module: "Billing",
      target: returnNo,
      detail: `Ref: ${payload.originalSaleId} · ₹${totalReturn.toFixed(2)} · ${payload.reason}`,
    });

    // 2. Persist to Supabase
    const { error } = await sb_insertSalesReturn(tid, record);
    // 3. Update medicine stock in Supabase
    for (const item of restoredMeds) {
      sb_updateMedicine(tid, item.id, { stock: item.stock }).catch((err) =>
        console.error("[store] createSalesReturn stock restore failed:", err),
      );
    }
    return { ret: record, error };
  },

  async deleteSalesReturn(id: string, actor?: { id: string; name: string }): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    // NOTE: Deleting a return does NOT re-deduct stock. Only use for data corrections.
    setState((s) => { s.salesReturns = s.salesReturns.filter((x) => x.id !== id); });
    audit({ actor: actorLabel(actor), action: "sale.return.delete", module: "Billing", target: id });
    const { error } = await sb_deleteSalesReturn(tid, id);
    return { error };
  },


  syncPurchaseReturns(tenantId?: string) {
    return syncPurchaseReturnsFromSupabase(tenantId);
  },

  /**
   * Create a purchase return to supplier.
   *
   * - Deducts returned stock from medicines (since returned items leave the pharmacy).
   * - Does NOT alter the original purchase record.
   */
  async createPurchaseReturn(
    payload: {
      originalPurchaseId: string;
      supplierId: string | null;
      supplierName: string;
      returnItems: {
        medicineId: string;
        medicineName: string;
        batch: string;
        expiry: string;
        returnedQty: number; // units being returned (base units)
        originalQty: number;
        purchaseRate: number;
        gst: number;
        returnAmount: number;
      }[];
      reason: string;
    },
    actor?: { id: string; name: string },
  ): Promise<{ ret: PurchaseReturn; error: string | null; permissionDenied?: boolean }> {
    const tid = getCurrentTenantId();
    if (!tid) return { ret: {} as any, error: "Tenant ID required" };

    const now = new Date().toISOString();
    const id = "PR" + Date.now().toString().slice(-8);
    const returnNo = "PRTN" + Date.now().toString().slice(-6);

    const totalReturn = payload.returnItems.reduce((s, it) => s + it.returnAmount, 0);
    const totalGst = payload.returnItems.reduce((s, it) => {
      const taxable = it.returnAmount / (1 + it.gst / 100);
      return s + (it.returnAmount - taxable);
    }, 0);

    const record: PurchaseReturn = {
      id,
      tenantId: tid,
      returnNo,
      originalPurchaseId: payload.originalPurchaseId,
      supplierId: payload.supplierId,
      supplierName: payload.supplierName,
      items: payload.returnItems.map((it) => ({
        medicineId: it.medicineId,
        medicineName: it.medicineName,
        batch: it.batch,
        expiry: it.expiry,
        returnedQty: it.returnedQty,
        originalQty: it.originalQty,
        purchaseRate: it.purchaseRate,
        gst: it.gst,
        returnAmount: it.returnAmount,
      })),
      returnAmount: +totalReturn.toFixed(2),
      gstAmount: +totalGst.toFixed(2),
      reason: payload.reason,
      returnDate: now,
      status: "completed",
      processedBy: actor?.id ?? "system",
      processedByName: actor?.name ?? "system",
      createdAt: now,
    };

    // 1. Update local purchase returns state & deduct stock
    const affectedMeds: { id: string; stock: number }[] = [];
    setState((s) => {
      s.purchaseReturns = [record, ...s.purchaseReturns.filter((x) => x.id !== record.id)];
      payload.returnItems.forEach((it) => {
        let med = s.medicines.find((m) => m.id === it.medicineId && it.medicineId)
          ?? s.medicines.find((m) => m.name === it.medicineName && m.batch === it.batch)
          ?? s.medicines.find((m) => m.name === it.medicineName);
        if (med) {
          med.stock = Math.max(0, med.stock - it.returnedQty);
          affectedMeds.push({ id: med.id, stock: med.stock });
        }
      });
    });

    // 2. Deduct medicine stock in Supabase
    for (const item of affectedMeds) {
      sb_updateMedicine(tid, item.id, { stock: item.stock }).catch((err) =>
        console.error("[store] createPurchaseReturn stock deduction failed:", err),
      );
    }

    audit({
      actor: actorLabel(actor),
      action: "purchase.return",
      module: "Purchase",
      target: returnNo,
      detail: `Supplier: ${payload.supplierName} · Ref: ${payload.originalPurchaseId} · ₹${totalReturn.toFixed(2)} · ${payload.reason}`,
    });

    // 3. Persist to Supabase purchase_returns
    const { error: insertError } = await sb_insertPurchaseReturn(tid, record);
    if (!insertError) {
      await syncPurchaseReturnsFromSupabase(tid);
    }

    const isPermDenied = insertError ? insertError.toLowerCase().includes("permission denied") : false;

    return {
      ret: record,
      error: insertError,
      permissionDenied: isPermDenied,
    };
  },

  async deletePurchaseReturn(id: string, actor?: { id: string; name: string }): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    // 1. Delete from Supabase first
    const { error } = await sb_deletePurchaseReturn(tid, id);
    if (!error) {
      audit({ actor: actorLabel(actor), action: "purchase.return.delete", module: "Purchase", target: id });
      // 2. Refetch cleanly from Supabase
      await syncPurchaseReturnsFromSupabase(tid);
    }
    return { error };
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

  syncFinanceEntries(tenantId?: string) {
    return syncFinanceEntriesFromSupabase(tenantId);
  },
  async addFinanceEntry(entry: Omit<FinanceEntry, "id" | "createdAt">): Promise<{ entry: FinanceEntry; error: string | null }> {
    const tid = getCurrentTenantId();
    const created: FinanceEntry = {
      ...entry,
      id: "FE" + Date.now().toString().slice(-8),
      tenantId: tid,
      sourceType: entry.sourceType || (entry.type === "income" ? "MANUAL_INCOME" : "MANUAL_EXPENSE"),
      createdAt: new Date().toISOString(),
    };
    setState((s) => {
      s.financeEntries.unshift(created);
    });
    audit({ actor: "system", action: entry.type === "income" ? "income.add" : "expense.add", module: "Accounts", target: created.title, detail: `₹${created.amount} · ${created.category} (${created.paymentMode})` });
    const { error } = await sb_insertFinanceEntry(tid, created);
    return { entry: created, error };
  },
  async deleteFinanceEntry(id: string): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    setState((s) => { s.financeEntries = s.financeEntries.filter((e) => e.id !== id); });
    audit({ actor: "system", action: "finance.delete", module: "Accounts", target: id });
    const { error } = await sb_deleteFinanceEntry(tid, id);
    return { error };
  },

  syncAttendance(tenantId?: string) {
    return syncAttendanceFromSupabase(tenantId);
  },
  async addAttendance(rec: Omit<AttendanceRecord, "id" | "createdAt">): Promise<{ record: AttendanceRecord; error: string | null }> {
    const tid = getCurrentTenantId();
    const existing = state.attendance.find((a) => a.employeeId === rec.employeeId && a.date === rec.date);
    const id = existing?.id || ("AT" + Date.now().toString().slice(-8));
    const newRecord: AttendanceRecord = {
      ...rec,
      id,
      tenantId: tid,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setState((s) => {
      // Remove any existing record for same employee + date before adding (deduplication)
      s.attendance = s.attendance.filter(
        (a) => !(a.employeeId === rec.employeeId && a.date === rec.date)
      );
      s.attendance.unshift(newRecord);
    });

    const { error } = await sb_upsertAttendance(tid, newRecord);
    audit({ actor: "system", action: "attendance.mark", module: "Attendance", target: rec.employeeName, detail: `Date: ${rec.date} · Status: ${rec.status}` });
    return { record: newRecord, error };
  },
  async updateAttendance(id: string, patch: Partial<AttendanceRecord>): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    let updated: AttendanceRecord | undefined;
    setState((s) => {
      const idx = s.attendance.findIndex((a) => a.id === id);
      if (idx >= 0) {
        s.attendance[idx] = { ...s.attendance[idx], ...patch, updatedAt: new Date().toISOString() };
        updated = s.attendance[idx];
      }
    });
    if (updated) {
      const { error } = await sb_upsertAttendance(tid, updated);
      audit({ actor: "system", action: "attendance.update", module: "Attendance", target: updated.employeeName, detail: `Status: ${updated.status}` });
      return { error };
    }
    return { error: "Record not found" };
  },
  async deleteAttendance(id: string): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    setState((s) => { s.attendance = s.attendance.filter((a) => a.id !== id); });
    audit({ actor: "system", action: "attendance.delete", module: "Attendance", target: id });
    const { error } = await sb_deleteAttendance(tid, id);
    return { error };
  },

  syncSalaryPayments(tenantId?: string) {
    return syncSalaryPaymentsFromSupabase(tenantId);
  },
  async addSalaryPayment(payment: {
    employeeId: string;
    employeeName?: string;
    month: string;
    netPayable?: number;
    amountPaid?: number;
    amount?: number;
    paymentDate?: string;
    paymentMode?: string;
    status?: "paid" | "partial";
    notes?: string;
  }): Promise<{ payment: SalaryPayment; error: string | null }> {
    const tid = getCurrentTenantId();
    const actualAmt = Number(payment.amountPaid ?? payment.amount) || 0;
    const net = Number(payment.netPayable) || actualAmt;
    const status: "paid" | "partial" = payment.status || (actualAmt >= net ? "paid" : "partial");
    const pDate = payment.paymentDate || new Date().toISOString().slice(0, 10);

    const existing = state.salaryPayments.find((p) => p.employeeId === payment.employeeId && p.month === payment.month);
    const recId = existing?.id || ("SP" + Date.now().toString().slice(-8));

    const rec: SalaryPayment = {
      id: recId,
      tenantId: tid,
      employeeId: payment.employeeId,
      employeeName: payment.employeeName || payment.employeeId,
      month: payment.month,
      netPayable: net,
      amountPaid: actualAmt,
      amount: actualAmt,
      paymentDate: pDate,
      paymentMode: payment.paymentMode || "Cash",
      status,
      notes: payment.notes || undefined,
      paidAt: existing?.paidAt || new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    setState((s) => {
      // Prevent duplicate payment for same employee + month
      s.salaryPayments = s.salaryPayments.filter(
        (p) => !(p.employeeId === rec.employeeId && p.month === rec.month)
      );
      s.salaryPayments.unshift(rec);
    });

    const { error } = await sb_insertSalaryPayment(tid, rec);
    audit({ actor: "system", action: "salary.pay", module: "Payroll", target: rec.employeeName || rec.employeeId, detail: `Month: ${rec.month} · ₹${rec.amountPaid} (${rec.paymentMode})` });
    return { payment: rec, error };
  },
  async deleteSalaryPayment(id: string): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    setState((s) => { s.salaryPayments = s.salaryPayments.filter((p) => p.id !== id); });
    audit({ actor: "system", action: "salary.delete", module: "Payroll", target: id });
    const { error } = await sb_deleteSalaryPayment(tid, id);
    return { error };
  },

  // ── Loans ────────────────────────────────────────────────────────────────

  syncLoans(tenantId?: string) {
    return syncLoansFromSupabase(tenantId);
  },

  /**
   * Save the current bill as a customer loan/credit.
   * - Saves the sale normally (stock deducted, sale recorded in Supabase)
   * - Creates a loan record linked to the sale ID
   * - Increases customer balance by grand total
   * - Is duplicate-safe: the saleId is unique, no second loan can be created for same bill
   */
  async saveSaleAsLoan(
    sale: Omit<Sale, "id" | "date" | "status">,
    actor?: { id: string; name: string },
  ): Promise<{ sale: Sale; loanError: string | null; saleError: string | null }> {
    const tid = getCurrentTenantId();

    // 1. Save the sale with payment mode "Credit / Loan"
    const saleWithPayment = { ...sale, payment: "Credit / Loan" };
    const { sale: savedSale, error: saleError } = await actions.saveSale(saleWithPayment, actor);
    if (saleError) {
      return { sale: savedSale, loanError: null, saleError };
    }

    // 2. Create the local loan record (for Loans page)
    const loanNote = `Credit sale - ${savedSale.id}`;
    actions.addLoan({
      customerId: savedSale.customerId ?? "",
      customerName: savedSale.customerName,
      customerPhone: savedSale.phone,
      type: "issue",
      amount: savedSale.grand,
      date: new Date().toISOString().slice(0, 10),
      note: loanNote,
      saleId: savedSale.id,
    });

    // 3. Persist loan to Supabase (non-blocking, don't fail the sale for this)
    const loanInput: CreateLoanInput = {
      tenantId: tid,
      customerId: savedSale.customerId,
      customerName: savedSale.customerName,
      phone: savedSale.phone || null,
      saleId: savedSale.id,
      amount: savedSale.grand,
      note: loanNote,
    };
    const { error: loanError } = await sb_createLoan(loanInput);

    return { sale: savedSale, loanError, saleError: null };
  },

  /**
   * Record a repayment from Billing page.
   * Updates customer balance locally and in Supabase.
   */
  async recordLoanRepayment(
    customerId: string,
    amount: number,
    note?: string,
  ): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();

    // Create local loan record (type payment)
    const cust = state.customers.find((c) => c.id === customerId);
    if (cust) {
      actions.addLoan({
        customerId,
        customerName: cust.name,
        customerPhone: cust.phone,
        type: "payment",
        amount,
        date: new Date().toISOString().slice(0, 10),
        note: note?.trim() || "Repayment received",
      });
    }

    // Persist repayment to Supabase
    const { error } = await sb_recordRepayment({ tenantId: tid, customerId, amount, note });
    return { error };
  },

  addLoan(rec: Omit<LoanRecord, "id" | "createdAt">) {
    const tid = getCurrentTenantId();
    setState((s) => {
      const loan: LoanRecord = {
        ...rec,
        id: "LN" + Date.now().toString().slice(-8),
        createdAt: new Date().toISOString(),
      };
      s.loans.unshift(loan);
      // Update customer balance: issue increases balance (amount owed), payment reduces it
      const cust = s.customers.find((c) => c.id === rec.customerId);
      if (cust) {
        cust.balance = rec.type === "issue"
          ? (cust.balance || 0) + rec.amount
          : Math.max(0, (cust.balance || 0) - rec.amount);
        sb_updateCustomer(tid, cust.id, { balance: cust.balance }).catch(() => {});
      }
    });
    audit({ actor: "system", action: rec.type === "issue" ? "loan.issue" : "loan.payment", module: "Loans", target: rec.customerName, detail: `₹${rec.amount} · ${rec.note || "Loan record"}` });
  },
  deleteLoan(id: string) {
    const tid = getCurrentTenantId();
    const loan = state.loans.find((l) => l.id === id);
    if (!loan) return;
    setState((s) => {
      s.loans = s.loans.filter((l) => l.id !== id);
      // Reverse the balance impact
      const cust = s.customers.find((c) => c.id === loan.customerId);
      if (cust) {
        cust.balance = loan.type === "issue"
          ? Math.max(0, (cust.balance || 0) - loan.amount)
          : (cust.balance || 0) + loan.amount;
        sb_updateCustomer(tid, cust.id, { balance: cust.balance }).catch(() => {});
      }
    });
    audit({ actor: "system", action: "loan.delete", module: "Loans", target: id });
  },

  // ── GST Profile ──────────────────────────────────────────────────────────
  syncGSTProfile(tenantId?: string) {
    return syncGSTProfileFromSupabase(tenantId);
  },
  async updateGSTProfile(patch: Partial<GSTProfile>): Promise<{ profile: GSTProfile; error: string | null }> {
    const tid = getCurrentTenantId();
    let updatedProfile: GSTProfile = { ...state.gstProfile, ...patch };
    setState((s) => {
      s.gstProfile = { ...s.gstProfile, ...patch };
      updatedProfile = s.gstProfile;
    });
    audit({ actor: "system", action: "gst.update", module: "GST", target: updatedProfile.gstin, detail: `${updatedProfile.businessName} · ${updatedProfile.registrationType}` });
    const { error } = await sb_upsertGSTProfile(tid, updatedProfile);
    return { profile: updatedProfile, error };
  },

  // ── Custom Categories ────────────────────────────────────────────────────
  addCustomCategory(type: "income" | "expense", category: string) {
    const cat = category.trim();
    if (!cat) return;
    setState((s) => {
      if (!s.customCategories[type].includes(cat)) {
        s.customCategories[type].push(cat);
      }
    });
  },
  removeCustomCategory(type: "income" | "expense", category: string) {
    setState((s) => {
      s.customCategories[type] = s.customCategories[type].filter((c) => c !== category);
    });
  },

  updatePrinter(patch: Partial<PrinterSettings>) {
    setState((s) => { s.printer = { ...s.printer, ...patch }; });
    audit({ actor: "system", action: "printer.update", module: "Settings", target: patch.storeName || "Printer Settings", detail: `Paper: ${patch.paperSize || "default"}` });
  },

  syncAudit(tenantId?: string) {
    return syncAuditLogsFromSupabase(tenantId);
  },

  logLogin(actor: { id: string; name: string }) {
    audit({ actor: actorLabel(actor), action: "login", module: "Auth", target: actor.id, detail: `${actor.name} logged in` });
  },
  logLogout(actor?: { id: string; name: string }) {
    audit({
      actor: actor ? actorLabel(actor) : "user",
      action: "logout",
      module: "Auth",
      target: actor?.id ?? "session",
      detail: `${actor?.name ?? "User"} logged out`,
    });
  },
  recordLogout(actor?: { id: string; name: string }) {
    actions.logLogout(actor);
  },

  resetTenantLocalState() {
    state = structuredClone(EMPTY);
    persist();
    emit();
  },

  resetAll() {
    state = structuredClone(DEFAULT);
    persist();
    emit();
  },

  exportBackupPayload(businessName?: string): TenantBackupPayload {
    const tid = getCurrentTenantId();
    const bName =
      businessName ||
      state.printer.storeName ||
      state.gstProfile.businessName ||
      "Medical Store";
    return {
      backupVersion: 1,
      tenantId: tid,
      businessName: bName,
      createdAt: new Date().toISOString(),
      appVersion: "1.0.0",
      medicines: state.medicines,
      customers: state.customers,
      suppliers: state.suppliers,
      sales: state.sales,
      purchases: state.purchases,
      loans: state.loans,
      employees: state.employees,
      attendance: state.attendance,
      salaryPayments: state.salaryPayments,
      financeEntries: state.financeEntries,
      gstProfile: state.gstProfile,
      printer: state.printer,
      customCategories: state.customCategories,
      audit: state.audit,
    };
  },

  exportJSON(): string {
    return JSON.stringify(actions.exportBackupPayload(), null, 2);
  },

  async restoreBackupPayload(payload: TenantBackupPayload): Promise<{ error: string | null }> {
    const tid = getCurrentTenantId();
    if (payload.tenantId && payload.tenantId !== tid) {
      return {
        error: `This backup belongs to a different business (${payload.businessName || payload.tenantId}) and cannot be restored here.`,
      };
    }

    setState((s) => {
      s.medicines = payload.medicines ?? s.medicines;
      s.customers = payload.customers ?? s.customers;
      s.suppliers = payload.suppliers ?? s.suppliers;
      s.sales = payload.sales ?? s.sales;
      s.purchases = payload.purchases ?? s.purchases;
      s.loans = payload.loans ?? s.loans;
      s.employees = payload.employees ?? s.employees;
      s.attendance = payload.attendance ?? s.attendance;
      s.salaryPayments = payload.salaryPayments ?? s.salaryPayments;
      s.financeEntries = payload.financeEntries ?? s.financeEntries;
      s.gstProfile = payload.gstProfile ?? s.gstProfile;
      s.printer = payload.printer ?? s.printer;
      s.customCategories = payload.customCategories ?? s.customCategories;
      if (Array.isArray(payload.audit)) {
        s.audit = payload.audit;
      }
    });

    audit({
      actor: "system",
      action: "backup.restore",
      module: "Settings",
      target: tid,
      detail: `Restored backup from ${payload.createdAt}`,
    });

    // Re-push restored records to Supabase asynchronously
    if (payload.medicines && payload.medicines.length > 0) {
      sb_bulkInsertMedicines(tid, payload.medicines).catch(() => {});
    }
    if (payload.customers && payload.customers.length > 0) {
      sb_bulkInsertCustomers(tid, payload.customers).catch(() => {});
    }
    if (payload.gstProfile) {
      sb_upsertGSTProfile(tid, payload.gstProfile).catch(() => {});
    }

    return { error: null };
  },

  importJSON(json: string): { error: string | null } {
    try {
      const parsed = JSON.parse(json);
      if (parsed.backupVersion && parsed.tenantId) {
        actions.restoreBackupPayload(parsed as TenantBackupPayload);
        return { error: null };
      }
      // Legacy JSON fallback
      state = { ...DEFAULT, ...parsed };
      persist();
      emit();
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || "Invalid JSON" };
    }
  },
};

export function useHydrated() {
  const [ok, setOk] = useState(false);
  useEffect(() => { hydrate(); setOk(true); }, []);
  return ok;
}
