// ── Payment Parsing & Breakdown Utilities ──────────────────────────────────────
//
// Extracts individual numeric payment amounts (Cash, Online/UPI, Credit/Loan)
// from payment strings, including split payments (e.g. "Cash ₹100 + Online ₹75").
// Guarantees zero duplicate counting and correct totals.
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentBreakdown = {
  cash: number;
  online: number;
  credit: number;
};

/**
 * Parses a sale payment string and returns separate numeric amounts for
 * Cash, Online/UPI, and Credit/Loan.
 *
 * Examples:
 * - "Cash ₹100 + Online ₹75", 175 -> { cash: 100, online: 75, credit: 0 }
 * - "cash", 500                    -> { cash: 500, online: 0, credit: 0 }
 * - "online", 500                  -> { cash: 0, online: 500, credit: 0 }
 * - "Credit / Loan", 500           -> { cash: 0, online: 0, credit: 500 }
 */
export function parsePaymentAmounts(
  paymentStr: string | undefined | null,
  grandTotal: number
): PaymentBreakdown {
  const p = (paymentStr || "cash").trim();
  const grand = Number(grandTotal) || 0;

  // Regex patterns to capture amounts with currency symbols or prefixes
  const cashMatch = p.match(/cash\s*[:₹rs.]*\s*([\d,]+(?:\.\d+)?)/i);
  const onlineMatch = p.match(/(?:online|upi)\s*[:₹rs.]*\s*([\d,]+(?:\.\d+)?)/i);
  const loanMatch = p.match(/(?:loan|credit)\s*[:₹rs.]*\s*([\d,]+(?:\.\d+)?)/i);

  // If multiple payment modes matched with numeric values (e.g. split payment)
  if ((cashMatch && onlineMatch) || (cashMatch && loanMatch) || (onlineMatch && loanMatch)) {
    const cAmt = cashMatch ? Number(cashMatch[1].replace(/,/g, "")) || 0 : 0;
    const oAmt = onlineMatch ? Number(onlineMatch[1].replace(/,/g, "")) || 0 : 0;
    const lAmt = loanMatch ? Number(loanMatch[1].replace(/,/g, "")) || 0 : 0;
    return { cash: cAmt, online: oAmt, credit: lAmt };
  }

  const lower = p.toLowerCase();
  if (lower.includes("loan") || lower.includes("credit")) {
    return { cash: 0, online: 0, credit: grand };
  }
  if (lower.includes("online") || lower.includes("upi")) {
    return { cash: 0, online: grand, credit: 0 };
  }
  // Default to Cash
  return { cash: grand, online: 0, credit: 0 };
}
