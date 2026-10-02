import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Receipt, ShoppingCart, PackageSearch, Pill, Users, Truck,
  UserCog, BarChart3, Percent, Wallet, ScanBarcode, QrCode, Settings, DatabaseBackup, LogOut,
  HelpCircle, ShieldCheck, PanelLeftClose, PanelLeftOpen, Store, UtensilsCrossed,
  ShoppingBasket, Wrench, CreditCard, RotateCcw,
} from "lucide-react";
import { logout, getUser, CAN, type Role } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useTenant, useFeatures, TYPE_COPY, type FeatureKey } from "@/lib/tenant";

type Item = {
  to: string; label?: string; icon: any; highlight?: boolean;
  cap: keyof typeof CAN["Admin"]; feat: FeatureKey; itemsLabel?: boolean;
};

const ALL_NAV: Item[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, cap: "dashboard", feat: "dashboard" },
  { to: "/", label: "Billing", icon: Receipt, highlight: true, cap: "billing", feat: "billing" },
  { to: "/sales", label: "Sales", icon: ShoppingCart, cap: "sales", feat: "sales" },
  { to: "/sales-returns", label: "Sales Returns", icon: RotateCcw, cap: "sales", feat: "sales" },
  { to: "/purchase", label: "Purchase", icon: Truck, cap: "purchase", feat: "purchase" },
  { to: "/purchase-returns", label: "Purchase Returns", icon: RotateCcw, cap: "purchase", feat: "purchase" },
  { to: "/inventory", label: "Inventory", icon: PackageSearch, cap: "inventory", feat: "inventory" },
  { to: "/medicines", icon: Pill, cap: "medicines", feat: "medicines", itemsLabel: true },
  { to: "/customers", label: "Customers", icon: Users, cap: "customers", feat: "customers" },
  { to: "/suppliers", label: "Suppliers", icon: Truck, cap: "suppliers", feat: "suppliers" },
  { to: "/employees", label: "Employees", icon: UserCog, cap: "employees", feat: "employees" },
  { to: "/loans", label: "Loans", icon: CreditCard, cap: "employees", feat: "employees" },
  { to: "/reports", label: "Reports", icon: BarChart3, cap: "reports", feat: "reports" },
  { to: "/gst", label: "GST", icon: Percent, cap: "gst", feat: "gst" },
  { to: "/accounts", label: "Accounts", icon: Wallet, cap: "accounts", feat: "accounts" },
  { to: "/audit", label: "Audit Log", icon: ShieldCheck, cap: "audit", feat: "audit" },
  { to: "/barcode", label: "Barcode", icon: ScanBarcode, cap: "barcode", feat: "barcode" },
  { to: "/qr", label: "QR Code", icon: QrCode, cap: "qr", feat: "qr" },
  { to: "/help", label: "Help & Guide", icon: HelpCircle, cap: "dashboard", feat: "help" },
  { to: "/settings", label: "Settings", icon: Settings, cap: "settings", feat: "settings" },
  { to: "/backup", label: "Backup", icon: DatabaseBackup, cap: "backup", feat: "backup" },
];

export const NAV = ALL_NAV;

const TYPE_ICON = {
  pill: Pill, utensils: UtensilsCrossed, shoppingBasket: ShoppingBasket, wrench: Wrench,
} as const;

const COLLAPSE_KEY = "rsp_sidebar_collapsed";

function useRole(): Role {
  const [role, setRole] = useState<Role>("Cashier");
  useEffect(() => { const u = getUser(); if (u) setRole(u.role); }, []);
  return role;
}

export function useCollapsed(): [boolean, (v: boolean) => void] {
  const [collapsed, set] = useState(false);
  useEffect(() => { set(localStorage.getItem(COLLAPSE_KEY) === "1"); }, []);
  const update = (v: boolean) => {
    set(v);
    localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
  };
  return [collapsed, update];
}

export function SidebarNav({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const role = useRole();
  const tenant = useTenant();
  const features = useFeatures();
  const copy = TYPE_COPY[tenant.type];
  const items = ALL_NAV.filter((i) => CAN[role][i.cap] && features[i.feat] !== false);

  return (
    <nav className="flex-1 overflow-y-auto p-2">
      {items.map((item) => {
        const active = path === item.to;
        const Icon = item.icon;
        const label = item.itemsLabel ? copy.items : item.label!;
        return (
          <Link
            key={item.to} to={item.to} onClick={onNavigate} title={label}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              collapsed && "justify-center px-0",
              active
                ? "bg-[color:var(--info)] text-[color:var(--info-foreground)]"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
            {!collapsed && item.highlight && !active && (
              <span className="ml-auto rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">F2</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useCollapsed();

  return (
    <aside
      className={cn(
        "hidden lg:flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <SidebarBrand collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <SidebarNav collapsed={collapsed} />
      <button
        onClick={() => { logout(); navigate({ to: "/login" }); }}
        title="Logout"
        className={cn(
          "flex items-center gap-3 border-t border-sidebar-border py-3 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
          collapsed ? "justify-center px-0" : "px-5",
        )}
      >
        <LogOut className="h-4 w-4" /> {!collapsed && "Logout"}
      </button>
    </aside>
  );
}

export function SidebarBrand({ collapsed, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const tenant = useTenant();
  const Icon = TYPE_ICON[TYPE_COPY[tenant.type].itemsIcon] ?? Store;
  return (
    <div className={cn("flex items-center gap-2 h-16 border-b border-sidebar-border", collapsed ? "justify-center px-0" : "px-5")}>
      <div className="grid place-items-center h-9 w-9 shrink-0 rounded-lg bg-primary text-primary-foreground">
        <Icon className="h-5 w-5" />
      </div>
      {!collapsed && (
        <div className="leading-tight min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">RSP Billing</div>
          <div className="text-[11px] text-muted-foreground truncate">{tenant.name}</div>
        </div>
      )}
      {onToggle && (
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn("rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground", collapsed && "absolute")}
          style={collapsed ? { position: "static" } : undefined}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
