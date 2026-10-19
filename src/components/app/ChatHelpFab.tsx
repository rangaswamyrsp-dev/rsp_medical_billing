import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, Bot, Sparkles, HelpCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getStoreState, type State } from "@/lib/store";

const SUGGESTIONS = [
  "How do I create a new bill?",
  "How to add purchase stock?",
  "How to file GST report?",
  "What are the shortcut keys?",
  "How to hold and resume bills?",
  "How to record employee attendance?",
];

type Msg = { role: "user" | "bot"; text: string };

function generateAssistantResponse(query: string, store: State): string {
  const q = query.toLowerCase().trim();

  // 1. Billing questions
  if (q.includes("bill") || q.includes("invoice") || q.includes("billing") || q.includes("sale")) {
    if (q.includes("hold") || q.includes("held") || q.includes("park") || q.includes("resume")) {
      return "To put a bill on hold, click the 'Hold' button (or press F4) on the Billing counter. You can resume any hold bill by clicking the 'Hold (count)' button at the top of the search bar.";
    }
    if (q.includes("print") || q.includes("thermal")) {
      return "To print a bill, click 'Print' (or press F10) on the billing screen. Configure your thermal printer size (58mm, 80mm, or A4) under Settings → Printer.";
    }
    if (q.includes("whatsapp")) {
      return "To send a bill on WhatsApp, enter the customer's mobile number and click the green 'WhatsApp Bill' button. A formatted invoice will open directly in WhatsApp Web.";
    }
    if (q.includes("credit") || q.includes("loan")) {
      return "For credit sales: select 'Credit' under Payment options on Billing. Enter the customer's name and phone number. The amount will be added to the customer's loan balance.";
    }
    return "To create a bill: 1) Press F2 or open Billing. 2) Enter Customer Name & Phone (both required). 3) Type medicine name or scan barcode. 4) Select pack/loose quantity and discount. 5) Choose payment mode (Cash/Online/Split/Credit) and click Save (F9) or Print (F10).";
  }

  // 2. Stock / Inventory / Medicines questions
  if (q.includes("stock") || q.includes("medicine") || q.includes("inventory") || q.includes("item") || q.includes("fefo") || q.includes("expiry")) {
    if (q.includes("fefo") || q.includes("expiry") || q.includes("expire")) {
      return "RSP Billing automatically uses FEFO (First-Expiry-First-Out). When selling a medicine, batches expiring earliest are automatically deducted first to prevent expired dead stock.";
    }
    if (q.includes("import") || q.includes("excel") || q.includes("photo") || q.includes("camera")) {
      return "You can import medicines in bulk from Medicine Master: 1) Click 'Import Excel' to paste or upload an Excel/CSV file. 2) Click 'Add from Photo' to scan printed purchase bills using AI.";
    }
    const lowStockCount = store.medicines.filter((m) => m.stock < 20).length;
    return `You have ${store.medicines.length} total medicines in your database (${lowStockCount} items currently low on stock). You can add new medicines in Medicine Master or record fresh stock via the Purchase section.`;
  }

  // 3. Purchase questions
  if (q.includes("purchase") || q.includes("supplier")) {
    return "To record a supplier purchase: Go to the Purchase section from the left sidebar and click 'New Purchase'. Enter supplier name, invoice number, medicines, batch numbers, rates, and GST. Saving automatically updates your stock and records the purchase.";
  }

  // 4. GST & Tax questions
  if (q.includes("gst") || q.includes("tax") || q.includes("gstr")) {
    return "Open the GST section from the left menu to view your monthly and quarterly GST summaries (GSTR-1, GSTR-3B). You can download Excel spreadsheets or print GST tax reports ready for your chartered accountant.";
  }

  // 5. Shortcuts
  if (q.includes("shortcut") || q.includes("key") || q.includes("keyboard")) {
    return "Key shortcuts in RSP Billing:\n• F2: New Bill / Open Billing\n• F3: Focus Medicine Search Bar\n• F4: Hold / View Hold Bills\n• F7: Open Inventory\n• F8: Open Purchase\n• F9: Save Bill\n• F10: Save & Print Bill\n• Ctrl + K: Global Search\n• Ctrl + B: Toggle Sidebar collapse";
  }

  // 6. Attendance & Salary / Payroll
  if (q.includes("attendance") || q.includes("salary") || q.includes("payroll") || q.includes("employee") || q.includes("staff")) {
    return "In the Employees section: 1) Mark daily attendance (Full, Half, or Absent). 2) In the 'Salary & Payroll' tab, the system calculates salary pro-rated by duty days (base ÷ 26 × duty days). 3) Confirm payouts and print official Salary Slips in one click.";
  }

  // 7. Customers & Loans
  if (q.includes("customer") || q.includes("loan") || q.includes("balance") || q.includes("borrow")) {
    return "Customers are automatically registered by phone number on billing. Outstanding credit balances are tracked in the Loans section, where you can record repayments or view customer loan ledgers.";
  }

  // 8. Backup & Data
  if (q.includes("backup") || q.includes("restore") || q.includes("export") || q.includes("data")) {
    return "To take a complete backup: Navigate to Backup in the left sidebar and click 'Export Backup JSON'. You can restore your data anytime on any machine using 'Import Backup'.";
  }

  // Default fallback
  return "I'm here to help with Billing, Inventory, Purchases, GST, Attendance, Payroll, and Shortcuts. Try asking 'How to make a bill?', 'What are the keyboard shortcuts?', or 'How to add stock?'. You can also call support at +91 7569790229.";
}

export function ChatHelpFab() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: "Hi! I'm your RSP Assistant. Ask me anything about billing, inventory, purchases, GST, or shortcuts." },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOpenChat = () => setOpen((prev) => !prev);
    window.addEventListener("rsp:open-chat", handleOpenChat);
    return () => window.removeEventListener("rsp:open-chat", handleOpenChat);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setTimeout(() => {
      const storeState = getStoreState();
      const reply = generateAssistantResponse(q, storeState);
      setMsgs((m) => [...m, { role: "bot", text: reply }]);
    }, 300);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-1 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground",
          "shadow-lg shadow-primary/30 grid place-items-center hover:scale-105 transition-transform",
        )}
        aria-label="Chat help"
        title="Open RSP Help Assistant (F1)"
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="p-4 border-b flex-row items-center gap-3 space-y-0">
            <div className="h-9 w-9 grid place-items-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <SheetTitle className="text-base font-semibold">Help Assistant</SheetTitle>
              <SheetDescription className="text-xs">RSP Billing Assistant · Replies instantly</SheetDescription>
            </div>
            {/* Note: Redundant close button removed — SheetContent already provides a top-right close icon */}
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-line leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-card border rounded-bl-sm shadow-xs",
                )}
              >
                {m.text}
              </div>
            ))}
            <div className="pt-2">
              <div className="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" /> Suggested queries:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs rounded-full border bg-card px-3 py-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t p-3 flex gap-2 bg-card"
          >
            <Input
              placeholder="Ask anything about billing, stock, GST…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="h-10 text-sm"
            />
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

