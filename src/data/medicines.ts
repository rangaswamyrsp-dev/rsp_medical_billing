export type Medicine = {
  id: string;
  /** Product code shared across every batch of the same product (name + company). */
  code?: string;
  name: string;
  generic?: string;
  company?: string;
  supplier?: string;
  supplierId?: string;
  hsn?: string;
  pack?: string;
  batch: string;
  mrp: number;
  gst: number;
  stock: number;
  units?: string;
  old_rate?: number;
  new_rate?: number;
  cost?: number;
  /** Automatically calculated: MRP - Purchase Rate */
  profit?: number;
  expiry: string;
  box_no?: string;
  rack?: string;
  min_stock?: number;
  schedule_h?: boolean;
  /** Medicine Type e.g. Tablet, Syrup, Capsule, Injection, Ointment */
  type?: string;
  /** Category e.g. Antibiotic, Analgesic, Antacid, Vitamins */
  category?: string;
  /** Date and time when medicine was added */
  created_at?: string;
};

/** Calculate unit profit/value = MRP - Purchase Rate */
export function getMedicineProfit(m: { mrp: number; new_rate?: number; cost?: number }): number {
  const purchaseRate = m.new_rate !== undefined ? Number(m.new_rate) : (m.cost !== undefined ? Number(m.cost) : 0);
  return Math.max(0, (Number(m.mrp) || 0) - purchaseRate);
}

/** New businesses start completely empty — add your own products. */
export const MEDICINES: Medicine[] = [];

