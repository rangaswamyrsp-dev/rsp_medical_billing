import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Calendar, Bell, UserCog, Settings2, Menu, AlertTriangle,
  PauseCircle, CalendarClock, ChevronDown, Lock, LogOut,
  LayoutGrid, Plus, Receipt, FileSpreadsheet, Camera, HelpCircle,
  Printer, Check, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getUser, logout, updateStoredUser } from "@/lib/auth";
import { actions, useStore } from "@/lib/store";
import { useFeatures, useTenant } from "@/lib/tenant";
import { toast } from "sonner";
import { SidebarBrand, SidebarNav } from "./AppSidebar";

export function AppHeader() {
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [name, setName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const navigate = useNavigate();

  const tenant = useTenant();
  const medicines = useStore((s) => s.medicines);
  const employees = useStore((s) => s.employees);
  const held = useStore((s) => s.held);
  const printer = useStore((s) => s.printer);
  const features = useFeatures();

  useEffect(() => {
    const u = getUser();
    setUser(u);
    setName(u?.name ?? "");
  }, []);

  const notifications = useMemo(() => {
    const list: { type: "low" | "expiry" | "held"; title: string; sub: string }[] = [];
    if (features.lowStockAlerts) {
      medicines
        .filter((m) => m.stock < 15)
        .slice(0, 8)
        .forEach((m) =>
          list.push({
            type: "low",
            title: `Low stock · ${m.name}`,
            sub: `Only ${m.stock} left${m.batch ? ` · Batch ${m.batch}` : ""}`,
          })
        );
    }
    if (features.expiryTracking) {
      const now = new Date();
      medicines.forEach((m) => {
        if (!m.expiry) return;
        const [y, mo] = m.expiry.split("-").map(Number);
        if (!y) return;
        const exp = new Date(y, (mo || 1) - 1, 1);
        const days = Math.floor((exp.getTime() - now.getTime()) / 86400000);
        if (days <= 90 && days >= -30) {
          list.push({
            type: "expiry",
            title: `Expiring · ${m.name}`,
            sub: `Exp ${m.expiry} · Batch ${m.batch}`,
          });
        }
      });
    }
    held.forEach((h) =>
      list.push({
        type: "held",
        title: `Hold bill ${h.id}`,
        sub: `${h.customerName || "Walk-in"} · ${h.items.length} items`,
      })
    );
    return list.slice(0, 15);
  }, [medicines, held, features]);

  const initials = (user?.name ?? "  ")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("") || "P";

  // Formatted date string (e.g. Thu, 09 Oct 2026)
  const formattedDate = useMemo(() => {
    try {
      const now = new Date();
      return now.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "Today";
    }
  }, []);

  const handlePasswordChange = () => {
    if (!newPassword || newPassword.length < 4) {
      toast.error("Password must be at least 4 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    if (user?.id) {
      // If employee, update in store
      const emp = employees.find((e) => e.id === user.id);
      if (emp) {
        actions.updateEmployee(emp.id, { password: newPassword });
      }
    }
    toast.success("Password changed successfully ✓");
    setPasswordOpen(false);
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <header className="h-16 shrink-0 border-b bg-card flex items-center justify-between px-3 lg:px-6 select-none">
      {/* ── Left Area: Mobile Menu Trigger + Brand ── */}
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 flex flex-col">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation Menu</SheetTitle>
            </SheetHeader>
            <SidebarBrand />
            <SidebarNav />
          </SheetContent>
        </Sheet>
      </div>

      {/* ── Right Area: Date Pill, Notifications, Quick Actions, Profile ── */}
      <div className="flex items-center gap-2.5">
        {/* Date Display Pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-background/60 text-xs font-medium text-muted-foreground shadow-2xs">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{formattedDate}</span>
        </div>

        {/* Notifications Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notifications">
              <Bell className="h-4.5 w-4.5 text-muted-foreground" />
              {notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white grid place-items-center shadow-xs">
                  {notifications.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 shadow-lg">
            <div className="px-3.5 py-2.5 border-b flex items-center justify-between bg-muted/30">
              <div className="text-xs font-semibold text-foreground">Notifications</div>
              <div className="text-[11px] text-muted-foreground">{notifications.length} pending</div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y">
              {notifications.length === 0 && (
                <div className="p-6 text-center text-xs text-muted-foreground">All caught up 🎉</div>
              )}
              {notifications.map((n, i) => {
                const Icon = n.type === "low" ? AlertTriangle : n.type === "expiry" ? CalendarClock : PauseCircle;
                const color = n.type === "low" ? "text-amber-500" : n.type === "expiry" ? "text-rose-500" : "text-blue-500";
                return (
                  <div key={i} className="px-3 py-2 flex items-start gap-2.5 text-xs hover:bg-muted/40 transition-colors">
                    <Icon className={"h-4 w-4 mt-0.5 shrink-0 " + color} />
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{n.title}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{n.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t p-2 flex gap-2 bg-muted/20">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => navigate({ to: "/inventory" })}>
                Inventory
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => navigate({ to: "/" })}>
                Billing
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Quick Actions Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="hidden md:flex items-center gap-1.5 h-8.5 px-3 text-xs font-medium">
              <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Quick Actions</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 text-xs">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground uppercase font-semibold">Shortcuts</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/" })}>
              <Receipt className="h-3.5 w-3.5 mr-2 text-emerald-600" /> New Bill (F2)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/medicines" })}>
              <Plus className="h-3.5 w-3.5 mr-2 text-blue-600" /> Add Medicine
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                navigate({ to: "/medicines" });
                setTimeout(() => window.dispatchEvent(new CustomEvent("rsp:open-import", { detail: { tab: "excel" } })), 100);
              }}
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-2 text-teal-600" /> Import Excel
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                navigate({ to: "/medicines" });
                setTimeout(() => window.dispatchEvent(new CustomEvent("rsp:open-import", { detail: { tab: "photo" } })), 100);
              }}
            >
              <Camera className="h-3.5 w-3.5 mr-2 text-purple-600" /> Add from Photo
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] text-muted-foreground uppercase font-semibold flex items-center justify-between">
              <span>Receipt Paper Size</span>
              <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 uppercase bg-primary/10 text-primary border-primary/20">
                {printer.paperSize || "58mm"}
              </Badge>
            </DropdownMenuLabel>
            <DropdownMenuItem
              className="flex items-center justify-between cursor-pointer"
              onClick={() => {
                actions.updatePrinter({ paperSize: "50mm" });
                toast.success("Receipt paper changed to 50mm (Thermal Roll)");
              }}
            >
              <div className="flex items-center">
                <Printer className="h-3.5 w-3.5 mr-2 text-primary" /> 50mm (Mini Roll)
              </div>
              {printer.paperSize === "50mm" && <Check className="h-3.5 w-3.5 text-emerald-600 font-bold" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex items-center justify-between cursor-pointer"
              onClick={() => {
                actions.updatePrinter({ paperSize: "58mm" });
                toast.success("Receipt paper changed to 58mm (Thermal Roll)");
              }}
            >
              <div className="flex items-center">
                <Printer className="h-3.5 w-3.5 mr-2 text-primary" /> 58mm (Standard Roll)
              </div>
              {(printer.paperSize === "58mm" || !printer.paperSize) && <Check className="h-3.5 w-3.5 text-emerald-600 font-bold" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex items-center justify-between cursor-pointer"
              onClick={() => {
                actions.updatePrinter({ paperSize: "80mm" });
                toast.success("Receipt paper changed to 80mm (Thermal Roll)");
              }}
            >
              <div className="flex items-center">
                <Printer className="h-3.5 w-3.5 mr-2 text-primary" /> 80mm (Wide Roll)
              </div>
              {printer.paperSize === "80mm" && <Check className="h-3.5 w-3.5 text-emerald-600 font-bold" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex items-center justify-between cursor-pointer"
              onClick={() => {
                actions.updatePrinter({ paperSize: "A4" });
                toast.success("Receipt paper changed to A4 Full Page");
              }}
            >
              <div className="flex items-center">
                <FileText className="h-3.5 w-3.5 mr-2 text-primary" /> A4 Full Page
              </div>
              {printer.paperSize === "A4" && <Check className="h-3.5 w-3.5 text-emerald-600 font-bold" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
              <Settings2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> All Printer Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/help" })}>
              <HelpCircle className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> Help &amp; Guide
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 hover:bg-muted/60 transition-colors">
              <Avatar className="h-8 w-8 ring-1 ring-border">
                <AvatarFallback className="bg-blue-600 text-white text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left leading-tight">
                <div className="text-xs font-semibold text-foreground">{user?.name || "User"}</div>
                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{user?.role || "ADMIN"}</div>
              </div>
              <ChevronDown className="h-3 w-3 text-muted-foreground opacity-60 hidden md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 text-xs">
            <DropdownMenuLabel className="font-normal">
              <div className="font-semibold text-foreground">{user?.name}</div>
              <div className="text-[11px] text-muted-foreground">{user?.phone || user?.id} · {user?.role}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <UserCog className="h-4 w-4 mr-2 text-muted-foreground" /> My Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
              <Lock className="h-4 w-4 mr-2 text-muted-foreground" /> Change Password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
              <Settings2 className="h-4 w-4 mr-2 text-muted-foreground" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950/40"
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4 mr-2" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Edit Profile Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update your display name for this workspace.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Full Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Employee / User ID</Label>
              <Input value={user?.id ?? ""} disabled className="bg-muted text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Phone</Label>
              <Input value={user?.phone ?? ""} disabled className="bg-muted text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Role</Label>
              <Input value={user?.role ?? ""} disabled className="bg-muted text-muted-foreground" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
                if (user) {
                  updateStoredUser({ name });
                  setUser({ ...user, name });
                  setEditOpen(false);
                  toast.success("Profile updated");
                }
              }}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change Password Dialog ── */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Enter a new login password for your account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">New Password</Label>
              <Input
                type="password"
                placeholder="At least 4 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Confirm New Password</Label>
              <Input
                type="password"
                placeholder="Re-type new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPasswordOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handlePasswordChange}>
              Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
