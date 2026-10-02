import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Copy, Eye, EyeOff, Plus, Trash2, UserCog, Shield, IndianRupee, Receipt } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { generatePassword, getUser } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/employees")({
  head: () => ({ meta: [{ title: "Employees · RSP Medical Billing" }] }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const employees = useStore((s) => s.employees);
  const sales = useStore((s) => s.sales);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", role: "Cashier", phone: "", salary: 0, password: "" });
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [created, setCreated] = useState<{ id: string; phone: string; password: string; name: string } | null>(null);
  const [me, setMe] = useState<ReturnType<typeof getUser>>(null);

  useEffect(() => setMe(getUser()), []);
  const isAdmin = me?.role === "Admin";

  const perEmp = useMemo(() => {
    const m: Record<string, { bills: number; revenue: number; cancelled: number }> = {};
    sales.forEach((s) => {
      const id = s.cashierId ?? "unknown";
      if (!m[id]) m[id] = { bills: 0, revenue: 0, cancelled: 0 };
      if (s.status === "cancelled") m[id].cancelled++;
      else { m[id].bills++; m[id].revenue += s.grand; }
    });
    return m;
  }, [sales]);

  const save = () => {
    if (!form.name.trim()) return toast.error("Name required");
    if (!form.phone.trim()) return toast.error("Phone (user ID) required");
    if (employees.some((e) => e.phone === form.phone.trim())) return toast.error("Phone already used");
    const password = form.password || generatePassword();
    const rec = actions.addEmployee(
      { name: form.name, role: form.role, phone: form.phone.trim(), salary: Number(form.salary) || 0, password, active: true },
      me ? { id: me.id, name: me.name } : undefined,
    );
    setCreated({ id: rec.id, phone: rec.phone, password, name: rec.name });
    setForm({ name: "", role: "Cashier", phone: "", salary: 0, password: "" });
    setOpen(false);
  };

  const remove = (id: string) => {
    if (id === "E001") return toast.error("Main admin can't be removed");
    if (!confirm("Delete this employee?")) return;
    actions.deleteEmployee(id, me ? { id: me.id, name: me.name } : undefined);
    toast.success("Employee removed");
  };

  const resetPw = (id: string) => {
    const pw = generatePassword();
    actions.updateEmployee(id, { password: pw });
    const emp = employees.find((e) => e.id === id);
    if (emp) setCreated({ id: emp.id, phone: emp.phone, password: pw, name: emp.name });
  };

  const copyCreds = () => {
    if (!created) return;
    navigator.clipboard.writeText(`Login: ${created.phone}\nPassword: ${created.password}`);
    toast.success("Credentials copied");
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <UserCog className="h-6 w-6 text-primary" /> Employees
          </h1>
          <p className="text-sm text-muted-foreground">
            {employees.length} staff · Manjju is the main Admin · every bill is tied to the cashier's Employee ID.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Employee</Button>
        )}
      </div>

      {!isAdmin && (
        <Card className="p-3 bg-muted/50 text-sm text-muted-foreground border-dashed">
          Only Admin (Manjju) can add or remove employees or view passwords.
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Emp ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Phone (Login ID)</TableHead>
              <TableHead>Password</TableHead>
              <TableHead className="text-right">Salary</TableHead>
              <TableHead className="text-right">Bills</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((e) => {
              const stats = perEmp[e.id] ?? { bills: 0, revenue: 0, cancelled: 0 };
              const isSeed = e.id === "E001";
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.id}</TableCell>
                  <TableCell className="font-medium">
                    {e.name}
                    {isSeed && <Badge variant="secondary" className="ml-2 gap-1"><Shield className="h-3 w-3" /> Main Admin</Badge>}
                  </TableCell>
                  <TableCell><Badge variant="outline">{e.role}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{e.phone}</TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-sm">
                          {reveal[e.id] ? (e.password || "—") : "••••••••"}
                        </span>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setReveal((r) => ({ ...r, [e.id]: !r[e.id] }))}>
                          {reveal[e.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        {!isSeed && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => resetPw(e.id)}>Reset</Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">hidden</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">₹{e.salary.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {stats.bills}
                    {stats.cancelled > 0 && <span className="text-xs text-destructive ml-1">({stats.cancelled} cx)</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-primary font-semibold">₹{stats.revenue.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">
                    {isAdmin && !isSeed && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(e.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold"><Receipt className="h-4 w-4" /> Recent bills per employee</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((e) => {
            const s = perEmp[e.id];
            return (
              <div key={e.id} className="rounded-md border p-3">
                <div className="text-sm font-medium">{e.name} <span className="text-xs text-muted-foreground">({e.id})</span></div>
                <div className="text-xs text-muted-foreground">{e.role}</div>
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <span><Receipt className="inline h-3.5 w-3.5" /> {s?.bills ?? 0} bills</span>
                  <span className="text-primary"><IndianRupee className="inline h-3.5 w-3.5" />{(s?.revenue ?? 0).toLocaleString("en-IN")}</span>
                </div>
                {s?.cancelled ? (
                  <div className="text-[11px] text-destructive mt-1">
                    ⚠ {s.cancelled} cancelled bill(s) — responsibility of {e.name}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Add employee dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>Phone number is their login ID. Password is auto-generated if left blank.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2"><Label className="text-xs">Full name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Manager">Manager</SelectItem>
                  <SelectItem value="Pharmacist">Pharmacist</SelectItem>
                  <SelectItem value="Cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Phone (login ID) *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="10 digits" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Salary (₹)</Label><Input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Password (blank = auto)</Label><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="auto-generate" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Create login</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials created dialog */}
      <Dialog open={!!created} onOpenChange={(v) => !v && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login credentials</DialogTitle>
            <DialogDescription>Share this with {created?.name}. You can view them again on this page (Admin only).</DialogDescription>
          </DialogHeader>
          {created && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-4 font-mono text-sm">
              <div>Employee ID: <b>{created.id}</b></div>
              <div>Login (phone): <b>{created.phone}</b></div>
              <div>Password: <b>{created.password}</b></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreated(null)}>Close</Button>
            <Button onClick={copyCreds}><Copy className="h-4 w-4 mr-1.5" /> Copy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
