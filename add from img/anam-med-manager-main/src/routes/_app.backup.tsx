import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatabaseBackup, Download, Upload, RotateCcw } from "lucide-react";
import { actions } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/backup")({
  head: () => ({ meta: [{ title: "Backup · RSP Medical Billing" }] }),
  component: BackupPage,
});

function BackupPage() {
  const fileRef = useRef<HTMLInputElement>(null);

  const download = () => {
    const data = actions.exportJSON();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  };

  const handleUpload = async (file: File) => {
    try {
      const text = await file.text();
      actions.importJSON(text);
      toast.success("Backup restored");
    } catch {
      toast.error("Invalid backup file");
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <DatabaseBackup className="h-6 w-6 text-primary" /> Backup & Restore
        </h1>
        <p className="text-sm text-muted-foreground">Save all data (medicines, customers, bills, settings) to a JSON file.</p>
      </div>

      <Card className="p-5 space-y-3">
        <div className="font-semibold">Download backup</div>
        <p className="text-sm text-muted-foreground">Downloads a JSON snapshot of your entire database.</p>
        <Button onClick={download}><Download className="h-4 w-4 mr-1.5" /> Download backup</Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-semibold">Restore from file</div>
        <p className="text-sm text-muted-foreground">Warning: this replaces the current data on this device.</p>
        <input
          ref={fileRef} type="file" accept="application/json" className="hidden"
          onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4 mr-1.5" /> Choose file
        </Button>
      </Card>

      <Card className="p-5 space-y-3 border-destructive/30">
        <div className="font-semibold text-destructive">Reset all data</div>
        <p className="text-sm text-muted-foreground">Restore seed data and delete all bills.</p>
        <Button
          variant="destructive"
          onClick={() => {
            if (confirm("Delete all data and reset to defaults?")) {
              actions.resetAll();
              toast.success("Reset complete");
            }
          }}
        >
          <RotateCcw className="h-4 w-4 mr-1.5" /> Reset to defaults
        </Button>
      </Card>
    </div>
  );
}
