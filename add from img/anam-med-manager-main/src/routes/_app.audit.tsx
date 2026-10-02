import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Search } from "lucide-react";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_app/audit")({
  head: () => ({ meta: [{ title: "Audit Log · RSP Medical Billing" }] }),
  component: AuditPage,
});

const ACTIONS = [
  "all", "bill.save", "bill.cancel", "bill.hold", "stock.adjust",
  "medicine.add", "medicine.update", "medicine.delete",
  "employee.add", "employee.delete", "purchase.add", "login",
];

function AuditPage() {
  const audit = useStore((s) => s.audit);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");

  const rows = useMemo(() => {
    const qq = q.toLowerCase().trim();
    return audit.filter((a) =>
      (action === "all" || a.action === action) &&
      (!qq || [a.actor, a.target ?? "", a.detail ?? "", a.action].some((v) => v.toLowerCase().includes(qq))),
    );
  }, [audit, q, action]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Audit Log
        </h1>
        <p className="text-sm text-muted-foreground">
          Every bill, cancel, stock change and login is recorded here.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search actor, target, detail…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor (Employee)</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(a.at).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-sm">{a.actor}</TableCell>
                  <TableCell><Badge variant="outline">{a.action}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{a.target ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.detail ?? "—"}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No audit entries yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
