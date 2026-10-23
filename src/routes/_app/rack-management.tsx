import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Boxes, Layers, Plus, Pencil, Trash2, ArrowUpDown, Check, ShieldAlert,
  Search, Filter, MoveRight, History, PackageCheck, AlertCircle, Info, Lock,
  ChevronRight, RefreshCw, BarChart2, CheckCircle2, XCircle, LayoutGrid
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { useTenant } from "@/lib/tenant";
import type { Medicine } from "@/data/medicines";
import {
  type StorageRule,
  type StorageMovement,
  type StorageMode,
  type CapacityMode,
  type BrandedGenericFilter,
  type ReservedPlacement,
  type RackLayout,
  type BoxPosition,
  calculateStorageOverview,
  formatRackCodeFromRule,
  formatBoxCodeFromRule,
  sb_fetchStorageMovements,
} from "@/lib/storage-service";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/rack-management")({
  head: () => ({ meta: [{ title: "Rack Management & Smart Storage · RSP MediBill" }] }),
  component: RackManagementPage,
});

export default function RackManagementPage() {
  const tenant = useTenant();
  const currentTenantId = tenant.id || "T001";

  const medicines = useStore((s) => s.medicines);
  const rules = useStore((s) => s.storageRules || []);

  const [activeTab, setActiveTab] = useState<"overview" | "rules" | "racks" | "history">("overview");
  const [movements, setMovements] = useState<StorageMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  // Filters for Overview & Racks
  const [searchQuery, setSearchQuery] = useState("");
  const [assigningAll, setAssigningAll] = useState(false);

  const handleReorganizeAtoZ = async () => {
    setAssigningAll(true);
    try {
      const { count, error } = await actions.reorganizeStorageAtoZ();
      if (error) toast.error(`Failed to reorganize: ${error}`);
      else toast.success(`Arranged ${count} medicines in A-Z order (19 per rack, leaving 2 empty boxes/rack)!`);
    } finally {
      setAssigningAll(false);
    }
  };

  const handleAutoAssignAll = async () => {
    // direct execution without blocking native alert dialog
    setAssigningAll(true);
    try {
      const { count, error } = await actions.autoAssignAllUnassignedMedicines();
      if (error) {
        toast.error(`Auto-assignment error: ${error}`);
      } else {
        toast.success(`Successfully assigned Rack & Box locations to ${count} medicines!`);
      }
    } finally {
      setAssigningAll(false);
    }
  };
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("ALL");
  const [selectedStorageModeFilter, setSelectedStorageModeFilter] = useState("ALL");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("ALL");

  // Add / Edit Rule Dialog State
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<StorageRule | null>(null);
  const [ruleForm, setRuleForm] = useState<Partial<StorageRule>>({
    name: "",
    description: "",
    priority: 1,
    status: "active",
    storage_mode: "box_wise",
    medicine_types: ["Tablet", "Tablets"],
    companies: ["ALL"],
    manufacturers: ["ALL"],
    categories: ["ALL"],
    classification: "all",
    rack_prefix: "R",
    starting_rack_number: 1,
    rack_count: 5,
    allow_additional_racks: true,
    rack_pad: 2,
    box_prefix: "B",
    box_pad: 3,
    usable_boxes_per_rack: 20,
    capacity_mode: "items_count",
    capacity_limit: 1,
    reserved_positions_enabled: true,
    reserved_positions_per_rack: 1,
    reserved_placement: "end",
    auto_assignment_enabled: true,
    manual_override_enabled: true,
  });

  // Box Content Inspector Dialog
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectingBox, setInspectingBox] = useState<{
    rackCode: string;
    boxCode?: string;
    medicines: Medicine[];
    isReserved?: boolean;
    ruleName?: string;
  } | null>(null);

  // Move Stock Dialog
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [movingMedicine, setMovingMedicine] = useState<Medicine | null>(null);
  const [targetRack, setTargetRack] = useState("");
  const [targetBox, setTargetBox] = useState("");
  const [moveQuantity, setMoveQuantity] = useState(1);
  const [moveReason, setMoveReason] = useState("Stock reorganization");

  // Selected Rack for visual preview
  const [selectedRackCode, setSelectedRackCode] = useState<string>("");

  useEffect(() => {
    actions.syncMedicines(currentTenantId);
    actions.syncStorageRules(currentTenantId);
    loadMovementHistory();
  }, [currentTenantId]);

  const loadMovementHistory = async () => {
    setLoadingMovements(true);
    try {
      const list = await sb_fetchStorageMovements(currentTenantId);
      setMovements(list);
    } finally {
      setLoadingMovements(false);
    }
  };

  // Distinct database attributes for filter multi-select
  const distinctTypes = useMemo(() => {
    const set = new Set<string>();
    medicines.forEach((m) => {
      const t = (m.type || m.units || "").trim();
      if (t) set.add(t);
    });
    // Add common types if empty
    ["Tablet", "Capsule", "Syrup", "Injection", "Ointment", "Drops", "Powder", "Liquid", "General"].forEach((t) => set.add(t));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [medicines]);

  const distinctCompanies = useMemo(() => {
    const set = new Set<string>();
    medicines.forEach((m) => {
      if (m.company && m.company.trim()) set.add(m.company.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [medicines]);

  const distinctCategories = useMemo(() => {
    const set = new Set<string>();
    medicines.forEach((m) => {
      const cat = (m.category || m.generic || "").trim();
      if (cat) set.add(cat);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [medicines]);

  // Storage Overview calculations
  const { stats, rackLayouts } = useMemo(() => {
    return calculateStorageOverview(rules, medicines);
  }, [rules, medicines]);

  // Set default selected rack when layouts change
  useEffect(() => {
    if (rackLayouts.length > 0 && !selectedRackCode) {
      setSelectedRackCode(rackLayouts[0].rackCode);
    }
  }, [rackLayouts, selectedRackCode]);

  // Current visual rack layout
  const currentRackLayout = useMemo(() => {
    return rackLayouts.find((r) => r.rackCode === selectedRackCode) || rackLayouts[0];
  }, [rackLayouts, selectedRackCode]);

  // Filtered Racks List
  const filteredRackLayouts = useMemo(() => {
    return rackLayouts.filter((r) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = r.rackCode.toLowerCase().includes(q) || (r.ruleName || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (selectedStorageModeFilter !== "ALL" && r.storageMode !== selectedStorageModeFilter) return false;
      if (selectedStatusFilter === "occupied" && r.occupiedCount === 0) return false;
      if (selectedStatusFilter === "available" && r.availableCount === 0) return false;
      return true;
    });
  }, [rackLayouts, searchQuery, selectedStorageModeFilter, selectedStatusFilter]);

  // Open Add Rule
  const handleOpenAddRule = () => {
    setEditingRule(null);
    setRuleForm({
      name: `Rule ${rules.length + 1}`,
      description: "",
      priority: rules.length + 1,
      status: "active",
      storage_mode: "box_wise",
      medicine_types: ["Tablet"],
      companies: ["ALL"],
      manufacturers: ["ALL"],
      categories: ["ALL"],
      classification: "all",
      rack_prefix: "R",
      starting_rack_number: 1,
      rack_count: 5,
      allow_additional_racks: true,
      rack_pad: 2,
      box_prefix: "B",
      box_pad: 3,
      usable_boxes_per_rack: 20,
      capacity_mode: "items_count",
      capacity_limit: 1,
      reserved_positions_enabled: true,
      reserved_positions_per_rack: 1,
      reserved_placement: "end",
      auto_assignment_enabled: true,
      manual_override_enabled: true,
    });
    setRuleModalOpen(true);
  };

  // Open Edit Rule
  const handleOpenEditRule = (rule: StorageRule) => {
    setEditingRule(rule);
    setRuleForm({ ...rule });
    setRuleModalOpen(true);
  };

  // Save Rule
  const handleSaveRule = async () => {
    if (!ruleForm.name?.trim()) {
      return toast.error("Please provide a descriptive rule name.");
    }
    if ((ruleForm.rack_count || 0) <= 0) {
      return toast.error("Number of racks must be greater than zero.");
    }
    if (ruleForm.storage_mode === "box_wise" && (ruleForm.usable_boxes_per_rack || 0) <= 0) {
      return toast.error("Usable boxes per rack must be greater than zero in Box-wise mode.");
    }

    const ruleToSave: StorageRule = {
      id: editingRule ? editingRule.id : "RULE-" + Date.now().toString(36),
      tenant_id: currentTenantId,
      name: ruleForm.name.trim(),
      description: ruleForm.description?.trim() || "",
      priority: Number(ruleForm.priority) || 1,
      status: ruleForm.status || "active",
      storage_mode: ruleForm.storage_mode || "box_wise",
      medicine_types: ruleForm.medicine_types && ruleForm.medicine_types.length > 0 ? ruleForm.medicine_types : ["ALL"],
      companies: ruleForm.companies && ruleForm.companies.length > 0 ? ruleForm.companies : ["ALL"],
      manufacturers: ruleForm.manufacturers && ruleForm.manufacturers.length > 0 ? ruleForm.manufacturers : ["ALL"],
      categories: ruleForm.categories && ruleForm.categories.length > 0 ? ruleForm.categories : ["ALL"],
      classification: ruleForm.classification || "all",
      rack_prefix: ruleForm.rack_prefix?.trim() || "R",
      starting_rack_number: Number(ruleForm.starting_rack_number) || 1,
      rack_count: Number(ruleForm.rack_count) || 5,
      allow_additional_racks: Boolean(ruleForm.allow_additional_racks),
      rack_pad: Number(ruleForm.rack_pad) || 2,
      box_prefix: ruleForm.box_prefix?.trim() || "B",
      box_pad: Number(ruleForm.box_pad) || 3,
      usable_boxes_per_rack: Number(ruleForm.usable_boxes_per_rack) || 20,
      capacity_mode: ruleForm.capacity_mode || "items_count",
      capacity_limit: Number(ruleForm.capacity_limit) || 1,
      reserved_positions_enabled: Boolean(ruleForm.reserved_positions_enabled),
      reserved_positions_per_rack: Number(ruleForm.reserved_positions_per_rack) || 0,
      reserved_placement: ruleForm.reserved_placement || "end",
      auto_assignment_enabled: Boolean(ruleForm.auto_assignment_enabled),
      manual_override_enabled: Boolean(ruleForm.manual_override_enabled),
    };

    const { error } = await actions.saveStorageRule(ruleToSave);
    if (error) {
      toast.error(`Failed to save rule: ${error}`);
    } else {
      toast.success(editingRule ? "Rack rule updated successfully" : "New rack rule created successfully");
      setRuleModalOpen(false);
    }
  };

  // Delete Rule
  const handleDeleteRule = async (ruleId: string, ruleName: string) => {
    if (!confirm(`Are you sure you want to delete rule "${ruleName}"? Existing medicine assignments will remain intact.`)) return;
    const { error } = await actions.deleteStorageRule(ruleId);
    if (error) toast.error(`Failed to delete rule: ${error}`);
    else toast.success("Storage rule deleted");
  };

  // Toggle Rule Status
  const handleToggleRuleStatus = async (rule: StorageRule) => {
    const updated: StorageRule = {
      ...rule,
      status: rule.status === "active" ? "inactive" : "active",
    };
    await actions.saveStorageRule(updated);
    toast.success(`Rule "${rule.name}" marked as ${updated.status}`);
  };

  // Move Rule Priority Up / Down
  const handleMovePriority = async (rule: StorageRule, direction: "up" | "down") => {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex((r) => r.id === rule.id);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    const currentRule = sorted[idx];
    const otherRule = sorted[targetIdx];

    const tempPriority = currentRule.priority;
    currentRule.priority = otherRule.priority;
    otherRule.priority = tempPriority;

    await actions.saveStorageRule(currentRule);
    await actions.saveStorageRule(otherRule);
    toast.success("Rule priority reordered");
  };

  // Open Move Stock Modal
  const handleOpenMoveModal = (med: Medicine) => {
    setMovingMedicine(med);
    setTargetRack(med.rack || (rackLayouts[0]?.rackCode || "R01"));
    setTargetBox(med.box_no || "B001");
    setMoveQuantity(Number(med.stock) || 1);
    setMoveReason("Reorganized for quick dispensary access");
    setMoveModalOpen(true);
  };

  // Execute Stock Movement
  const handleExecuteMove = async () => {
    if (!movingMedicine) return;
    if (!targetRack.trim()) return toast.error("Target Rack is required.");

    const { error } = await actions.moveMedicineLocation(
      movingMedicine.id,
      targetRack.trim().toUpperCase(),
      targetBox.trim().toUpperCase(),
      {
        quantity: moveQuantity,
        movedBy: tenant.name || "Pharmacist",
        reason: moveReason,
      }
    );

    if (error) {
      toast.error(`Failed to move stock: ${error}`);
    } else {
      toast.success(`Moved ${movingMedicine.name} to Rack ${targetRack}${targetBox ? `, Box ${targetBox}` : ""}`);
      setMoveModalOpen(false);
      setInspectorOpen(false);
      loadMovementHistory();
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Boxes className="h-7 w-7 text-primary" /> Rack Management & Smart Storage
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure shop-specific racks, box-wise or rack-only modes, multi-type rules, and automatic dispensary numbering.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { actions.syncMedicines(currentTenantId); actions.syncStorageRules(currentTenantId); loadMovementHistory(); }}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          {stats.unassignedMedicinesCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAutoAssignAll}
              disabled={assigningAll}
              className="bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200 shadow-xs"
            >
              <Boxes className={`h-4 w-4 mr-1.5 text-amber-600 ${assigningAll ? "animate-spin" : ""}`} />
              {assigningAll ? "Assigning..." : `Auto-Assign (${stats.unassignedMedicinesCount} Unassigned)`}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleReorganizeAtoZ}
            disabled={assigningAll}
            className="border-primary/40 text-primary hover:bg-primary/5 shadow-xs"
          >
            <ArrowUpDown className="h-4 w-4 mr-1.5" /> Arrange A → Z Order
          </Button>
          <Button size="sm" onClick={handleOpenAddRule} className="shadow-sm">
            <Plus className="h-4 w-4 mr-1.5" /> Add Rack Rule
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full md:w-auto h-auto p-1 bg-muted/60">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 py-2">
            <BarChart2 className="h-4 w-4" /> Storage Overview
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-1.5 py-2">
            <Layers className="h-4 w-4" /> Rack Rules ({rules.length})
          </TabsTrigger>
          <TabsTrigger value="racks" className="flex items-center gap-1.5 py-2">
            <LayoutGrid className="h-4 w-4" /> Physical Racks ({rackLayouts.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5 py-2">
            <History className="h-4 w-4" /> Movement History ({movements.length})
          </TabsTrigger>
        </TabsList>

        {/* ── 1. STORAGE OVERVIEW TAB ────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* Top Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="p-4 shadow-sm border-l-4 border-l-primary">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Racks</div>
              <div className="text-2xl font-bold mt-1 text-foreground tabular-nums">{stats.totalRacks}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{stats.totalActiveRules} active rules</div>
            </Card>
            <Card className="p-4 shadow-sm border-l-4 border-l-blue-500">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usable Boxes</div>
              <div className="text-2xl font-bold mt-1 text-blue-600 tabular-nums">{stats.totalUsableBoxes}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{stats.totalReservedPositions} reserved pos</div>
            </Card>
            <Card className="p-4 shadow-sm border-l-4 border-l-emerald-500">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Available Boxes</div>
              <div className="text-2xl font-bold mt-1 text-emerald-600 tabular-nums">{stats.availableBoxes}</div>
              <div className="text-[11px] text-emerald-700 mt-0.5">Ready for assignment</div>
            </Card>
            <Card className="p-4 shadow-sm border-l-4 border-l-amber-500">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Occupied Boxes</div>
              <div className="text-2xl font-bold mt-1 text-amber-600 tabular-nums">{stats.occupiedBoxes}</div>
              <div className="text-[11px] text-amber-700 mt-0.5">{stats.fullBoxes} at max capacity</div>
            </Card>
            <Card className="p-4 shadow-sm border-l-4 border-l-indigo-500">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assigned Stock</div>
              <div className="text-2xl font-bold mt-1 text-indigo-600 tabular-nums">{stats.assignedMedicinesCount}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-between">
                <span>{stats.unassignedMedicinesCount} unassigned</span>
                {stats.unassignedMedicinesCount > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoAssignAll}
                    disabled={assigningAll}
                    className="text-primary hover:underline font-semibold text-[10px]"
                  >
                    Assign now →
                  </button>
                )}
              </div>
            </Card>
            <Card className="p-4 shadow-sm border-l-4 border-l-purple-500">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Storage Util.</div>
              <div className="text-2xl font-bold mt-1 text-purple-600 tabular-nums">{stats.storageUtilizationPercent}%</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Capacity utilized</div>
            </Card>
          </div>

          {/* Live Visual Rack Layout Preview */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 flex flex-col md:flex-row md:items-center justify-between gap-2 border-b">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5 text-primary" /> Visual Rack & Box Grid
                </CardTitle>
                <CardDescription>
                  Select a rack to inspect individual boxes, capacity occupancy, and reserved empty positions.
                </CardDescription>
              </div>

              {/* Rack Selector Badges */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                {rackLayouts.map((r) => (
                  <Button
                    key={r.rackCode}
                    size="sm"
                    variant={r.rackCode === selectedRackCode ? "default" : "outline"}
                    className="h-8 px-3 text-xs font-semibold"
                    onClick={() => setSelectedRackCode(r.rackCode)}
                  >
                    {r.rackCode}
                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0 h-4">
                      {r.storageMode === "rack_only" ? "Shelf" : `${r.occupiedCount}/${r.usableBoxesCount}`}
                    </Badge>
                  </Button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              {currentRackLayout ? (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-muted/40 p-3 rounded-lg text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-sm text-foreground">{currentRackLayout.rackCode}</span>
                      <Badge variant="outline" className="font-semibold">
                        {currentRackLayout.storageMode === "box_wise" ? "Box-wise Storage" : "Rack-only Shelf"}
                      </Badge>
                      {currentRackLayout.ruleName && (
                        <span className="text-muted-foreground">Rule: <strong className="text-foreground">{currentRackLayout.ruleName}</strong></span>
                      )}
                    </div>
                    {/* Legend */}
                    <div className="flex items-center gap-3 flex-wrap text-[11px]">
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500 inline-block"></span> Available</span>
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500 inline-block"></span> Occupied</span>
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500 inline-block"></span> Full</span>
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300 dark:bg-slate-700 inline-block"></span> Reserved Position</span>
                    </div>
                  </div>

                  {currentRackLayout.storageMode === "rack_only" ? (
                    // Rack-only Shelf view
                    <div className="border border-dashed border-border rounded-xl p-6 text-center space-y-3 bg-muted/20">
                      <div className="h-12 w-12 rounded-full bg-primary/10 text-primary mx-auto grid place-items-center">
                        <Boxes className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-foreground">Rack-only Shelf ({currentRackLayout.rackCode})</h3>
                        <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
                          This rack stores items directly on the shelf without sub-boxes. Currently holding {currentRackLayout.medicines.length} assigned medicine products.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setInspectingBox({
                            rackCode: currentRackLayout.rackCode,
                            medicines: currentRackLayout.medicines,
                            ruleName: currentRackLayout.ruleName,
                          });
                          setInspectorOpen(true);
                        }}
                      >
                        Inspect All Shelf Items ({currentRackLayout.medicines.length})
                      </Button>
                    </div>
                  ) : (
                    // Box-wise Grid view
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2.5">
                      {currentRackLayout.boxes.map((box) => {
                        let bgStyle = "bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-950 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300";
                        if (box.isReserved) {
                          bgStyle = "bg-slate-100 border-slate-300 text-slate-500 dark:bg-slate-800/40 dark:border-slate-700 dark:text-slate-400 cursor-not-allowed";
                        } else if (box.status === "full") {
                          bgStyle = "bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-950 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300";
                        } else if (box.status === "occupied") {
                          bgStyle = "bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-950 dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-300";
                        }

                        return (
                          <div
                            key={box.positionNumber}
                            onClick={() => {
                              setInspectingBox({
                                rackCode: currentRackLayout.rackCode,
                                boxCode: box.boxCode,
                                medicines: box.medicines,
                                isReserved: box.isReserved,
                                ruleName: currentRackLayout.ruleName,
                              });
                              setInspectorOpen(true);
                            }}
                            className={`p-3 rounded-lg border text-center transition-all cursor-pointer flex flex-col justify-between h-24 select-none shadow-xs ${bgStyle}`}
                          >
                            <div className="flex items-center justify-between text-[11px] font-semibold opacity-75">
                              <span>Pos {box.positionNumber}</span>
                              {box.isReserved && <Lock className="h-3 w-3" />}
                            </div>

                            <div className="font-bold text-sm tracking-tight">
                              {box.isReserved ? "Reserved" : box.boxCode}
                            </div>

                            <div className="text-[11px] font-medium truncate">
                              {box.isReserved ? (
                                <span className="italic">Empty pos</span>
                              ) : box.distinctItemsCount > 0 ? (
                                <span>{box.distinctItemsCount} item{box.distinctItemsCount > 1 ? "s" : ""}</span>
                              ) : (
                                <span className="opacity-75">Empty</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="py-8 text-center text-muted-foreground text-sm">No rack layout available. Create a rack rule first.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 2. RACK RULES TAB ─────────────────────────────────────────────── */}
        <TabsContent value="rules" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Storage Rules Configuration</h2>
              <p className="text-xs text-muted-foreground">
                Rules are evaluated from highest priority (1) downwards. Tablets, Syrups, Capsules and other types can each have distinct storage configurations.
              </p>
            </div>
            <Button size="sm" onClick={handleOpenAddRule}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Rule
            </Button>
          </div>

          <div className="space-y-3">
            {rules.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground text-sm">
                No storage rules configured yet. Click "Add Rule" to set up your first rule.
              </Card>
            ) : (
              rules.map((r, idx) => (
                <Card key={r.id} className="p-4 shadow-sm hover:border-primary/40 transition-all">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Info */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="font-mono text-xs font-bold">
                          Priority {r.priority || idx + 1}
                        </Badge>
                        <h3 className="font-bold text-base text-foreground">{r.name}</h3>
                        <Badge variant={r.status === "active" ? "default" : "outline"} className={r.status === "active" ? "bg-emerald-600 hover:bg-emerald-600" : ""}>
                          {r.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300">
                          {r.storage_mode === "box_wise" ? "Box-wise Storage" : "Rack-only Shelf"}
                        </Badge>
                      </div>

                      {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}

                      {/* Criteria Summary Badges */}
                      <div className="flex items-center gap-2 flex-wrap text-xs pt-1">
                        <span className="text-muted-foreground font-medium">Target Types:</span>
                        {r.medicine_types.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[11px] px-1.5 py-0">
                            {t}
                          </Badge>
                        ))}

                        <span className="text-muted-foreground font-medium ml-2">Rack Spec:</span>
                        <span className="font-semibold text-foreground">
                          {r.rack_count} Racks ({r.rack_prefix}{String(r.starting_rack_number).padStart(r.rack_pad, "0")}...)
                        </span>

                        {r.storage_mode === "box_wise" && (
                          <>
                            <span className="text-muted-foreground font-medium ml-2">Boxes/Rack:</span>
                            <span className="font-semibold text-foreground">{r.usable_boxes_per_rack} usable</span>
                            {r.reserved_positions_enabled && (
                              <span className="text-muted-foreground">({r.reserved_positions_per_rack} reserved pos)</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 self-end lg:self-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground"
                        title="Move Priority Up"
                        disabled={idx === 0}
                        onClick={() => handleMovePriority(r, "up")}
                      >
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => handleToggleRuleStatus(r)}
                      >
                        {r.status === "active" ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => handleOpenEditRule(r)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        title="Delete Rule"
                        onClick={() => handleDeleteRule(r.id, r.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* ── 3. PHYSICAL RACKS TAB ─────────────────────────────────────────── */}
        <TabsContent value="racks" className="space-y-4 mt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search rack code or rule..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedStorageModeFilter} onValueChange={setSelectedStorageModeFilter}>
                <SelectTrigger className="h-9 text-xs w-36">
                  <SelectValue placeholder="Storage Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Modes</SelectItem>
                  <SelectItem value="box_wise">Box-wise</SelectItem>
                  <SelectItem value="rack_only">Rack-only</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedStatusFilter} onValueChange={setSelectedStatusFilter}>
                <SelectTrigger className="h-9 text-xs w-36">
                  <SelectValue placeholder="Occupancy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="occupied">Has Stock</SelectItem>
                  <SelectItem value="available">Has Free Space</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 text-[11px] font-semibold text-muted-foreground uppercase">
                  <TableHead className="w-24">Rack Code</TableHead>
                  <TableHead>Associated Rule</TableHead>
                  <TableHead>Storage Mode</TableHead>
                  <TableHead className="text-center">Usable Boxes</TableHead>
                  <TableHead className="text-center">Occupied</TableHead>
                  <TableHead className="text-center">Available</TableHead>
                  <TableHead className="text-center">Reserved Pos</TableHead>
                  <TableHead className="text-right">Total Medicines</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRackLayouts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground text-xs">
                      No matching racks found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRackLayouts.map((r) => (
                    <TableRow key={r.rackCode} className="text-xs hover:bg-muted/30">
                      <TableCell className="font-bold font-mono text-foreground text-sm">{r.rackCode}</TableCell>
                      <TableCell className="font-medium text-foreground">{r.ruleName || "Standard Rule"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {r.storageMode === "box_wise" ? "Box-wise" : "Rack-only Shelf"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{r.storageMode === "box_wise" ? r.usableBoxesCount : "-"}</TableCell>
                      <TableCell className="text-center tabular-nums font-semibold text-amber-600">{r.occupiedCount}</TableCell>
                      <TableCell className="text-center tabular-nums font-semibold text-emerald-600">{r.availableCount}</TableCell>
                      <TableCell className="text-center tabular-nums text-muted-foreground">{r.reservedCount || "-"}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums text-foreground">{r.medicines.length}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => {
                            setSelectedRackCode(r.rackCode);
                            setActiveTab("overview");
                          }}
                        >
                          View Grid <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── 4. MOVEMENT HISTORY TAB ───────────────────────────────────────── */}
        <TabsContent value="history" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Storage Relocation Audit Trail</h2>
              <p className="text-xs text-muted-foreground">Every physical stock movement is tracked transactionally with batch and user details.</p>
            </div>
            <Button size="sm" variant="outline" onClick={loadMovementHistory} disabled={loadingMovements}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingMovements ? "animate-spin" : ""}`} /> Refresh Log
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 text-[11px] font-semibold text-muted-foreground uppercase">
                  <TableHead className="w-40">Date & Time</TableHead>
                  <TableHead>Medicine Name</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-center">From Location</TableHead>
                  <TableHead className="text-center">To Location</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead>Moved By</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground text-xs">
                      No stock movements recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map((m) => (
                    <TableRow key={m.id} className="text-xs">
                      <TableCell className="font-mono text-muted-foreground">
                        {new Date(m.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                      </TableCell>
                      <TableCell className="font-bold text-foreground">{m.medicine_name}</TableCell>
                      <TableCell className="font-mono text-xs">{m.batch || "-"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono bg-muted/40">
                          {m.from_rack ? `R:${m.from_rack}` : "-"}{m.from_box ? ` B:${m.from_box}` : ""}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="default" className="font-mono bg-primary">
                          {m.to_rack ? `R:${m.to_rack}` : "-"}{m.to_box ? ` B:${m.to_box}` : ""}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-bold tabular-nums">{m.quantity ?? "-"}</TableCell>
                      <TableCell>{m.moved_by || "Staff"}</TableCell>
                      <TableCell className="text-muted-foreground italic">{m.reason || "Reorganization"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── ADD / EDIT RULE DIALOG ─────────────────────────────────────────── */}
      <Dialog open={ruleModalOpen} onOpenChange={setRuleModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              {editingRule ? `Edit Rule: ${editingRule.name}` : "Create New Storage Rule"}
            </DialogTitle>
            <DialogDescription>
              Configure rack capacity, box numbering, and multi-criteria filters for specific medicine types.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Rule Name & Description */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Rule Name *</Label>
                <Input
                  value={ruleForm.name || ""}
                  onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                  placeholder="e.g. Tablets Box Storage"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Priority (1 = Highest)</Label>
                <Input
                  type="number"
                  min={1}
                  value={ruleForm.priority || 1}
                  onChange={(e) => setRuleForm({ ...ruleForm, priority: Number(e.target.value) })}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Description / Notes</Label>
              <Input
                value={ruleForm.description || ""}
                onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                placeholder="Optional purpose of this storage rule"
                className="h-9 text-xs"
              />
            </div>

            {/* Storage Mode: Box-wise vs Rack-only */}
            <div className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
              <Label className="text-xs font-bold text-foreground">Storage Mode *</Label>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div
                  onClick={() => setRuleForm({ ...ruleForm, storage_mode: "box_wise" })}
                  className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${ruleForm.storage_mode === "box_wise" ? "border-primary bg-primary/5 shadow-xs" : "border-border bg-card hover:bg-muted/40"}`}
                >
                  <div className="font-bold text-foreground flex items-center justify-between">
                    <span>Box-wise Storage</span>
                    {ruleForm.storage_mode === "box_wise" && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Rack contains numbered medicine boxes (e.g. R01-B001 to R01-B020). Best for tablets, capsules, and ampoules.
                  </p>
                </div>

                <div
                  onClick={() => setRuleForm({ ...ruleForm, storage_mode: "rack_only" })}
                  className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${ruleForm.storage_mode === "rack_only" ? "border-primary bg-primary/5 shadow-xs" : "border-border bg-card hover:bg-muted/40"}`}
                >
                  <div className="font-bold text-foreground flex items-center justify-between">
                    <span>Rack-only Storage</span>
                    {ruleForm.storage_mode === "rack_only" && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Medicines stored directly on shelves without sub-boxes (e.g. Rack R01). Best for syrups, liquids, and ointments.
                  </p>
                </div>
              </div>
            </div>

            {/* Target Medicine Types Multi-Select */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Target Medicine Types *</Label>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setRuleForm({ ...ruleForm, medicine_types: ["Tablet", "Tablets", "TAB"] })}
                    className="text-primary hover:underline"
                  >
                    Tablets Only
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setRuleForm({ ...ruleForm, medicine_types: ["ALL"] })}
                    className="text-primary hover:underline"
                  >
                    All Types
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border bg-card min-h-[44px]">
                {distinctTypes.map((type) => {
                  const isSelected = ruleForm.medicine_types?.includes("ALL") || ruleForm.medicine_types?.includes(type);
                  return (
                    <Badge
                      key={type}
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => {
                        let list = [...(ruleForm.medicine_types || [])];
                        if (list.includes("ALL")) list = [];
                        if (list.includes(type)) {
                          list = list.filter((t) => t !== type);
                        } else {
                          list.push(type);
                        }
                        if (list.length === 0) list = ["ALL"];
                        setRuleForm({ ...ruleForm, medicine_types: list });
                      }}
                      className="cursor-pointer select-none text-xs"
                    >
                      {type}
                    </Badge>
                  );
                })}
              </div>
            </div>

            {/* Advanced Filters: Classification, Company, Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Branded / Generic Filter</Label>
                <Select
                  value={ruleForm.classification || "all"}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, classification: v as any })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Both Branded & Generic</SelectItem>
                    <SelectItem value="branded">Branded Only</SelectItem>
                    <SelectItem value="generic">Generic Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Company / Brand Filter</Label>
                <Select
                  value={ruleForm.companies?.[0] || "ALL"}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, companies: [v] })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Companies</SelectItem>
                    {distinctCompanies.slice(0, 30).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Rack Prefix & Count */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg border bg-muted/10">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Rack Prefix</Label>
                <Input
                  value={ruleForm.rack_prefix || "R"}
                  onChange={(e) => setRuleForm({ ...ruleForm, rack_prefix: e.target.value.toUpperCase() })}
                  placeholder="e.g. R or R-TAB"
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Starting Rack No.</Label>
                <Input
                  type="number"
                  min={1}
                  value={ruleForm.starting_rack_number || 1}
                  onChange={(e) => setRuleForm({ ...ruleForm, starting_rack_number: Number(e.target.value) })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Number of Racks</Label>
                <Input
                  type="number"
                  min={1}
                  value={ruleForm.rack_count || 5}
                  onChange={(e) => setRuleForm({ ...ruleForm, rack_count: Number(e.target.value) })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Digits Padding</Label>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={ruleForm.rack_pad || 2}
                  onChange={(e) => setRuleForm({ ...ruleForm, rack_pad: Number(e.target.value) })}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Box-wise specific settings (Conditional) */}
            {ruleForm.storage_mode === "box_wise" && (
              <div className="space-y-3 p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-900">
                <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                  <PackageCheck className="h-4 w-4 text-blue-600" /> Box Configuration & Capacity Limits
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Box Prefix</Label>
                    <Input
                      value={ruleForm.box_prefix || "B"}
                      onChange={(e) => setRuleForm({ ...ruleForm, box_prefix: e.target.value.toUpperCase() })}
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Usable Boxes/Rack</Label>
                    <Input
                      type="number"
                      min={1}
                      value={ruleForm.usable_boxes_per_rack || 20}
                      onChange={(e) => setRuleForm({ ...ruleForm, usable_boxes_per_rack: Number(e.target.value) })}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Capacity Mode</Label>
                    <Select
                      value={ruleForm.capacity_mode || "items_count"}
                      onValueChange={(v) => setRuleForm({ ...ruleForm, capacity_mode: v as any })}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="items_count">Distinct Items</SelectItem>
                        <SelectItem value="units">Total Stock Units</SelectItem>
                        <SelectItem value="unlimited">Unlimited Shared</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Max Limit / Box</Label>
                    <Input
                      type="number"
                      min={1}
                      value={ruleForm.capacity_limit || 1}
                      onChange={(e) => setRuleForm({ ...ruleForm, capacity_limit: Number(e.target.value) })}
                      disabled={ruleForm.capacity_mode === "unlimited"}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                {/* Reserved Empty Position Settings */}
                <div className="pt-2 border-t border-blue-200/60 dark:border-blue-900/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-bold text-foreground">Reserved Empty Positions per Rack</Label>
                      <p className="text-[11px] text-muted-foreground">Keep designated rack slots permanently vacant for physical separation.</p>
                    </div>
                    <Switch
                      checked={Boolean(ruleForm.reserved_positions_enabled)}
                      onCheckedChange={(checked) => setRuleForm({ ...ruleForm, reserved_positions_enabled: checked })}
                    />
                  </div>

                  {ruleForm.reserved_positions_enabled && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Reserved Positions Count</Label>
                        <Input
                          type="number"
                          min={1}
                          value={ruleForm.reserved_positions_per_rack || 1}
                          onChange={(e) => setRuleForm({ ...ruleForm, reserved_positions_per_rack: Number(e.target.value) })}
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Placement in Rack</Label>
                        <Select
                          value={ruleForm.reserved_placement || "end"}
                          onValueChange={(v) => setRuleForm({ ...ruleForm, reserved_placement: v as any })}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="end">At End of Rack (e.g. Pos 21)</SelectItem>
                            <SelectItem value="beginning">At Beginning (e.g. Pos 01)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Automation Toggles */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div>
                <Label className="text-xs font-bold text-foreground">Automatic Storage Assignment</Label>
                <p className="text-[11px] text-muted-foreground">Auto-assign the next free box/rack when adding eligible medicines.</p>
              </div>
              <Switch
                checked={Boolean(ruleForm.auto_assignment_enabled)}
                onCheckedChange={(checked) => setRuleForm({ ...ruleForm, auto_assignment_enabled: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRuleModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveRule}>
              Save Storage Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── BOX CONTENT INSPECTOR DIALOG ──────────────────────────────────── */}
      <Dialog open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-primary" />
              Location Details: Rack {inspectingBox?.rackCode}
              {inspectingBox?.boxCode ? ` - Box ${inspectingBox.boxCode}` : ""}
            </DialogTitle>
            <DialogDescription>
              {inspectingBox?.isReserved
                ? "This position is designated as a Reserved Empty Position and cannot receive stock."
                : `Stored stock items (${inspectingBox?.medicines.length || 0} batches)`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 max-h-96 overflow-y-auto">
            {inspectingBox?.isReserved ? (
              <div className="p-6 text-center text-muted-foreground space-y-2 bg-muted/20 rounded-lg border border-dashed">
                <Lock className="h-8 w-8 text-slate-400 mx-auto" />
                <p className="text-sm font-semibold">Reserved Physical Spacer</p>
                <p className="text-xs">Kept empty per your rack configuration to maintain physical clearance between sections.</p>
              </div>
            ) : inspectingBox?.medicines.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs bg-muted/10 rounded-lg">
                This box is currently available and empty.
              </div>
            ) : (
              inspectingBox?.medicines.map((m) => (
                <div key={m.id} className="p-3 rounded-lg border bg-card flex items-center justify-between gap-3 text-xs shadow-xs">
                  <div className="space-y-0.5">
                    <div className="font-bold text-foreground text-sm">{m.name}</div>
                    <div className="text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>Batch: <strong className="font-mono text-foreground">{m.batch}</strong></span>
                      <span>•</span>
                      <span>Expiry: <strong className="text-foreground">{m.expiry}</strong></span>
                      <span>•</span>
                      <span>Stock: <strong className="text-foreground">{m.stock} units</strong></span>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleOpenMoveModal(m)}>
                    <MoveRight className="h-3.5 w-3.5 mr-1" /> Move
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setInspectorOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MOVE STOCK MODAL ──────────────────────────────────────────────── */}
      <Dialog open={moveModalOpen} onOpenChange={setMoveModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MoveRight className="h-5 w-5 text-primary" /> Relocate Medicine Stock
            </DialogTitle>
            <DialogDescription>
              Safely update physical rack and box location without altering price, GST, or batch data.
            </DialogDescription>
          </DialogHeader>

          {movingMedicine && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 rounded-lg bg-muted/40 space-y-1">
                <div className="font-bold text-foreground text-sm">{movingMedicine.name}</div>
                <div className="text-muted-foreground flex items-center gap-2">
                  <span>Batch: <strong className="font-mono text-foreground">{movingMedicine.batch}</strong></span>
                  <span>•</span>
                  <span>Current: <Badge variant="outline" className="font-mono text-[10px]">R:{movingMedicine.rack || "-"}{movingMedicine.box_no ? ` B:${movingMedicine.box_no}` : ""}</Badge></span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Target Rack *</Label>
                  <Input
                    value={targetRack}
                    onChange={(e) => setTargetRack(e.target.value.toUpperCase())}
                    placeholder="e.g. R01"
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Target Box (Optional)</Label>
                  <Input
                    value={targetBox}
                    onChange={(e) => setTargetBox(e.target.value.toUpperCase())}
                    placeholder="e.g. B001"
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Reason for Movement</Label>
                <Input
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  placeholder="e.g. Reorganized by fast-moving items"
                  className="h-9 text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMoveModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleExecuteMove}>
              Confirm Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
