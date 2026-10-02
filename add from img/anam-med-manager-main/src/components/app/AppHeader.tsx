import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, MoreVertical, LogOut, UserCog, Bell, Settings2, Menu, AlertTriangle, PauseCircle, CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getUser, logout, updateStoredUser } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { useFeatures } from "@/lib/tenant";

import { toast } from "sonner";
import { SidebarBrand, SidebarNav } from "./AppSidebar";

export function AppHeader() {
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const medicines = useStore((s) => s.medicines);
  const held = useStore((s) => s.held);

  const features = useFeatures();

  const notifications = useMemo(() => {
    const list: { type: "low" | "expiry" | "held"; title: string; sub: string }[] = [];
    if (features.lowStockAlerts) {
      medicines
        .filter((m) => m.stock < 20)
        .slice(0, 8)
        .forEach((m) => list.push({ type: "low", title: `Low stock · ${m.name}`, sub: `Only ${m.stock} left${m.batch ? ` · Batch ${m.batch}` : ""}` }));
    }
    if (features.expiryTracking) {
      const now = new Date();
      medicines.forEach((m) => {
        if (!m.expiry) return;
        const [y, mo] = m.expiry.split("-").map(Number);
        if (!y) return;
        const exp = new Date(y, (mo || 1) - 1, 1);
        const days = Math.floor((exp.getTime() - now.getTime()) / 86400000);
        if (days <= 90 && days >= -30) list.push({ type: "expiry", title: `Expiring · ${m.name}`, sub: `Exp ${m.expiry} · Batch ${m.batch}` });
      });
    }
    held.forEach((h) => list.push({ type: "held", title: `Held bill ${h.id}`, sub: `${h.customerName || "Walk-in"} · ${h.items.length} items` }));
    return list.slice(0, 12);
  }, [medicines, held, features]);


  useEffect(() => {
    const u = getUser();
    setUser(u);
    setName(u?.name ?? "");
  }, []);

  const initials = (user?.name ?? "  ").split(" ").map((s) => s[0]).slice(0, 2).join("") || " ";

  return (
    <header className="h-16 shrink-0 border-b bg-card flex items-center gap-2 px-3 lg:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64 flex flex-col">
          <SheetHeader className="sr-only"><SheetTitle>Menu</SheetTitle></SheetHeader>
          <SidebarBrand />
          <SidebarNav />
        </SheetContent>
      </Sheet>
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Global search — medicines, invoices, customers…" className="pl-9 h-10 bg-background" />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-[color:var(--warning)] text-[10px] font-semibold text-white grid place-items-center">
                  {notifications.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <div className="text-sm font-semibold">Notifications</div>
              <div className="text-xs text-muted-foreground">{notifications.length} new</div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y">
              {notifications.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">You're all caught up 🎉</div>
              )}
              {notifications.map((n, i) => {
                const Icon = n.type === "low" ? AlertTriangle : n.type === "expiry" ? CalendarClock : PauseCircle;
                const color = n.type === "low" ? "text-[color:var(--warning)]" : n.type === "expiry" ? "text-destructive" : "text-[color:var(--info)]";
                return (
                  <div key={i} className="px-3 py-2 flex items-start gap-2 text-sm">
                    <Icon className={"h-4 w-4 mt-0.5 " + color} />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{n.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{n.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t p-2 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate({ to: "/inventory" })}>Inventory</Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate({ to: "/" })}>Billing</Button>
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-muted transition-colors">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-[color:var(--info)] text-[color:var(--info-foreground)] text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left leading-tight">
                <div className="text-sm font-medium">{user?.name}</div>
                <div className="text-[11px] text-muted-foreground">{user?.id} · {user?.role}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{user?.phone}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <UserCog className="h-4 w-4 mr-2" /> Edit profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
              <Settings2 className="h-4 w-4 mr-2" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { logout(); navigate({ to: "/login" }); }}>
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon"><MoreVertical className="h-5 w-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/backup" })}>Backup database</DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast("Printing test page…")}>Printer test page</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/help" })}>Help &amp; guide</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>Preferences</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>Update your display name for this device.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Employee ID</Label><Input value={user?.id ?? ""} disabled /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={user?.phone ?? ""} disabled /></div>
            <div className="space-y-1.5"><Label>Role</Label><Input value={user?.role ?? ""} disabled /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (user) {
                updateStoredUser({ name });
                setUser({ ...user, name });
                setEditOpen(false);
                toast.success("Profile updated");
              }
            }}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
