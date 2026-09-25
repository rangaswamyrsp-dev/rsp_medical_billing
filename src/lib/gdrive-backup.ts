// ── Google Drive Backup & Multi-tenant Restore Service ───────────────────────
//
// Manages Google OAuth token, folder resolution ("RSP Medical Billing Backups"),
// JSON backup creation, Google Drive upload/download, restore preview validation,
// and safe tenant-isolated database reset.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import type {
  Medicine, Customer, Supplier, Sale, Purchase, LoanRecord,
  Employee, AttendanceRecord, SalaryPayment, FinanceEntry,
  GSTProfile, PrinterSettings, CustomCategories, AuditEntry,
} from "@/lib/store";

export type TenantBackupPayload = {
  backupVersion: number;
  tenantId: string;
  businessName: string;
  createdAt: string;
  appVersion?: string;
  medicines: Medicine[];
  customers: Customer[];
  suppliers: Supplier[];
  sales: Sale[];
  purchases: Purchase[];
  loans: LoanRecord[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  salaryPayments: SalaryPayment[];
  financeEntries: FinanceEntry[];
  gstProfile: GSTProfile;
  printer: PrinterSettings;
  customCategories: CustomCategories;
  audit?: AuditEntry[];
};

export type DriveBackupFileItem = {
  id: string;
  name: string;
  size: number;
  createdTime: string;
  tenantId?: string;
  businessName?: string;
};

export type GDriveUser = {
  email: string;
  name?: string;
  picture?: string;
};

const GDRIVE_FOLDER_NAME = "RSP Medical Billing Backups";
const KEY_ACCESS_TOKEN = "rsp_gdrive_access_token";
const KEY_USER = "rsp_gdrive_user";
const KEY_CLIENT_ID = "rsp_gdrive_client_id";
const KEY_LAST_BACKUP_DATE_PREFIX = "rsp_last_backup_date_";
const KEY_LAST_BACKUP_TIME_PREFIX = "rsp_last_backup_time_";
const KEY_LAST_BACKUP_STATUS_PREFIX = "rsp_last_backup_status_";
const KEY_LOCAL_DRIVE_BACKUPS = "rsp_simulated_drive_backups_";

// ── Auth & Session Management ───────────────────────────────────────────────

export function getStoredGDriveUser(): GDriveUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY_USER);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function getStoredGDriveToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_ACCESS_TOKEN);
}

export function getStoredClientId(): string {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem(KEY_CLIENT_ID) ||
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ||
    ""
  );
}

export function saveStoredClientId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_CLIENT_ID, id.trim());
}

export function disconnectGoogleDrive(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_ACCESS_TOKEN);
  localStorage.removeItem(KEY_USER);
}

/** Connect to Google Drive using token or manual auth flow */
export async function connectGoogleDriveWithToken(
  token: string,
  user: GDriveUser
): Promise<void> {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_ACCESS_TOKEN, token);
  localStorage.setItem(KEY_USER, JSON.stringify(user));
}

// ── Backup Metadata & Last Run ──────────────────────────────────────────────

export function getLastBackupInfo(tenantId: string): {
  date: string | null;
  time: string | null;
  status: "Successful" | "Failed" | "Idle";
} {
  if (typeof window === "undefined") return { date: null, time: null, status: "Idle" };
  const date = localStorage.getItem(KEY_LAST_BACKUP_DATE_PREFIX + tenantId);
  const time = localStorage.getItem(KEY_LAST_BACKUP_TIME_PREFIX + tenantId);
  const status = (localStorage.getItem(KEY_LAST_BACKUP_STATUS_PREFIX + tenantId) as any) || "Idle";
  return { date, time, status };
}

export function recordBackupResult(
  tenantId: string,
  status: "Successful" | "Failed"
): void {
  if (typeof window === "undefined") return;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
  localStorage.setItem(KEY_LAST_BACKUP_DATE_PREFIX + tenantId, dateStr);
  localStorage.setItem(KEY_LAST_BACKUP_TIME_PREFIX + tenantId, timeStr);
  localStorage.setItem(KEY_LAST_BACKUP_STATUS_PREFIX + tenantId, status);
}

// ── Google Drive API Helpers ────────────────────────────────────────────────

/**
 * Searches for or creates the application backup folder in Google Drive.
 * Scoped to folder name "RSP Medical Billing Backups".
 */
export async function getOrCreateDriveFolder(accessToken: string): Promise<string> {
  // 1. Search for existing folder
  const query = `name = '${GDRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error(`Google Drive folder check failed: ${res.statusText}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // 2. Create folder if not found
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: GDRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create Google Drive folder: ${createRes.statusText}`);
  }

  const created = await createRes.json();
  return created.id;
}

/** Uploads a JSON backup payload to the Google Drive folder */
export async function uploadBackupToDrive(
  accessToken: string,
  backup: TenantBackupPayload
): Promise<{ fileId: string; error: string | null }> {
  try {
    const folderId = await getOrCreateDriveFolder(accessToken);
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[:.]/g, "-");
    const fileName = `rsp-backup-${backup.tenantId}-${dateStamp}.json`;

    const metadata = {
      name: fileName,
      parents: [folderId],
      description: `RSP Backup for ${backup.businessName} (Tenant ${backup.tenantId})`,
      properties: {
        tenantId: backup.tenantId,
        businessName: backup.businessName,
        createdAt: backup.createdAt,
      },
    };

    const boundary = "-------314159265358979323846";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const jsonContent = JSON.stringify(backup, null, 2);
    const multipartRequestBody =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: application/json\r\n\r\n" +
      jsonContent +
      closeDelimiter;

    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return { fileId: "", error: `Upload failed (${res.status}): ${errText}` };
    }

    const data = await res.json();
    return { fileId: data.id, error: null };
  } catch (err: any) {
    return { fileId: "", error: err?.message ?? String(err) };
  }
}

/** Fetches existing backups for the current tenant from the Drive folder */
export async function fetchDriveBackups(
  accessToken: string,
  tenantId: string
): Promise<{ files: DriveBackupFileItem[]; error: string | null }> {
  try {
    const folderId = await getOrCreateDriveFolder(accessToken);
    const query = `'${folderId}' in parents and trashed = false`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        query
      )}&fields=files(id, name, size, createdTime, description, properties)&orderBy=createdTime desc`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      return { files: [], error: `Failed to list files: ${res.statusText}` };
    }

    const data = await res.json();
    const allFiles = data.files ?? [];

    // Filter to backups matching the current tenant
    const tenantFiles: DriveBackupFileItem[] = allFiles
      .filter((f: any) => {
        if (f.properties?.tenantId) {
          return f.properties.tenantId === tenantId;
        }
        return f.name.includes(`-${tenantId}-`) || f.name.startsWith(`rsp-backup-${tenantId}`);
      })
      .map((f: any) => ({
        id: f.id,
        name: f.name,
        size: Number(f.size) || 0,
        createdTime: f.createdTime || new Date().toISOString(),
        tenantId,
        businessName: f.properties?.businessName,
      }));

    return { files: tenantFiles, error: null };
  } catch (err: any) {
    return { files: [], error: err?.message ?? String(err) };
  }
}

/** Downloads and parses a backup file content from Google Drive */
export async function fetchDriveBackupContent(
  accessToken: string,
  fileId: string
): Promise<{ backup: TenantBackupPayload | null; error: string | null }> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      return { backup: null, error: `Download failed: ${res.statusText}` };
    }

    const json = await res.json();
    return { backup: json as TenantBackupPayload, error: null };
  } catch (err: any) {
    return { backup: null, error: err?.message ?? String(err) };
  }
}

// ── Simulated Cloud Drive Storage (Fallback / Local Testing Mode) ───────────

export function getSimulatedDriveBackups(tenantId: string): DriveBackupFileItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_LOCAL_DRIVE_BACKUPS + tenantId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSimulatedDriveBackup(
  tenantId: string,
  payload: TenantBackupPayload
): DriveBackupFileItem {
  const existing = getSimulatedDriveBackups(tenantId);
  const jsonStr = JSON.stringify(payload);
  const now = new Date();
  const item: DriveBackupFileItem = {
    id: "SIM_" + Date.now(),
    name: `rsp-backup-${tenantId}-${now.toISOString().slice(0, 10)}.json`,
    size: new Blob([jsonStr]).size,
    createdTime: now.toISOString(),
    tenantId,
    businessName: payload.businessName,
  };

  // Store metadata
  const updated = [item, ...existing].slice(0, 20);
  localStorage.setItem(KEY_LOCAL_DRIVE_BACKUPS + tenantId, JSON.stringify(updated));
  // Store payload
  localStorage.setItem(`rsp_sim_content_${item.id}`, jsonStr);
  return item;
}

export function getSimulatedDriveBackupContent(fileId: string): TenantBackupPayload | null {
  try {
    const raw = localStorage.getItem(`rsp_sim_content_${fileId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Backup Validation & Safety ──────────────────────────────────────────────

export function validateBackupPayload(
  payload: any,
  currentTenantId: string
): {
  valid: boolean;
  error?: string;
  counts?: Record<string, number>;
} {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Invalid backup format: root must be a JSON object" };
  }

  // 1. Tenant isolation validation
  if (!payload.tenantId) {
    return { valid: false, error: "Backup is missing tenant ID identifier" };
  }

  if (payload.tenantId !== currentTenantId) {
    return {
      valid: false,
      error: `This backup belongs to a different business (${payload.businessName || payload.tenantId}) and cannot be restored here. Multi-tenant security blocks this operation.`,
    };
  }

  // 2. Data sections verification
  const counts: Record<string, number> = {
    medicines: Array.isArray(payload.medicines) ? payload.medicines.length : 0,
    customers: Array.isArray(payload.customers) ? payload.customers.length : 0,
    suppliers: Array.isArray(payload.suppliers) ? payload.suppliers.length : 0,
    sales: Array.isArray(payload.sales) ? payload.sales.length : 0,
    purchases: Array.isArray(payload.purchases) ? payload.purchases.length : 0,
    loans: Array.isArray(payload.loans) ? payload.loans.length : 0,
    employees: Array.isArray(payload.employees) ? payload.employees.length : 0,
    attendance: Array.isArray(payload.attendance) ? payload.attendance.length : 0,
    salaryPayments: Array.isArray(payload.salaryPayments) ? payload.salaryPayments.length : 0,
    financeEntries: Array.isArray(payload.financeEntries) ? payload.financeEntries.length : 0,
  };

  return { valid: true, counts };
}

// ── Database Reset & Restore Operations ─────────────────────────────────────

/**
 * Permanently deletes all records belonging to `currentTenantId` from Supabase.
 * Respects foreign keys by deleting child tables first.
 * Never deletes other tenants, superadmin, or tables schema.
 */
export async function executeTenantDatabaseReset(
  tenantId: string
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  try {
    // 1. Child tables first
    await supabase.from("sale_items").delete().eq("tenant_id", tenantId);
    await supabase.from("sales").delete().eq("tenant_id", tenantId);
    await supabase.from("purchase_items").delete().eq("tenant_id", tenantId);
    await supabase.from("purchases").delete().eq("tenant_id", tenantId);
    await supabase.from("loan_transactions").delete().eq("tenant_id", tenantId);
    await supabase.from("loans").delete().eq("tenant_id", tenantId);

    // 2. Standalone tenant tables
    await supabase.from("finance_entries").delete().eq("tenant_id", tenantId);
    await supabase.from("salary_payments").delete().eq("tenant_id", tenantId);
    await supabase.from("attendance").delete().eq("tenant_id", tenantId);
    await supabase.from("customers").delete().eq("tenant_id", tenantId);
    await supabase.from("suppliers").delete().eq("tenant_id", tenantId);
    await supabase.from("medicines").delete().eq("tenant_id", tenantId);

    // 3. Audit log for tenant
    await supabase.from("audit_logs").delete().eq("tenant_id", tenantId);

    return { error: null };
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}
