// ── Storage Service & Smart Rack Management Engine (RSP MediBill) ───────────
//
// Supports independent storage rules per medicine type (Tablets, Syrups, Capsules,
// Injections, Ointments, etc.), Rack-only vs Box-wise modes, multi-criteria filters
// (Type, Company, Manufacturer, Category, Branded/Generic), reserved empty positions,
// capacity tracking (items, packs, units), live overview, and stock movement logs.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import type { Medicine } from "@/data/medicines";

export type StorageMode = "box_wise" | "rack_only";
export type CapacityMode = "items_count" | "packs" | "units" | "unlimited";
export type BrandedGenericFilter = "all" | "branded" | "generic";
export type ReservedPlacement = "end" | "beginning";
export type BoxStatus = "available" | "occupied" | "full" | "reserved";

export interface StorageRule {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  priority: number; // 1 is highest priority
  status: "active" | "inactive";
  storage_mode: StorageMode;

  // Filter criteria: AND across criteria, OR within each list
  medicine_types: string[]; // ["Tablet", "Capsule"] or ["ALL"]
  companies: string[];      // ["Sun Pharma", "Cipla"] or ["ALL"]
  manufacturers: string[];  // ["Abbott"] or ["ALL"]
  categories: string[];     // ["Antibiotic", "Analgesic"] or ["ALL"]
  classification: BrandedGenericFilter; // "all" | "branded" | "generic"

  // Rack Configuration
  rack_prefix: string;          // e.g. "R" or "R-TAB"
  starting_rack_number: number; // e.g. 1 -> R01
  rack_count: number;           // e.g. 5
  allow_additional_racks: boolean;
  rack_pad: number;             // e.g. 2 -> R01

  // Box Configuration (only used if storage_mode === "box_wise")
  box_prefix: string;           // e.g. "B"
  box_pad: number;              // e.g. 3 -> B001
  usable_boxes_per_rack: number;// e.g. 20

  // Capacity Limits
  capacity_mode: CapacityMode;
  capacity_limit: number;       // e.g. 1 item per box, or 50 units

  // Reserved Empty Position Configuration
  reserved_positions_enabled: boolean;
  reserved_positions_per_rack: number; // e.g. 1
  reserved_placement: ReservedPlacement; // "end" | "beginning"

  // Automation & Override
  auto_assignment_enabled: boolean;
  manual_override_enabled: boolean;

  created_at?: string;
  updated_at?: string;
}

export interface StorageSettings {
  tenant_id: string;
  auto_assignment_enabled: boolean;
  rack_count: number;
  usable_boxes_per_rack: number;
  reserved_positions_per_rack: number;
  rack_prefix: string;
  box_prefix: string;
  rack_pad: number;
  box_pad: number;
  numbering_strategy: "rack_box" | "sequential";
  capacity_mode: CapacityMode;
  capacity_per_box: number;
  medicine_type_rule: "tablets_only" | "all" | "selected";
  applicable_medicine_types: string[];
  created_at?: string;
  updated_at?: string;
}

export interface StorageMovement {
  id: string;
  tenant_id: string;
  medicine_id: string;
  medicine_name: string;
  batch: string;
  from_rack: string;
  from_box: string;
  to_rack: string;
  to_box: string;
  quantity?: number;
  moved_by?: string;
  reason?: string;
  created_at: string;
}

export interface BoxPosition {
  rackCode: string;
  boxCode: string;
  positionNumber: number;
  isReserved: boolean;
  status: BoxStatus;
  medicines: Medicine[];
  distinctItemsCount: number;
  totalStockUnits: number;
}

export interface RackLayout {
  rackCode: string;
  rackNumber: number;
  ruleId?: string;
  ruleName?: string;
  storageMode: StorageMode;
  boxes: BoxPosition[]; // empty if rack_only
  totalPositions: number;
  usableBoxesCount: number;
  reservedCount: number;
  occupiedCount: number;
  availableCount: number;
  medicines: Medicine[]; // all medicines stored anywhere in this rack
}

export interface StorageOverviewStats {
  totalRacks: number;
  totalUsableBoxes: number;
  totalReservedPositions: number;
  occupiedBoxes: number;
  availableBoxes: number;
  fullBoxes: number;
  totalActiveRules: number;
  assignedMedicinesCount: number;
  unassignedMedicinesCount: number;
  storageUtilizationPercent: number;
}

// ── Default Storage Rules ─────────────────────────────────────────────────────

export const DEFAULT_STORAGE_RULES: StorageRule[] = [
  {
    id: "RULE-TAB",
    tenant_id: "",
    name: "Tablets Storage (Box-wise)",
    description: "Standard box-wise storage for all tablet medications (20 boxes/rack, pos 21 reserved).",
    priority: 1,
    status: "active",
    storage_mode: "box_wise",
    medicine_types: ["Tablet", "Tablets", "TAB", "Tabs"],
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
    capacity_limit: 6, // 6 items per box
    reserved_positions_enabled: true,
    reserved_positions_per_rack: 1,
    reserved_placement: "end",
    auto_assignment_enabled: true,
    manual_override_enabled: true,
  },
  {
    id: "RULE-SYR",
    tenant_id: "",
    name: "Syrups & Liquids (Rack-only)",
    description: "Dedicated shelf/rack-only storage for bottled syrups and liquid suspensions.",
    priority: 2,
    status: "active",
    storage_mode: "rack_only",
    medicine_types: ["Syrup", "Liquid", "Suspension", "Drops"],
    companies: ["ALL"],
    manufacturers: ["ALL"],
    categories: ["ALL"],
    classification: "all",
    rack_prefix: "R-SYR",
    starting_rack_number: 1,
    rack_count: 3,
    allow_additional_racks: true,
    rack_pad: 2,
    box_prefix: "B",
    box_pad: 3,
    usable_boxes_per_rack: 0,
    capacity_mode: "unlimited",
    capacity_limit: 0,
    reserved_positions_enabled: false,
    reserved_positions_per_rack: 0,
    reserved_placement: "end",
    auto_assignment_enabled: true,
    manual_override_enabled: true,
  },
  {
    id: "RULE-CAP",
    tenant_id: "",
    name: "Capsules & Injections (Box-wise)",
    description: "Organized box storage for blister capsules and fragile injection ampoules.",
    priority: 3,
    status: "active",
    storage_mode: "box_wise",
    medicine_types: ["Capsule", "Capsules", "Injection", "Vial"],
    companies: ["ALL"],
    manufacturers: ["ALL"],
    categories: ["ALL"],
    classification: "all",
    rack_prefix: "R-CAP",
    starting_rack_number: 1,
    rack_count: 3,
    allow_additional_racks: true,
    rack_pad: 2,
    box_prefix: "B",
    box_pad: 3,
    usable_boxes_per_rack: 15,
    capacity_mode: "items_count",
    capacity_limit: 1,
    reserved_positions_enabled: true,
    reserved_positions_per_rack: 1,
    reserved_placement: "end",
    auto_assignment_enabled: true,
    manual_override_enabled: true,
  },
  {
    id: "RULE-GEN",
    tenant_id: "",
    name: "General & Ointments (Rack-only)",
    description: "Open rack placement for topical ointments, creams, powders, and general medical supplies.",
    priority: 4,
    status: "active",
    storage_mode: "rack_only",
    medicine_types: ["Ointment", "Cream", "Powder", "General"],
    companies: ["ALL"],
    manufacturers: ["ALL"],
    categories: ["ALL"],
    classification: "all",
    rack_prefix: "R-GEN",
    starting_rack_number: 1,
    rack_count: 2,
    allow_additional_racks: true,
    rack_pad: 2,
    box_prefix: "B",
    box_pad: 3,
    usable_boxes_per_rack: 0,
    capacity_mode: "unlimited",
    capacity_limit: 0,
    reserved_positions_enabled: false,
    reserved_positions_per_rack: 0,
    reserved_placement: "end",
    auto_assignment_enabled: true,
    manual_override_enabled: true,
  },
];

export const DEFAULT_STORAGE_SETTINGS: StorageSettings = {
  tenant_id: "",
  auto_assignment_enabled: true,
  rack_count: 5,
  usable_boxes_per_rack: 20,
  reserved_positions_per_rack: 1,
  rack_prefix: "R",
  box_prefix: "B",
  rack_pad: 2,
  box_pad: 3,
  numbering_strategy: "rack_box",
  capacity_mode: "items_count",
  capacity_per_box: 1,
  medicine_type_rule: "tablets_only",
  applicable_medicine_types: ["Tablet", "Tablets", "TAB", "Tabs"],
};

// ── Rule Matcher Engine (AND across fields, OR within lists) ──────────────────

export function matchesStorageRule(med: Partial<Medicine>, rule: StorageRule): boolean {
  if (rule.status !== "active") return false;

  // 1. Medicine Type Filter (OR within list)
  if (rule.medicine_types && rule.medicine_types.length > 0 && !rule.medicine_types.includes("ALL")) {
    const rawType = (med.type || med.units || "").trim().toLowerCase();
    const typeMatched = rule.medicine_types.some((target) => {
      const t = target.trim().toLowerCase();
      if (!t || t === "all") return true;
      // If rule targets tablets, match explicit tab, but also common strip pack numbers (e.g. "10", "15", "20", "10's") or empty
      if (t.includes("tab") || t === "tablet") {
        if (!rawType || /^\d+('s)?$/.test(rawType) || rawType.includes("tab") || rawType.includes("strip")) {
          return true;
        }
      }
      return rawType === t || rawType.includes(t) || (t.includes("tab") && rawType.includes("tab"));
    });
    if (!typeMatched) return false;
  }

  // 2. Company / Brand Filter (OR within list)
  if (rule.companies && rule.companies.length > 0 && !rule.companies.includes("ALL")) {
    const rawComp = (med.company || "").trim().toLowerCase();
    const compMatched = rule.companies.some((c) => {
      const target = c.trim().toLowerCase();
      return target === "all" || rawComp === target || rawComp.includes(target);
    });
    if (!compMatched) return false;
  }

  // 3. Manufacturer Filter (OR within list)
  if (rule.manufacturers && rule.manufacturers.length > 0 && !rule.manufacturers.includes("ALL")) {
    const rawMfr = (med.company || med.supplier || "").trim().toLowerCase();
    const mfrMatched = rule.manufacturers.some((m) => {
      const target = m.trim().toLowerCase();
      return target === "all" || rawMfr === target || rawMfr.includes(target);
    });
    if (!mfrMatched) return false;
  }

  // 4. Category Filter (OR within list)
  if (rule.categories && rule.categories.length > 0 && !rule.categories.includes("ALL")) {
    const rawCat = (med.category || med.generic || "").trim().toLowerCase();
    const catMatched = rule.categories.some((c) => {
      const target = c.trim().toLowerCase();
      return target === "all" || rawCat === target || rawCat.includes(target);
    });
    if (!catMatched) return false;
  }

  // 5. Branded / Generic Classification Filter
  if (rule.classification && rule.classification !== "all") {
    const cat = (med.category || "").toLowerCase();
    const isGeneric = cat === "generic" || (med.box_no || "").toLowerCase() === "generic";
    if (rule.classification === "generic" && !isGeneric) return false;
    if (rule.classification === "branded" && isGeneric) return false;
  }

  return true;
}

// ── Find Matching Rule with Priority ──────────────────────────────────────────

export function findMatchingStorageRule(
  med: Partial<Medicine>,
  rules: StorageRule[]
): { rule: StorageRule | null; conflictingRules: StorageRule[] } {
  const activeRules = rules
    .filter((r) => r.status === "active")
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));

  const matched = activeRules.filter((r) => matchesStorageRule(med, r));
  if (matched.length === 0) return { rule: null, conflictingRules: [] };

  return {
    rule: matched[0], // Highest priority
    conflictingRules: matched.length > 1 ? matched.slice(1) : [],
  };
}

// ── Legacy Compatibility / Default Fallback ───────────────────────────────────

export function isMedicineEligibleForAutoStorage(
  med: { type?: string; units?: string; pack?: string },
  settings: StorageSettings
): boolean {
  if (!settings.auto_assignment_enabled) return false;
  const rawType = (med.type || med.units || "").trim().toLowerCase();
  if (settings.medicine_type_rule === "all") return true;
  if (settings.medicine_type_rule === "tablets_only") {
    return rawType.includes("tab") || rawType === "tablet" || rawType === "tablets";
  }
  if (settings.medicine_type_rule === "selected") {
    const list = settings.applicable_medicine_types.map((t) => t.trim().toLowerCase());
    return list.some((t) => rawType === t || (t.includes("tab") && rawType.includes("tab")));
  }
  return false;
}

// ── Rack Layout Generator ─────────────────────────────────────────────────────

export function formatRackCodeFromRule(rule: StorageRule, rackNum: number): string {
  const numStr = String(rackNum).padStart(rule.rack_pad || 2, "0");
  return `${rule.rack_prefix || "R"}${numStr}`;
}

export function formatBoxCodeFromRule(rule: StorageRule, boxNum: number): string {
  const numStr = String(boxNum).padStart(rule.box_pad || 3, "0");
  return `${rule.box_prefix || "B"}${numStr}`;
}

export function generateRuleRackLayout(
  rule: StorageRule,
  medicines: Medicine[]
): RackLayout[] {
  const layouts: RackLayout[] = [];
  const startNum = rule.starting_rack_number || 1;
  const count = Math.max(1, rule.rack_count || 1);

  // Map medicines by rack and box
  const assignedByRack = new Map<string, Medicine[]>();
  const assignedByBox = new Map<string, Medicine[]>();

  for (const m of medicines) {
    if (!m.rack) continue;
    const rKey = m.rack.trim().toUpperCase();
    const rList = assignedByRack.get(rKey) || [];
    rList.push(m);
    assignedByRack.set(rKey, rList);

    if (m.box_no && m.box_no !== "Branded" && m.box_no !== "Generic") {
      const compound = `${rKey}::${m.box_no.trim().toUpperCase()}`;
      const bList = assignedByBox.get(compound) || [];
      bList.push(m);
      assignedByBox.set(compound, bList);
    }
  }

  for (let r = 0; r < count; r++) {
    const rackNumber = startNum + r;
    const rackCode = formatRackCodeFromRule(rule, rackNumber);
    const rackMeds = assignedByRack.get(rackCode.toUpperCase()) || [];

    if (rule.storage_mode === "rack_only") {
      layouts.push({
        rackCode,
        rackNumber,
        ruleId: rule.id,
        ruleName: rule.name,
        storageMode: "rack_only",
        boxes: [],
        totalPositions: 0,
        usableBoxesCount: 0,
        reservedCount: 0,
        occupiedCount: rackMeds.length > 0 ? 1 : 0,
        availableCount: rackMeds.length > 0 ? 0 : 1,
        medicines: rackMeds,
      });
      continue;
    }

    // Box-wise storage
    const usableBoxes = Math.max(1, rule.usable_boxes_per_rack || 20);
    const reservedCount = rule.reserved_positions_enabled
      ? Math.max(0, rule.reserved_positions_per_rack || 0)
      : 0;
    const totalPos = usableBoxes + reservedCount;
    const boxPositions: BoxPosition[] = [];

    let rackOccupied = 0;
    let rackAvailable = 0;

    for (let pos = 1; pos <= totalPos; pos++) {
      let isReserved = false;
      if (rule.reserved_positions_enabled && reservedCount > 0) {
        if (rule.reserved_placement === "beginning") {
          isReserved = pos <= reservedCount;
        } else {
          isReserved = pos > usableBoxes;
        }
      }

      if (isReserved) {
        boxPositions.push({
          rackCode,
          boxCode: `POS-${String(pos).padStart(3, "0")}`,
          positionNumber: pos,
          isReserved: true,
          status: "reserved",
          medicines: [],
          distinctItemsCount: 0,
          totalStockUnits: 0,
        });
        continue;
      }

      // Usable Box
      const boxIndex = rule.reserved_placement === "beginning" ? pos - reservedCount : pos;
      const boxCode = formatBoxCodeFromRule(rule, boxIndex);
      const compoundKey = `${rackCode.toUpperCase()}::${boxCode.toUpperCase()}`;
      const boxMeds = assignedByBox.get(compoundKey) || [];
      const distinctCount = boxMeds.length;
      const totalUnits = boxMeds.reduce((acc, curr) => acc + (Number(curr.stock) || 0), 0);

      let status: BoxStatus = "available";
      if (distinctCount > 0) {
        if (rule.capacity_mode === "items_count" && rule.capacity_limit > 0) {
          status = distinctCount >= rule.capacity_limit ? "full" : "occupied";
        } else if (rule.capacity_mode === "units" && rule.capacity_limit > 0) {
          status = totalUnits >= rule.capacity_limit ? "full" : "occupied";
        } else {
          status = "occupied";
        }
      }

      if (status === "available") rackAvailable++;
      else rackOccupied++;

      boxPositions.push({
        rackCode,
        boxCode,
        positionNumber: pos,
        isReserved: false,
        status,
        medicines: boxMeds,
        distinctItemsCount: distinctCount,
        totalStockUnits: totalUnits,
      });
    }

    layouts.push({
      rackCode,
      rackNumber,
      ruleId: rule.id,
      ruleName: rule.name,
      storageMode: "box_wise",
      boxes: boxPositions,
      totalPositions: totalPos,
      usableBoxesCount: usableBoxes,
      reservedCount,
      occupiedCount: rackOccupied,
      availableCount: rackAvailable,
      medicines: rackMeds,
    });
  }

  return layouts;
}

// ── Overall Storage Overview Stats ────────────────────────────────────────────

export function calculateStorageOverview(
  rules: StorageRule[],
  medicines: Medicine[]
): {
  stats: StorageOverviewStats;
  rackLayouts: RackLayout[];
} {
  const activeRules = rules.filter((r) => r.status === "active");
  const allLayouts: RackLayout[] = [];

  for (const r of activeRules) {
    const rackList = generateRuleRackLayout(r, medicines);
    allLayouts.push(...rackList);
  }

  let totalUsable = 0;
  let totalReserved = 0;
  let occupied = 0;
  let available = 0;
  let full = 0;

  for (const r of allLayouts) {
    if (r.storageMode === "box_wise") {
      totalUsable += r.usableBoxesCount;
      totalReserved += r.reservedCount;
      for (const b of r.boxes) {
        if (b.isReserved) continue;
        if (b.status === "available") available++;
        else if (b.status === "full") { occupied++; full++; }
        else { occupied++; }
      }
    } else {
      totalUsable += 1;
      if (r.occupiedCount > 0) occupied += 1;
      else available += 1;
    }
  }

  let assignedCount = 0;
  let unassignedCount = 0;
  for (const m of medicines) {
    if (m.rack || (m.box_no && m.box_no !== "Branded" && m.box_no !== "Generic")) {
      assignedCount++;
    } else {
      unassignedCount++;
    }
  }

  const utilization = totalUsable > 0 ? Math.round((occupied / totalUsable) * 100) : 0;

  return {
    stats: {
      totalRacks: allLayouts.length,
      totalUsableBoxes: totalUsable,
      totalReservedPositions: totalReserved,
      occupiedBoxes: occupied,
      availableBoxes: available,
      fullBoxes: full,
      totalActiveRules: activeRules.length,
      assignedMedicinesCount: assignedCount,
      unassignedMedicinesCount: unassignedCount,
      storageUtilizationPercent: utilization,
    },
    rackLayouts: allLayouts,
  };
}

// ── Smart Automatic Location Resolver ─────────────────────────────────────────

export function resolveSmartStorageLocation(
  med: Partial<Medicine>,
  rules: StorageRule[],
  medicines: Medicine[],
  defaultSettings?: StorageSettings
): { rack: string; box_no?: string; ruleName?: string; note?: string } | null {
  let { rule } = findMatchingStorageRule(med, rules);

  if (!rule) {
    // If no specific rule matched, fallback to first active rule (e.g. general/tablet storage)
    const activeRules = rules.filter((r) => r.status === "active").sort((a, b) => (a.priority || 99) - (b.priority || 99));
    if (activeRules.length > 0) {
      rule = activeRules[0];
    } else if (defaultSettings && isMedicineEligibleForAutoStorage(med, defaultSettings)) {
      return findNextAvailableStorageBox(med, defaultSettings, medicines);
    } else {
      return null;
    }
  }

  if (!rule.auto_assignment_enabled) {
    return null;
  }

  const layouts = generateRuleRackLayout(rule, medicines);

  if (rule.storage_mode === "rack_only") {
    // Find first rack under this rule
    for (const layout of layouts) {
      return {
        rack: layout.rackCode,
        ruleName: rule.name,
        note: `Assigned to shelf ${layout.rackCode} (Rack-only mode)`,
      };
    }
    // Additional rack if permitted
    if (rule.allow_additional_racks) {
      const nextNum = (rule.starting_rack_number || 1) + layouts.length;
      const nextRack = formatRackCodeFromRule(rule, nextNum);
      return {
        rack: nextRack,
        ruleName: rule.name,
        note: `Created & assigned to ${nextRack}`,
      };
    }
    return null;
  }

  // Box-wise assignment: check existing occupied boxes with remaining capacity
  if (rule.capacity_mode === "items_count" && rule.capacity_limit > 1) {
    for (const layout of layouts) {
      for (const box of layout.boxes) {
        if (!box.isReserved && box.status === "occupied" && box.distinctItemsCount < rule.capacity_limit) {
          return { rack: box.rackCode, box_no: box.boxCode, ruleName: rule.name };
        }
      }
    }
  }

  // Find first completely available box
  for (const layout of layouts) {
    for (const box of layout.boxes) {
      if (!box.isReserved && box.status === "available") {
        return { rack: box.rackCode, box_no: box.boxCode, ruleName: rule.name };
      }
    }
  }

  // If full and additional racks allowed
  if (rule.allow_additional_racks) {
    const nextNum = (rule.starting_rack_number || 1) + layouts.length;
    const nextRack = formatRackCodeFromRule(rule, nextNum);
    const firstBox = formatBoxCodeFromRule(rule, 1);
    return {
      rack: nextRack,
      box_no: firstBox,
      ruleName: rule.name,
      note: `Capacity full: Auto-expanded to new rack ${nextRack}`,
    };
  }

  return null;
}

// ── Legacy Single-Settings Support ────────────────────────────────────────────

export function generateStorageLayout(
  settings: StorageSettings,
  medicines: Medicine[]
): { racks: RackLayout[]; metrics: any } {
  // Synthesize a storage rule from settings
  const syntheticRule: StorageRule = {
    id: "SYNTHETIC-LEGACY",
    tenant_id: settings.tenant_id,
    name: "Standard Storage",
    priority: 1,
    status: "active",
    storage_mode: "box_wise",
    medicine_types: settings.applicable_medicine_types,
    companies: ["ALL"],
    manufacturers: ["ALL"],
    categories: ["ALL"],
    classification: "all",
    rack_prefix: settings.rack_prefix || "R",
    starting_rack_number: 1,
    rack_count: settings.rack_count || 5,
    allow_additional_racks: true,
    rack_pad: settings.rack_pad || 2,
    box_prefix: settings.box_prefix || "B",
    box_pad: settings.box_pad || 3,
    usable_boxes_per_rack: settings.usable_boxes_per_rack || 20,
    capacity_mode: settings.capacity_mode,
    capacity_limit: settings.capacity_per_box,
    reserved_positions_enabled: (settings.reserved_positions_per_rack || 0) > 0,
    reserved_positions_per_rack: settings.reserved_positions_per_rack || 0,
    reserved_placement: "end",
    auto_assignment_enabled: settings.auto_assignment_enabled,
    manual_override_enabled: true,
  };

  const layouts = generateRuleRackLayout(syntheticRule, medicines);
  const { stats } = calculateStorageOverview([syntheticRule], medicines);
  return { racks: layouts, metrics: stats };
}

export function findNextAvailableStorageBox(
  med: { name?: string; type?: string; units?: string; stock?: number },
  settings: StorageSettings,
  existingMedicines: Medicine[]
): { rack: string; box_no: string } | null {
  const syntheticRule: StorageRule = {
    id: "SYNTHETIC",
    tenant_id: settings.tenant_id,
    name: "Legacy Settings",
    priority: 1,
    status: "active",
    storage_mode: "box_wise",
    medicine_types: settings.applicable_medicine_types,
    companies: ["ALL"],
    manufacturers: ["ALL"],
    categories: ["ALL"],
    classification: "all",
    rack_prefix: settings.rack_prefix || "R",
    starting_rack_number: 1,
    rack_count: settings.rack_count || 5,
    allow_additional_racks: true,
    rack_pad: settings.rack_pad || 2,
    box_prefix: settings.box_prefix || "B",
    box_pad: settings.box_pad || 3,
    usable_boxes_per_rack: settings.usable_boxes_per_rack || 20,
    capacity_mode: settings.capacity_mode,
    capacity_limit: settings.capacity_per_box,
    reserved_positions_enabled: (settings.reserved_positions_per_rack || 0) > 0,
    reserved_positions_per_rack: settings.reserved_positions_per_rack || 0,
    reserved_placement: "end",
    auto_assignment_enabled: settings.auto_assignment_enabled,
    manual_override_enabled: true,
  };

  const res = resolveSmartStorageLocation(med, [syntheticRule], existingMedicines, settings);
  if (res && res.rack && res.box_no) {
    return { rack: res.rack, box_no: res.box_no };
  }
  return null;
}

// ── Supabase & Local Storage Persistence for Rules & Settings ─────────────────

const LOCAL_RULES_KEY_PREFIX = "rsp_storage_rules_";
const LOCAL_SETTINGS_KEY_PREFIX = "rsp_storage_settings_";
const LOCAL_MOVEMENTS_KEY_PREFIX = "rsp_storage_movements_";

export async function sb_fetchStorageRules(tenantId: string): Promise<StorageRule[]> {
  const fallback = DEFAULT_STORAGE_RULES.map((r) => ({ ...r, tenant_id: tenantId }));
  if (!tenantId) return fallback;

  // Local cache check
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(`${LOCAL_RULES_KEY_PREFIX}${tenantId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
  }

  // Supabase check
  try {
    const { data, error } = await supabase
      .from("storage_rules")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("priority", { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      const mapped = data as StorageRule[];
      if (typeof window !== "undefined") {
        localStorage.setItem(`${LOCAL_RULES_KEY_PREFIX}${tenantId}`, JSON.stringify(mapped));
      }
      return mapped;
    }
  } catch (err) {
    console.warn("Storage rules fetch from Supabase fallback to default:", err);
  }

  // If first time, cache defaults locally
  if (typeof window !== "undefined") {
    localStorage.setItem(`${LOCAL_RULES_KEY_PREFIX}${tenantId}`, JSON.stringify(fallback));
  }
  return fallback;
}

export async function sb_saveStorageRule(
  tenantId: string,
  rule: StorageRule
): Promise<{ error: string | null; rule?: StorageRule }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const toSave: StorageRule = {
    ...rule,
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  };

  // Local write
  if (typeof window !== "undefined") {
    try {
      const key = `${LOCAL_RULES_KEY_PREFIX}${tenantId}`;
      const current = await sb_fetchStorageRules(tenantId);
      const idx = current.findIndex((r) => r.id === rule.id);
      if (idx >= 0) current[idx] = toSave;
      else current.push(toSave);
      current.sort((a, b) => a.priority - b.priority);
      localStorage.setItem(key, JSON.stringify(current));
    } catch {}
  }

  // Supabase write
  try {
    const { error } = await supabase
      .from("storage_rules")
      .upsert(toSave, { onConflict: "id" });

    if (error) {
      console.warn("Supabase upsert storage_rules warning:", error.message);
    }
  } catch (err) {
    console.warn("Supabase upsert storage_rules exception:", err);
  }

  return { error: null, rule: toSave };
}

export async function sb_deleteStorageRule(
  tenantId: string,
  ruleId: string
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  if (typeof window !== "undefined") {
    try {
      const key = `${LOCAL_RULES_KEY_PREFIX}${tenantId}`;
      const current = await sb_fetchStorageRules(tenantId);
      const filtered = current.filter((r) => r.id !== ruleId);
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch {}
  }

  try {
    const { error } = await supabase
      .from("storage_rules")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", ruleId);

    if (error) console.warn("Supabase delete storage_rules warning:", error.message);
  } catch (err) {
    console.warn("Supabase delete storage_rules exception:", err);
  }

  return { error: null };
}

export async function sb_fetchStorageSettings(tenantId: string): Promise<StorageSettings> {
  const fallback = { ...DEFAULT_STORAGE_SETTINGS, tenant_id: tenantId };
  if (!tenantId) return fallback;

  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(`${LOCAL_SETTINGS_KEY_PREFIX}${tenantId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object") {
          return { ...fallback, ...parsed, tenant_id: tenantId };
        }
      }
    } catch {}
  }

  try {
    const { data, error } = await supabase
      .from("storage_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!error && data) {
      const merged = { ...fallback, ...data };
      if (typeof window !== "undefined") {
        localStorage.setItem(`${LOCAL_SETTINGS_KEY_PREFIX}${tenantId}`, JSON.stringify(merged));
      }
      return merged;
    }
  } catch {}

  return fallback;
}

export async function sb_saveStorageSettings(
  tenantId: string,
  settings: Partial<StorageSettings>
): Promise<{ error: string | null; settings?: StorageSettings }> {
  if (!tenantId) return { error: "Tenant ID required" };
  const current = await sb_fetchStorageSettings(tenantId);
  const updated: StorageSettings = {
    ...current,
    ...settings,
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(`${LOCAL_SETTINGS_KEY_PREFIX}${tenantId}`, JSON.stringify(updated));
  }

  try {
    await supabase.from("storage_settings").upsert(updated, { onConflict: "tenant_id" });
  } catch {}

  return { error: null, settings: updated };
}

export async function sb_fetchStorageMovements(tenantId: string): Promise<StorageMovement[]> {
  if (!tenantId) return [];
  const localKey = `${LOCAL_MOVEMENTS_KEY_PREFIX}${tenantId}`;
  let localList: StorageMovement[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) localList = JSON.parse(raw);
    } catch {}
  }

  try {
    const { data, error } = await supabase
      .from("storage_movements")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && data && data.length > 0) return data as StorageMovement[];
  } catch {}

  return localList;
}

export async function sb_logStorageMovement(
  tenantId: string,
  movement: Omit<StorageMovement, "id" | "tenant_id" | "created_at">
): Promise<{ error: string | null; movement?: StorageMovement }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const newRecord: StorageMovement = {
    ...movement,
    id: "MOV-" + Date.now().toString().slice(-8),
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  };

  const localKey = `${LOCAL_MOVEMENTS_KEY_PREFIX}${tenantId}`;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(localKey);
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(newRecord);
      localStorage.setItem(localKey, JSON.stringify(list.slice(0, 200)));
    } catch {}
  }

  try {
    await supabase.from("storage_movements").insert(newRecord);
  } catch {}

  return { error: null, movement: newRecord };
}


// ── Batch Storage Location Allocator (6 items per box, 19 usable boxes/rack) ──

export function allocateStorageLocationsBatch(
  newItems: Array<{ rack?: string; box_no?: string; [key: string]: any }>,
  existingMedicines: Medicine[],
  itemsPerBox = 6,
  usableBoxesPerRack = 19
): Array<{ rack: string; box_no: string }> {
  // Count existing items per box
  const boxItemCounts = new Map<string, number>();

  for (const m of existingMedicines) {
    if (m.rack && m.box_no && m.box_no !== "Branded" && m.box_no !== "Generic") {
      const key = `${m.rack.trim().toUpperCase()}::${m.box_no.trim().toUpperCase()}`;
      boxItemCounts.set(key, (boxItemCounts.get(key) || 0) + 1);
    }
  }

  let currentRack = 1;
  let currentBox = 1;

  // Advance to first available position with space (< itemsPerBox)
  const getNextAvailablePosition = (): { rackCode: string; boxCode: string } => {
    while (true) {
      const rCode = `R${String(currentRack).padStart(2, "0")}`;
      const bCode = `B${String(currentBox).padStart(3, "0")}`;
      const key = `${rCode}::${bCode}`;
      const currentCount = boxItemCounts.get(key) || 0;

      if (currentCount < itemsPerBox) {
        boxItemCounts.set(key, currentCount + 1);
        return { rackCode: rCode, boxCode: bCode };
      }

      currentBox++;
      if (currentBox > usableBoxesPerRack) {
        currentRack++;
        currentBox = 1;
      }
    }
  };

  return newItems.map((item) => {
    if (item.rack?.trim() && item.box_no?.trim() && item.box_no !== "Branded" && item.box_no !== "Generic") {
      const rCode = item.rack.trim().toUpperCase();
      const bCode = item.box_no.trim().toUpperCase();
      const key = `${rCode}::${bCode}`;
      boxItemCounts.set(key, (boxItemCounts.get(key) || 0) + 1);
      return { rack: rCode, box_no: bCode };
    }

    const pos = getNextAvailablePosition();
    return { rack: pos.rackCode, box_no: pos.boxCode };
  });
}
