import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Receipt, ShoppingCart, PackageSearch, Pill, Users, Truck,
  UserCog, BarChart3, Percent, Wallet, ScanBarcode, QrCode, Settings, DatabaseBackup, LogOut,
  HelpCircle, ShieldCheck, PanelLeftClose, PanelLeftOpen, CreditCard, RotateCcw, Banknote, ClipboardCheck,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { logout, getUser, CAN, type Role } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useTenant, useFeatures, TYPE_COPY, type FeatureKey } from "@/lib/tenant";

export type NavItem = {
  to?: string;
  label?: string;
  icon: any;
  highlight?: boolean;
  f2?: boolean;
  cap: keyof typeof CAN["Admin"];
  feat: FeatureKey;
  itemsLabel?: boolean;
};

export type NavGroup = {
  id: string;
  title: string;
  icon: any;
  badgeBg: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "billing_sales",
    title: "Sales & Billing",
    icon: ShoppingCart,
    badgeBg: "bg-emerald-500 text-white",
    items: [
      { to: "/sales", label: "Sales", icon: ShoppingCart, cap: "sales", feat: "sales" },
      { to: "/sales-returns", label: "Sales Returns", icon: RotateCcw, cap: "sales", feat: "sales" },
      { to: "/payments", label: "Payments", icon: Banknote, cap: "sales", feat: "sales" },
      { to: "/customers", label: "Customers", icon: Users, cap: "customers", feat: "customers" },
    ],
  },
  {
    id: "purchases_suppliers",
    title: "Purchases & Suppliers",
    icon: Truck,
    badgeBg: "bg-indigo-600 text-white",
    items: [
      { to: "/purchase", label: "Purchase", icon: Truck, cap: "purchase", feat: "purchase" },
      { to: "/purchase-returns", label: "Purchase R", icon: RotateCcw, cap: "purchase", feat: "purchase" },
      { to: "/suppliers", label: "Suppliers", icon: Users, cap: "suppliers", feat: "suppliers" },
    ],
  },
  {
    id: "inventory_medicines",
    title: "Inventory & Medicines",
    icon: PackageSearch,
    badgeBg: "bg-blue-600 text-white",
    items: [
      { to: "/medicines", label: "Medicine Master", icon: Pill, cap: "medicines", feat: "medicines", itemsLabel: true },
      { to: "/inventory", label: "Inventory", icon: PackageSearch, cap: "inventory", feat: "inventory" },
      { to: "/audit-inventory", label: "Audit Inventory", icon: ClipboardCheck, cap: "inventory", feat: "inventory" },
      { to: "/barcode", label: "Barcode", icon: ScanBarcode, cap: "barcode", feat: "barcode" },
      { to: "/qr", label: "QR Code", icon: QrCode, cap: "qr", feat: "qr" },
    ],
  },
  {
    id: "reports_accounts",
    title: "Reports & Accounts",
    icon: BarChart3,
    badgeBg: "bg-amber-500 text-white",
    items: [
      { to: "/reports", label: "Reports", icon: BarChart3, cap: "reports", feat: "reports" },
      { to: "/accounts", label: "Accounts", icon: Wallet, cap: "accounts", feat: "accounts" },
      { to: "/loans", label: "Loans", icon: CreditCard, cap: "employees", feat: "employees" },
      { to: "/gst", label: "GST", icon: Percent, cap: "gst", feat: "gst" },
      { to: "/audit", label: "Audit Log", icon: ShieldCheck, cap: "audit", feat: "audit" },
    ],
  },
  {
    id: "administration",
    title: "Administration",
    icon: Settings,
    badgeBg: "bg-slate-700 text-white",
    items: [
      { to: "/employees", label: "Employees", icon: UserCog, cap: "employees", feat: "employees" },
      { to: "/help", label: "Help & Guide", icon: HelpCircle, cap: "dashboard", feat: "help" },
      { to: "/settings", label: "Settings", icon: Settings, cap: "settings", feat: "settings" },
      { to: "/backup", label: "Backup", icon: DatabaseBackup, cap: "backup", feat: "backup" },
    ],
  },
];

// Flatted list for backward compatibility
export const ALL_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, cap: "dashboard" as const, feat: "dashboard" as const },
  { to: "/", label: "Billing / POS", icon: Receipt, highlight: true, f2: true, cap: "billing" as const, feat: "billing" as const },
  ...NAV_GROUPS.flatMap((g) => g.items.filter((i) => i.to)).map((i) => ({
    to: i.to!,
    label: i.label,
    icon: i.icon,
    highlight: i.highlight,
    cap: i.cap,
    feat: i.feat,
    itemsLabel: i.itemsLabel,
  })),
];

export const NAV = ALL_NAV;

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

  useEffect(() => {
    const handleToggle = () => update(!collapsed);
    window.addEventListener("rsp:toggle-sidebar", handleToggle);
    return () => window.removeEventListener("rsp:toggle-sidebar", handleToggle);
  }, [collapsed]);

  return [collapsed, update];
}

export function SidebarNav({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const role = useRole();
  const tenant = useTenant();
  const features = useFeatures();
  const copy = TYPE_COPY[tenant.type];

  // Group expansion state
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    billing_sales: true,
    purchases_suppliers: true,
    inventory_medicines: true,
    reports_accounts: false,
    administration: false,
  });

  // Automatically expand parent group when active route changes
  useEffect(() => {
    NAV_GROUPS.forEach((grp) => {
      const containsActive = grp.items.some((i) => i.to === path);
      if (containsActive) {
        setOpenGroups((prev) => ({ ...prev, [grp.id]: true }));
      }
    });
  }, [path]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const isDashboardActive = path === "/dashboard";
  const isBillingActive = path === "/";
  const canDashboard = CAN[role]?.dashboard && features?.dashboard !== false;
  const canBilling = CAN[role]?.billing && features?.billing !== false;

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1.5">
      {/* ── 1. Top Prominent Dashboard Item ── */}
      {canDashboard && (
        <div>
          <Link
            to="/dashboard"
            onClick={onNavigate}
            title="Dashboard"
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold select-none transition-all duration-150",
              collapsed && "justify-center px-0 py-2.5",
              isDashboardActive
                ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">Dashboard</span>}
          </Link>
        </div>
      )}

      {/* ── 2. Prominent Standalone Billing / POS Entry (Directly Below Dashboard) ── */}
      {canBilling && (
        <div className="mb-2">
          <Link
            to="/"
            onClick={onNavigate}
            title="Billing / POS (F2)"
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold select-none transition-all duration-150",
              collapsed && "justify-center px-0 py-2.5",
              isBillingActive
                ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Receipt className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="truncate">Billing / POS</span>
                <span
                  className={cn(
                    "ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold tracking-tight",
                    isBillingActive
                      ? "bg-white/20 text-white"
                      : "bg-emerald-600/10 text-emerald-600"
                  )}
                >
                  F2
                </span>
              </>
            )}
          </Link>
        </div>
      )}

      {/* ── Grouped Navigation ── */}
      {NAV_GROUPS.map((grp) => {
        const visibleItems = grp.items.filter(
          (i) => CAN[role]?.[i.cap] && features?.[i.feat] !== false
        );
        if (visibleItems.length === 0) return null;

        const isOpen = openGroups[grp.id] ?? false;
        const GrpIcon = grp.icon;

        if (collapsed) {
          // In collapsed icon mode: show items directly with spacing
          return (
            <div key={grp.id} className="pt-2 border-t border-sidebar-border/40 first:border-t-0 space-y-1">
              {visibleItems.map((item) => {
                const active = item.to ? path === item.to : false;
                const Icon = item.icon;
                const label = item.itemsLabel ? copy.items : item.label!;

                return (
                  <Link
                    key={item.to}
                    to={item.to!}
                    onClick={onNavigate}
                    title={label}
                    className={cn(
                      "flex items-center justify-center rounded-md p-2 text-sm font-medium transition-colors select-none",
                      active
                        ? "bg-blue-600 text-white shadow-xs font-semibold"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                  </Link>
                );
              })}
            </div>
          );
        }

        // Expanded view with expandable/collapsible headers
        return (
          <div key={grp.id} className="space-y-1">
            {/* Group Header Button */}
            <button
              type="button"
              onClick={() => toggleGroup(grp.id)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-sidebar-foreground hover:bg-sidebar-accent/60 rounded-md select-none transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className={cn("grid place-items-center h-5 w-5 rounded-md text-[11px]", grp.badgeBg)}>
                  <GrpIcon className="h-3 w-3" />
                </div>
                <span className="truncate">{grp.title}</span>
              </div>
              {isOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>

            {/* Collapsible Content */}
            {isOpen && (
              <div className="space-y-0.5 pl-1.5">
                {visibleItems.map((item) => {
                  const active = item.to ? path === item.to : false;
                  const Icon = item.icon;
                  const label = item.itemsLabel ? copy.items : item.label!;

                  return (
                    <Link
                      key={item.to}
                      to={item.to!}
                      onClick={onNavigate}
                      title={label}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium select-none transition-colors",
                        active
                          ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 font-semibold shadow-2xs"
                          : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")} />
                      <span className="truncate">{label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
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
          "flex items-center gap-3 border-t border-sidebar-border py-3 text-sm font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors select-none",
          collapsed ? "justify-center px-0" : "px-5",
        )}
      >
        <LogOut className="h-4 w-4 shrink-0 text-rose-600" /> {!collapsed && "Logout"}
      </button>
    </aside>
  );
}

export function SidebarBrand({ collapsed, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const tenant = useTenant();

  return (
    <div className={cn("flex items-center gap-2.5 h-16 border-b border-sidebar-border", collapsed ? "justify-center px-0" : "px-4")}>
      <img
        src="/rsp-logo.png"
        alt="RSP Medical Billing"
        className="h-9 w-9 shrink-0 object-contain rounded-lg"
      />
      {!collapsed && (
        <div className="leading-tight min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground truncate">RSP Billing</div>
          <div className="text-[11px] text-muted-foreground font-medium truncate">{tenant.name || "RSP Medical"}</div>
        </div>
      )}
      {onToggle && (
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn("rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors", collapsed && "absolute")}
          style={collapsed ? { position: "static" } : undefined}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
