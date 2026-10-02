import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Search, Trash2, FileSpreadsheet, Users, Phone } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { BulkImportDialog } from "@/components/app/BulkImportDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/customers")({
  head: () => ({ meta: [{ title: "Customers · RSP Medical Billing" }] }),
  component: CustomersPage,
});

function CustomersPage() {
  const customers = useStore((s) => s.customers);
  const sales = useStore((s) => s.sales);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", doctor: "", address: "" });

  const enriched = useMemo(() => {
    return customers.map((c) => {
      const bills = sales.filter((s) => s.customerId === c.id && s.status !== "cancelled");
      const spent = bills.reduce((sum, s) => sum + s.grand, 0);
      return { ...c, visits: bills.length, spent };
    });
  }, [customers, sales]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return enriched;
    return enriched.filter((c) =>
      [c.name, c.phone, c.doctor ?? ""].some((v) => v.toLowerCase().includes(q)),
    );
  }, [enriched, query]);

  const save = () => {
    if (!form.name || !form.phone) return toast.error("Name & phone required");
    actions.addCustomer(form);
    toast.success("Customer added");
    setForm({ name: "", phone: "", doctor: "", address: "" });
    setOpen(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Customers
          </h1>
          <p className="text-sm text-muted-foreground">
            {customers.length} customers · new numbers on the bill screen are auto-saved here
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Bulk Import
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Customer
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Doctor</TableHead>
              <TableHead className="text-center">Visits</TableHead>
              <TableHead className="text-right">Total Spent</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-sm flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {c.phone || "—"}
                </TableCell>
                <TableCell className="text-sm">{c.doctor ?? "—"}</TableCell>
                <TableCell className="text-center">{c.visits}</TableCell>
                <TableCell className="text-right tabular-nums">₹{c.spent.toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.balance ? <span className="text-[color:var(--warning)]">₹{c.balance}</span> : "—"}
                </TableCell>
                <TableCell>
                  <Button
                    size="icon" variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => { actions.deleteCustomer(c.id); toast.success("Deleted"); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                No customers found.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
            <DialogDescription>New customers are also auto-created when billing by phone.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <F label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} full />
            <F label="Phone *" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <F label="Doctor" value={form.doctor} onChange={(v) => setForm({ ...form, doctor: v })} />
            <F label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} full />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkImportDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Bulk import customers"
        columns={[
          { key: "name", label: "Name", required: true },
          { key: "phone", label: "Phone", required: true },
          { key: "doctor", label: "Doctor" },
          { key: "address", label: "Address" },
          { key: "balance", label: "Balance", type: "number" },
        ]}
        example={`Name\tPhone\tDoctor\tAddress\tBalance
Ravi Kumar\t9876500001\tDr. Rao\tHindupur\t0
Sujatha S.\t9876500002\tDr. Latha\tPenukonda\t250`}
        onImport={(rows: any[]) => actions.bulkAddCustomers(rows)}
      />
    </div>
  );
}

function F({ label, value, onChange, full }: { label: string; value: string; onChange: (v: string) => void; full?: boolean }) {
  return (
    <div className={"space-y-1.5 " + (full ? "col-span-2" : "")}>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
