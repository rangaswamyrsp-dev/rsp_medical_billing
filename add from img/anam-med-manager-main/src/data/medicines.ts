export type Medicine = {
  id: string;
  /** Product code shared across every batch of the same product (name + company). */
  code?: string;
  /** Retail barcode printed on the pack (EAN / UPC / GTIN). */
  barcode?: string;
  name: string;
  batch: string;
  mrp: number;
  gst: number;
  stock: number;
  expiry: string;
  /** Supplier / stockist the stock was bought from (e.g. AMBIKAA MEDINEEDS). */
  company: string;
  /** Purchase bill / tax invoice number this batch came in on. */
  invoice?: string;
  /** HSN / SAC code from the purchase invoice. */
  hsn?: string;
  /** Manufacturer / marketed-by short code printed on the bill (e.g. SUN, CIP, LUP). */
  mfr?: string;
  /** Dosage form: Tablet, Capsule, Syrup, Injection… */
  type?: string;
  /** Therapeutic category. */
  category?: string;
  /** Pack size e.g. 10x10, 1x15, 100ml. */
  pack?: string;
  /** Purchase / trade price per unit. */
  purchase?: number;
};

/** New businesses start completely empty — add your own products. */
export const MEDICINES: Medicine[] = [];
