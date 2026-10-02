import { useState } from "react";
import { MessageCircle, Send, X, Bot } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "How do I create a new bill?",
  "How to add stock?",
  "How to file GST report?",
  "Shortcut keys",
];

type Msg = { role: "user" | "bot"; text: string };

export function ChatHelpFab() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: "Hi! I'm your RSP Assistant. Ask me anything about billing, inventory or GST." },
  ]);
  const [input, setInput] = useState("");

  const send = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setTimeout(() => {
      setMsgs((m) => [
        ...m,
        {
          role: "bot",
          text:
            "Try pressing F2 to open the billing screen, scan a barcode or type the medicine name in the search bar. Need a human? Call support at +91 90000 00000.",
        },
      ]);
    }, 500);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground",
          "shadow-lg shadow-primary/30 grid place-items-center hover:scale-105 transition-transform",
        )}
        aria-label="Chat help"
      >
        <MessageCircle className="h-6 w-6" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="p-4 border-b flex-row items-center gap-3 space-y-0">
            <div className="h-9 w-9 grid place-items-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <SheetTitle>Help Assistant</SheetTitle>
              <SheetDescription className="text-xs">Online · Replies instantly</SheetDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-card border rounded-bl-sm",
                )}
              >
                {m.text}
              </div>
            ))}
            <div className="pt-2 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs rounded-full border bg-card px-3 py-1.5 hover:bg-muted"
                >
                  {s}
                </button>
              ))}
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
              placeholder="Type your question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <Button type="submit" size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
