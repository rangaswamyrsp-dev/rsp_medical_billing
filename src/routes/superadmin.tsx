import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Building2, Plus, Settings2, LogOut, Trash2, ShieldCheck, Copy, Loader2,
} from "lucide-react";
import {
  isSuperAdmin, logoutSuperAdmin, BUSINESS_TYPES, FEATURE_GROUPS,
  buildNewTenant, seedNewTenantStore, injectTenants,
  type BusinessType, type Tenant, type FeatureKey,
} from "@/lib/tenant";
import {
  sb_fetchTenants, sb_insertTenant, sb_updateTenant, sb_deleteTenant,
} from "@/lib/tenant-supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !isSuperAdmin()) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "Super Admin · RSP Billing Software" },
      { name: "description", content: "Create client businesses and control which features each one gets." },
      { property: "og:title", content: "Super Admin · RSP Billing Software" },
      { property: "og:description", content: "Create client businesses and control feature access." },
    ],
  }),
  component: SuperAdminPage,
});

const EMPTY_FORM = { name: "", type: "Medical" as BusinessType, adminName: "", adminPhone: "", adminPassword: "" };

function SuperAdminPage() {
  const navigate = useNavigate();

  // ── State ─────────────────────────────────────────────────────────────────
  // Own React state for the tenant list — loaded from Supabase (source of truth)
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [featureFor, setFeatureFor] = useState<Tenant | null>(null);
  const [created, setCreated] = useState<{ name: string; phone: string; password: string } | null>(null);

  useEffect(() => {
    if (!isSuperAdmin()) { navigate({ to: "/login" }); return; }
    loadFromSupabase();
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load list from Supabase ───────────────────────────────────────────────
  const loadFromSupabase = async () => {
    setLoadingList(true);
    const { tenants: data, error } = await sb_fetchTenants();
    if (error) {
      toast.error(`Could not load clients from database: ${error}`);
    } else {
      setTenants(data);
      injectTenants(data); // keep localStorage in sync for the billing app
    }
    setLoadingList(false);
  };

  const current = featureFor ? tenants.find((t) => t.id === featureFor.id) ?? null : null;

  // ── Create client ─────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.name.trim()) return toast.error("Business name required");
    if (!form.adminName.trim()) return toast.error("Owner name required");
    if (!/^\d{10}$/.test(form.adminPhone.trim())) return toast.error("Enter a 10-digit owner phone");
    if (form.adminPassword.length < 4) return toast.error("Password must be at least 4 characters");
    if (tenants.some((t) => t.admin.phone === form.adminPhone.trim()))
      return toast.error("Phone already used by another business");

    setSaving(true);
    try {
      const newTenant = buildNewTenant(form);
      const { error } = await sb_insertTenant(newTenant);

      if (error) {
        toast.error(`Failed to create client: ${error}`);
        return;
      }

      // Seed the billing localStorage so the owner can log in right away
      seedNewTenantStore(newTenant);

      setCreated({ name: form.name, phone: form.adminPhone.trim(), password: form.adminPassword });
      setForm(EMPTY_FORM);
      setOpen(false);
      toast.success("Client created and saved to database");

      // Refresh list from Supabase to confirm persistence
      await loadFromSupabase();
    } finally {
      setSaving(false);
    }
  };

  // ── Delete client ─────────────────────────────────────────────────────────
  const handleDelete = async (t: Tenant) => {
    if (!confirm(`Delete ${t.name} and all its data?`)) return;

    const { error } = await sb_deleteTenant(t.id);
    if (error) {
      toast.error(`Failed to delete client: ${error}`);
      return;
    }

    // Also clean up localStorage store for this tenant
    if (typeof window !== "undefined") localStorage.removeItem(t.storeKey);

    toast.success("Client removed");
    await loadFromSupabase();
  };

  // ── Toggle active ─────────────────────────────────────────────────────────
  const handleToggleActive = async (t: Tenant, value: boolean) => {
    // Optimistic update
    setTenants((prev) => prev.map((x) => x.id === t.id ? { ...x, active: value } : x));

    const { error } = await sb_updateTenant(t.id, { active: value });
    if (error) {
      toast.error(`Failed to update status: ${error}`);
      // Revert optimistic update
      setTenants((prev) => prev.map((x) => x.id === t.id ? { ...x, active: !value } : x));
    }
  };

  // ── Toggle feature flag ───────────────────────────────────────────────────
  const handleSetFeature = async (tenantId: string, key: FeatureKey, value: boolean) => {
    const target = tenants.find((t) => t.id === tenantId);
    if (!target) return;

    const updatedFeatures = { ...target.features, [key]: value } as Record<string, boolean>;

    // Optimistic update so the toggle feels instant
    setTenants((prev) =>
      prev.map((t) => t.id === tenantId ? { ...t, features: { ...t.features, [key]: value } } : t),
    );

    const { error } = await sb_updateTenant(tenantId, { features: updatedFeatures });
    if (error) {
      toast.error(`Failed to save feature: ${error}`);
      await loadFromSupabase(); // revert by reloading from DB
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b bg-card flex items-center gap-3 px-4 lg:px-8">
        <div className="h-9 w-9 grid place-items-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">RSP Super Admin</div>
          <div className="text-[11px] text-muted-foreground">Client accounts &amp; feature control</div>
        </div>
        <Button
          variant="ghost" className="ml-auto"
          onClick={() => { logoutSuperAdmin(); navigate({ to: "/login" }); }}
        >
          <LogOut className="h-4 w-4 mr-1.5" /> Sign out
        </Button>
      </header>

      <main className="p-4 lg:p-8 space-y-4 max-w-6xl">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" /> Client businesses
            </h1>
            <p className="text-sm text-muted-foreground">
              {loadingList
                ? "Loading…"
                : `${tenants.length} client${tenants.length === 1 ? "" : "s"} · you can create accounts and switch features on or off. Client bills, stock and customer data are never visible here.`
              }
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add client
          </Button>
        </div>

        <Card className="p-3 bg-muted/40 border-dashed text-xs text-muted-foreground">
          Privacy: this console stores only the business name, type, owner login and enabled features.
          No sales, inventory or customer records are read or shown.
        </Card>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            {loadingList ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading clients from database…
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Owner login</TableHead>
                    <TableHead>Features on</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((t) => {
                    const on = Object.values(t.features).filter(Boolean).length;
                    const total = Object.values(t.features).length;
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="font-medium">{t.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{t.id}</div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{t.type}</Badge></TableCell>
                        <TableCell className="font-mono text-sm">{t.admin.phone}</TableCell>
                        <TableCell className="tabular-nums text-sm">{on} / {total}</TableCell>
                        <TableCell>
                          <Switch
                            checked={t.active}
                            onCheckedChange={(v) => handleToggleActive(t, v)}
                          />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="sm" variant="outline" onClick={() => setFeatureFor(t)}>
                            <Settings2 className="h-4 w-4 mr-1.5" /> Features
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-8 w-8 ml-1 text-destructive"
                            onClick={() => handleDelete(t)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      </main>

      {/* Create client dialog — UI unchanged */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add client business</DialogTitle>
            <DialogDescription>
              The new business starts completely empty. Features are preset for the business type and can be changed anytime.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Business name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sri Sai Restaurant" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Business type *</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as BusinessType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((b) => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {BUSINESS_TYPES.find((b) => b.value === form.type)?.hint}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Owner name *</Label>
              <Input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Owner phone (login ID) *</Label>
              <Input value={form.adminPhone} inputMode="tel" onChange={(e) => setForm({ ...form, adminPhone: e.target.value })} placeholder="10 digits" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Password *</Label>
              <Input value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : "Create client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feature toggles dialog — UI unchanged */}
      <Dialog open={!!current} onOpenChange={(v) => !v && setFeatureFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Features · {current?.name}</DialogTitle>
            <DialogDescription>Turn modules on when the client asks for them. Changes apply on their next screen load.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-5 pr-1">
            {current && FEATURE_GROUPS.map((g) => (
              <div key={g.title}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{g.title}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {g.keys.map((f) => (
                    <label key={f.key} className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm">
                      <span>{f.label}</span>
                      <Switch
                        checked={current.features[f.key]}
                        onCheckedChange={(v) => handleSetFeature(current.id, f.key, v)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setFeatureFor(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Created credentials dialog — UI unchanged */}
      <Dialog open={!!created} onOpenChange={(v) => !v && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client created</DialogTitle>
            <DialogDescription>Share these owner login details with {created?.name}.</DialogDescription>
          </DialogHeader>
          {created && (
            <div className="space-y-1 rounded-md border bg-muted/40 p-4 font-mono text-sm">
              <div>Login (phone): <b>{created.phone}</b></div>
              <div>Password: <b>{created.password}</b></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreated(null)}>Close</Button>
            <Button onClick={() => {
              if (!created) return;
              navigator.clipboard.writeText(`Login: ${created.phone}\nPassword: ${created.password}`);
              toast.success("Copied");
            }}><Copy className="h-4 w-4 mr-1.5" /> Copy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
