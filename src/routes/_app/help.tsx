import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle, Keyboard, Receipt, Printer, ScanBarcode, Users, Package, Shield, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_app/help")({
  head: () => ({ meta: [{ title: "Help & Guide · RSP Medical Billing" }] }),
  component: HelpPage,
});

const FAQ: { q: string; a: string }[] = [
  { q: "How do I log in?", a: "Use your phone number as the User ID and the password given to you by the Admin (Manjju). Admin can view or reset any staff password on the Employees page." },
  { q: "I forgot my password — what should I do?", a: "Ask Manjju to open Employees → find your row → click Reset. A new 8-character password is shown; save it safely." },
  { q: "How do I make a bill quickly?", a: "Open Billing. Type the medicine name or scan its barcode. Press Enter to add the first result. Set qty and discount. Enter customer phone — if new, a customer record is created; if it exists, name auto-fills. Choose payment and click Save & Print." },
  { q: "Why do I have to enter a phone number?", a: "The phone is the customer's unique key. It lets you find old bills, credit balances and doctors quickly. Leave it blank for walk-in." },
  { q: "What is FEFO?", a: "First-Expiry-First-Out. When you sell a medicine, RSP automatically deducts stock from the batch that expires soonest, so nothing goes to waste." },
  { q: "How do notifications work?", a: "The bell (top right) shows low-stock items (below 20 units), medicines expiring within 90 days, and any bills you put on Hold. Click a notification to jump to the relevant screen." },
  { q: "How do I hold a bill and resume it later?", a: "On the Billing screen, click Hold to park the current cart. It appears in the bell as a held bill. Open Sales → Held (or the notification) to resume." },
  { q: "How do I print thermal receipts?", a: "Set your printer paper size in Settings → Printer (58mm / 80mm / A4). Click Save & Print on the billing screen. Turn on Auto-print to print automatically on Save." },
  { q: "Barcode labels didn't print bars — why?", a: "Chrome hides background colors by default. RSP now prints barcodes as SVG with 'print backgrounds' forced on, so bars appear on paper. Make sure your paper size in the print dialog matches the labels." },
  { q: "Who can cancel a bill?", a: "Admin and Manager only. Cancelling a bill restores its stock and is written to the Audit Log — the responsible cashier's ID is preserved." },
  { q: "What does each role see?", a: "Cashier: Billing + Sales + Customers + Dashboard. Pharmacist: adds Inventory / Medicines / Purchase. Manager: adds Reports, GST, Accounts, Audit. Admin (Manjju): everything including Employees, Settings, Backup." },
  { q: "How are sales tied to an employee?", a: "The Employee ID of the logged-in user is stamped on every bill. Employees page shows bill counts, revenue and cancellations per staff — so mistakes are traceable." },
  { q: "How do I bulk import medicines or customers?", a: "Open Medicines or Customers → Bulk import. Paste columns from Excel (Tab-separated). RSP validates and inserts rows in one click." },
  { q: "How do I take a backup?", a: "Sidebar → Backup → Export JSON. Save the file to Google Drive or a pen drive. To restore on another device, open Backup → Import JSON." },
  { q: "Reports — what date ranges are available?", a: "Reports supports Today, This month, Last 3 / 6 / 12 months, and Custom date range. Charts show revenue, payment mix (Cash/UPI/PhonePe/GPay/Card) and daily profit." },
];

const TOPICS = [
  { icon: Keyboard, title: "Shortcuts", body: "F2 = New bill · F9 = Save · F10 = Save & Print · Enter in search adds first result." },
  { icon: Receipt, title: "Billing", body: "Search or scan → add → set qty/disc → phone links customer → save / print." },
  { icon: Printer, title: "Printer", body: "Choose 58mm, 80mm or A4 in Settings. Test print from the 3-dot menu." },
  { icon: ScanBarcode, title: "Barcode & QR", body: "Use camera scan on billing screen. Barcode page prints label sheets." },
  { icon: Users, title: "Customers", body: "Auto-created from phone on bill. Bulk import from Excel supported." },
  { icon: Package, title: "Inventory & FEFO", body: "Low stock < 20 = warning. Expiry within 90 days = alert. Sales deduct earliest expiry first." },
  { icon: Shield, title: "Roles & audit", body: "Admin / Manager / Pharmacist / Cashier. Every action logged in the Audit Log." },
  { icon: BarChart3, title: "Reports", body: "Today / Monthly / 3M / 6M / 1Y / Custom + per-payment breakdown + daily profit." },
];

function HelpPage() {
  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <HelpCircle className="h-6 w-6 text-primary" /> Help &amp; Guide
        </h1>
        <p className="text-sm text-muted-foreground">Everything you need to run ANAM Medical Store on RSP Billing.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TOPICS.map((t) => (
          <Card key={t.title} className="p-4">
            <div className="h-9 w-9 grid place-items-center rounded-lg bg-primary/10 text-primary mb-2">
              <t.icon className="h-5 w-5" />
            </div>
            <div className="font-semibold text-sm">{t.title}</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.body}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="font-semibold mb-2">Frequently asked questions</div>
        <Accordion type="single" collapsible className="w-full">
          {FAQ.map((f, i) => (
            <AccordionItem key={i} value={"item-" + i}>
              <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>

      <Card className="p-4 bg-[color:var(--info)]/5 border-[color:var(--info)]/30">
        <div className="font-semibold text-sm">Why use RSP Billing?</div>
        <ul className="mt-2 text-sm text-muted-foreground list-disc pl-5 space-y-1">
          <li>Bill in under 20 seconds with barcode / QR scan and keyboard shortcuts.</li>
          <li>Batch-wise inventory with expiry tracking and FEFO deduction — no dead stock.</li>
          <li>Role-based access keeps cashiers focused and admins in control.</li>
          <li>Every bill, cancel and stock change is logged for accountability.</li>
          <li>Works offline on the local device — data lives on your machine, backup as JSON.</li>
        </ul>
      </Card>
    </div>
  );
}
