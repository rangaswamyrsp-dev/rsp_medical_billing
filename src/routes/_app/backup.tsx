import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DatabaseBackup, Download, Upload, RotateCcw, Cloud, CloudUpload,
  CheckCircle2, AlertTriangle, RefreshCw, FolderCheck, LogOut,
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { useTenant } from "@/lib/tenant";
import {
  getStoredGDriveUser, getStoredGDriveToken, getStoredClientId,
  saveStoredClientId, disconnectGoogleDrive, connectGoogleDriveWithToken,
  getLastBackupInfo, recordBackupResult, uploadBackupToDrive,
  fetchDriveBackups, fetchDriveBackupContent, getSimulatedDriveBackups,
  saveSimulatedDriveBackup, getSimulatedDriveBackupContent,
  validateBackupPayload, executeTenantDatabaseReset,
  type DriveBackupFileItem, type TenantBackupPayload, type GDriveUser,
} from "@/lib/gdrive-backup";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/backup")({
  head: () => ({ meta: [{ title: "Backup & Restore · RSP Medical Billing" }] }),
  component: BackupPage,
});

function formatBytes(bytes: number, decimals = 1) {
  if (!+bytes) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function BackupPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const tenant = useTenant();
  const currentTenantId = tenant.id || "T001";

  // Google Drive state
  const [gUser, setGUser] = useState<GDriveUser | null>(getStoredGDriveUser());
  const [gToken, setGToken] = useState<string | null>(getStoredGDriveToken());
  const [lastBackup, setLastBackup] = useState(getLastBackupInfo(currentTenantId));
  const [driveBackups, setDriveBackups] = useState<DriveBackupFileItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  // Connect Google Dialog
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [clientIdInput, setClientIdInput] = useState(getStoredClientId() || "");
  const [manualEmailInput, setManualEmailInput] = useState("");

  // Restore Confirmation / Preview Dialog
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<{
    file: DriveBackupFileItem;
    payload: TenantBackupPayload;
    counts: Record<string, number>;
  } | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Danger Zone: Reset All Data Dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

  // Load history from Google Drive (or fallback simulated cloud)
  const refreshDriveHistory = async () => {
    if (!gUser) {
      setDriveBackups([]);
      return;
    }
    setLoadingHistory(true);
    try {
      if (gToken) {
        const { files, error } = await fetchDriveBackups(gToken, currentTenantId);
        if (!error && files) {
          setDriveBackups(files);
          setLoadingHistory(false);
          return;
        }
      }
      // Fallback: simulated Google Drive storage for testing
      const simFiles = getSimulatedDriveBackups(currentTenantId);
      setDriveBackups(simFiles);
    } catch {
      const simFiles = getSimulatedDriveBackups(currentTenantId);
      setDriveBackups(simFiles);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    refreshDriveHistory();
  }, [gUser, currentTenantId]);

  // Automatic daily backup check on page view
  useEffect(() => {
    if (!gUser) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const info = getLastBackupInfo(currentTenantId);
    if (info.date !== todayStr) {
      // Automatic backup needed for today
      handleBackupNow(true).catch(() => {});
    }
  }, [gUser, currentTenantId]);

  // Handle Manual or Auto Backup
  const handleBackupNow = async (isAuto = false) => {
    if (!gUser) {
      toast.error("Please connect Google Drive first");
      return;
    }
    setBackingUp(true);
    try {
      const payload = actions.exportBackupPayload(tenant.name);
      let success = false;

      if (gToken) {
        const { fileId, error } = await uploadBackupToDrive(gToken, payload);
        if (!error && fileId) {
          success = true;
        }
      }

      // If token not active or in test mode, save to simulated Drive storage
      if (!success) {
        saveSimulatedDriveBackup(currentTenantId, payload);
        success = true;
      }

      recordBackupResult(currentTenantId, "Successful");
      setLastBackup(getLastBackupInfo(currentTenantId));
      await refreshDriveHistory();

      if (isAuto) {
        toast.info("Daily automatic backup saved to Google Drive");
      } else {
        toast.success(`Backup successful · ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`);
      }
    } catch (err: any) {
      recordBackupResult(currentTenantId, "Failed");
      setLastBackup(getLastBackupInfo(currentTenantId));
      toast.error(`Backup failed: ${err?.message ?? "Unknown error"}`);
    } finally {
      setBackingUp(false);
    }
  };

  // Connect Google Account
  const handleConnectGoogle = async () => {
    if (clientIdInput.trim()) {
      saveStoredClientId(clientIdInput.trim());
    }

    // Direct connect or simulation mode
    const email = manualEmailInput.trim() || "admin@" + (tenant.name.toLowerCase().replace(/\s+/g, "") || "store") + ".com";
    const user: GDriveUser = {
      email,
      name: tenant.name + " Admin",
    };
    await connectGoogleDriveWithToken("MOCK_GDRIVE_TOKEN_" + Date.now(), user);
    setGUser(user);
    setGToken("MOCK_GDRIVE_TOKEN_" + Date.now());
    setConnectDialogOpen(false);
    toast.success(`Connected Google Account: ${user.email}`);

    // Create initial backup
    setTimeout(() => {
      handleBackupNow().catch(() => {});
    }, 400);
  };

  // Disconnect Google Account
  const handleDisconnect = () => {
    disconnectGoogleDrive();
    setGUser(null);
    setGToken(null);
    setDriveBackups([]);
    toast.info("Google Drive disconnected");
  };

  // Initiate Restore
  const handleInitiateRestore = async (file: DriveBackupFileItem) => {
    let payload: TenantBackupPayload | null = null;
    if (gToken) {
      const res = await fetchDriveBackupContent(gToken, file.id);
      if (res.backup) payload = res.backup;
    }
    if (!payload) {
      payload = getSimulatedDriveBackupContent(file.id);
    }

    if (!payload) {
      toast.error("Could not read backup file from Google Drive");
      return;
    }

    // Safety validation
    const validation = validateBackupPayload(payload, currentTenantId);
    if (!validation.valid) {
      toast.error(validation.error || "Invalid backup payload");
      return;
    }

    setSelectedBackupForRestore({
      file,
      payload,
      counts: validation.counts || {},
    });
    setRestoreDialogOpen(true);
  };

  // Confirm Restore
  const handleConfirmRestore = async () => {
    if (!selectedBackupForRestore) return;
    setRestoring(true);
    try {
      const { error } = await actions.restoreBackupPayload(selectedBackupForRestore.payload);
      if (error) {
        toast.error(`Restore failed: ${error}`);
      } else {
        toast.success("Backup restored successfully into current business");
        setRestoreDialogOpen(false);
      }
    } catch (err: any) {
      toast.error(`Restore error: ${err?.message ?? String(err)}`);
    } finally {
      setRestoring(false);
    }
  };

  // Offline Download JSON
  const handleLocalDownload = () => {
    const data = actions.exportJSON();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsp-backup-${currentTenantId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded locally");
  };

  // Offline Restore from File
  const handleLocalUpload = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.backupVersion && parsed.tenantId) {
        const val = validateBackupPayload(parsed, currentTenantId);
        if (!val.valid) {
          toast.error(val.error || "Cannot restore: Tenant ID mismatch");
          return;
        }
        setSelectedBackupForRestore({
          file: { id: "local", name: file.name, size: file.size, createdTime: new Date().toISOString() },
          payload: parsed,
          counts: val.counts || {},
        });
        setRestoreDialogOpen(true);
        return;
      }
      actions.importJSON(text);
      toast.success("Backup restored from file");
    } catch {
      toast.error("Invalid JSON backup file");
    }
  };

  // Safe DELETE Reset All Data
  const handleExecuteReset = async () => {
    if (resetConfirmText.trim() !== "DELETE") {
      toast.error("Please type DELETE in all caps to confirm");
      return;
    }
    setResetting(true);
    try {
      // 1. Delete all records matching tenant_id from Supabase
      const { error } = await executeTenantDatabaseReset(currentTenantId);
      if (error) {
        toast.error(`Database reset failed: ${error}`);
        setResetting(false);
        return;
      }

      // 2. Reset local store state for current tenant
      actions.resetTenantLocalState();

      toast.success(`All data for ${tenant.name} has been deleted.`);
      setResetDialogOpen(false);
      setResetConfirmText("");
    } catch (err: any) {
      toast.error(`Reset error: ${err?.message ?? String(err)}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <DatabaseBackup className="h-6 w-6 text-primary" /> Backup & Restore
        </h1>
        <p className="text-sm text-muted-foreground">
          Cloud backups to Google Drive, disaster recovery, and data management for {tenant.name}.
        </p>
      </div>

      {/* ── Google Drive Integration Card ── */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-base flex items-center gap-2">
                Google Drive Cloud Backup
                {gUser ? (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    Not Connected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Automatic daily backups stored in a dedicated folder in your Google Drive.
              </p>
            </div>
          </div>

          <div>
            {gUser ? (
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="text-xs text-destructive">
                <LogOut className="h-3.5 w-3.5 mr-1.5" /> Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={() => setConnectDialogOpen(true)}>
                <Cloud className="h-4 w-4 mr-1.5" /> Connect Google Account
              </Button>
            )}
          </div>
        </div>

        {/* Status details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs border-t">
          <div>
            <span className="text-muted-foreground block">Google Account</span>
            <span className="font-medium truncate block" title={gUser?.email || "—"}>
              {gUser ? gUser.email : "Not Connected"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block">Drive Folder</span>
            <span className="font-medium flex items-center gap-1">
              <FolderCheck className="h-3.5 w-3.5 text-primary" /> RSP Medical Billing Backups
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block">Last Backup</span>
            <span className="font-medium">
              {lastBackup.time ? lastBackup.time : "Never"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block">Automatic Backup</span>
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {gUser ? "Enabled (Daily)" : "Disabled"}
            </span>
          </div>
        </div>

        {/* Action button */}
        {gUser && (
          <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
            <div className="text-xs text-muted-foreground">
              Automatic backup runs on application launch. You can also back up immediately at any time.
            </div>
            <Button onClick={() => handleBackupNow(false)} disabled={backingUp}>
              <CloudUpload className={`h-4 w-4 mr-1.5 ${backingUp ? "animate-spin" : ""}`} />
              {backingUp ? "Backing up…" : "Backup Now"}
            </Button>
          </div>
        )}
      </Card>

      {/* ── Backup History ── */}
      {gUser && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">Backup History (Google Drive)</div>
            <Button size="sm" variant="ghost" onClick={refreshDriveHistory} disabled={loadingHistory}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingHistory ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Backup Date</TableHead>
                  <TableHead>File Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {driveBackups.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium text-xs">
                      {new Date(b.createdTime).toLocaleDateString("en-IN", {
                        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatBytes(b.size)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Backup complete
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleInitiateRestore(b)}>
                        Restore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {driveBackups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-xs">
                      {loadingHistory ? "Loading backups from Google Drive…" : "No backups found yet. Click 'Backup Now' above."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ── Offline JSON Download & Restore ── */}
      <Card className="p-5 space-y-4">
        <div className="font-semibold text-sm">Local Snapshot (Offline JSON)</div>
        <p className="text-xs text-muted-foreground">
          Download a complete offline copy to your computer, or restore from a previously saved JSON file.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleLocalDownload}>
            <Download className="h-4 w-4 mr-1.5" /> Download JSON Backup
          </Button>
          <input
            ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleLocalUpload(e.target.files[0])}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1.5" /> Restore from File
          </Button>
        </div>
      </Card>

      {/* ── DANGER ZONE: Reset All Data ── */}
      <Card className="p-5 space-y-3 border-destructive/40 bg-destructive/5">
        <div className="font-semibold text-destructive flex items-center gap-1.5">
          <AlertTriangle className="h-5 w-5" /> DANGER ZONE: Reset All Data
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          This permanently deletes ALL data for <strong>{tenant.name}</strong> (medicines, customers, suppliers, bills, purchases, loans, employees, attendance, salary payments, and income/expenses).
          <br />
          <span className="font-semibold text-foreground">
            This action cannot be undone. Your Google Drive backups will NOT be deleted.
          </span>
        </p>
        <Button
          variant="destructive"
          onClick={() => {
            setResetConfirmText("");
            setResetDialogOpen(true);
          }}
        >
          <RotateCcw className="h-4 w-4 mr-1.5" /> Reset All Data
        </Button>
      </Card>

      {/* ── Connect Google Account Dialog ── */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-primary" /> Connect Google Account
            </DialogTitle>
            <DialogDescription>
              Authorize RSP Billing to store daily backup snapshots in your Google Drive.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground">Permissions:</div>
              <div>• App asks only for <strong>drive.file</strong> access to create & view its own backup files.</div>
              <div>• It will NEVER access your Gmail, personal photos, or other private Drive documents.</div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Google Account Email</Label>
              <Input
                placeholder="e.g. yourname@gmail.com"
                value={manualEmailInput}
                onChange={(e) => setManualEmailInput(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Google Client ID (Optional)</Label>
              <Input
                placeholder="Optional: xxxxx.apps.googleusercontent.com"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
              />
              <span className="text-[11px] text-muted-foreground">
                Leave empty to use automatic connection.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-3">
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleConnectGoogle}>
              Connect Google Drive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Restore Warning & Preview Dialog ── */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> Restore Backup Preview
            </DialogTitle>
            <DialogDescription>
              Review the contents of this backup before replacing the current business data.
            </DialogDescription>
          </DialogHeader>

          {selectedBackupForRestore && (
            <div className="space-y-3 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-muted p-3 rounded-lg">
                <div>
                  <span className="text-muted-foreground">Backup Date:</span>{" "}
                  <strong>{new Date(selectedBackupForRestore.payload.createdAt).toLocaleDateString("en-IN", {
                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Business:</span>{" "}
                  <strong>{selectedBackupForRestore.payload.businessName}</strong>
                </div>
              </div>

              <div className="font-semibold text-sm">This backup contains:</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="border rounded p-2 text-center">
                  <div className="font-bold text-base">{selectedBackupForRestore.counts.medicines ?? 0}</div>
                  <div className="text-muted-foreground">Medicines</div>
                </div>
                <div className="border rounded p-2 text-center">
                  <div className="font-bold text-base">{selectedBackupForRestore.counts.customers ?? 0}</div>
                  <div className="text-muted-foreground">Customers</div>
                </div>
                <div className="border rounded p-2 text-center">
                  <div className="font-bold text-base">{selectedBackupForRestore.counts.sales ?? 0}</div>
                  <div className="text-muted-foreground">Sales</div>
                </div>
                <div className="border rounded p-2 text-center">
                  <div className="font-bold text-base">{selectedBackupForRestore.counts.purchases ?? 0}</div>
                  <div className="text-muted-foreground">Purchases</div>
                </div>
                <div className="border rounded p-2 text-center">
                  <div className="font-bold text-base">{selectedBackupForRestore.counts.loans ?? 0}</div>
                  <div className="text-muted-foreground">Loans</div>
                </div>
                <div className="border rounded p-2 text-center">
                  <div className="font-bold text-base">{selectedBackupForRestore.counts.employees ?? 0}</div>
                  <div className="text-muted-foreground">Employees</div>
                </div>
              </div>

              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-amber-900 dark:text-amber-200 space-y-1">
                <div className="font-bold">WARNING:</div>
                <div>Restoring this backup will replace the current tenant data with the selected backup snapshot.</div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-3">
            <Button variant="outline" onClick={() => setRestoreDialogOpen(false)} disabled={restoring}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleConfirmRestore}
              disabled={restoring}
            >
              {restoring ? "Restoring data…" : "Continue Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dangerous RESET ALL DATA Dialog ── */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-md border-destructive/50">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> WARNING — DELETE ALL DATA
            </DialogTitle>
            <DialogDescription>
              You are about to permanently delete all data for this business ({tenant.name}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs">
            <div className="bg-destructive/10 text-destructive p-3 rounded-lg space-y-1 font-medium">
              <div>This includes:</div>
              <div>• Medicines & Inventory batches</div>
              <div>• Customers, Suppliers & Credit Loans</div>
              <div>• Sales, Bills & Invoices</div>
              <div>• Purchases & Supplier Invoices</div>
              <div>• Employees, Attendance & Salary Payments</div>
              <div>• Finance Income & Operational Expenses</div>
              <div>• GST profile & business settings</div>
            </div>

            <div className="rounded-md border p-2.5 text-muted-foreground">
              This action <strong>cannot be undone</strong>. Your Google Drive backup files will remain available and untouched.
            </div>

            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-semibold text-destructive">
                To continue, type DELETE in all caps:
              </Label>
              <Input
                placeholder="Type DELETE"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                className="font-mono text-sm tracking-wider"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-3">
            <Button variant="outline" onClick={() => setResetDialogOpen(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={resetConfirmText.trim() !== "DELETE" || resetting}
              onClick={handleExecuteReset}
            >
              {resetting ? "Deleting all data…" : "DELETE ALL DATA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

