"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ShoppingCart,
  Landmark,
  Receipt,
  RotateCcw,
  Users,
  Shirt,
  Tags,
  Award,
  Package,
  SlidersHorizontal,
  ArrowLeftRight,
  ScrollText,
  Truck,
  ClipboardList,
  BarChart3,
  Shield,
  Settings,
  FileClock,
  LogOut,
  ChevronLeft,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";
import { useAuth, UserRole } from "@/contexts/AuthContext";

type MenuItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  allowedRoles?: UserRole[]; // undefined = all
};

type MenuGroup = { id: string; name: string; emoji: string; items: MenuItem[] };

const MANAGER: UserRole[] = ["admin", "manager"];

const topMenuItems: MenuItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, allowedRoles: MANAGER },
  { name: "POS", href: "/pos", icon: ShoppingCart },
  { name: "Cash Register", href: "/cash-register", icon: Landmark },
];

const menuGroups: MenuGroup[] = [
  {
    id: "sales",
    name: "Sales",
    emoji: "🧾",
    items: [
      { name: "Sales", href: "/sales", icon: Receipt, allowedRoles: MANAGER },
      { name: "Returns", href: "/returns", icon: RotateCcw },
      { name: "Cash Reports", href: "/cash-register/reports", icon: ScrollText, allowedRoles: MANAGER },
      { name: "Customers", href: "/customers", icon: Users },
    ],
  },
  {
    id: "catalog",
    name: "Catalog",
    emoji: "👕",
    items: [
      { name: "Products", href: "/products", icon: Shirt, allowedRoles: MANAGER },
      { name: "Categories", href: "/products/categories", icon: Tags, allowedRoles: MANAGER },
      { name: "Brands", href: "/products/brands", icon: Award, allowedRoles: MANAGER },
    ],
  },
  {
    id: "inventory",
    name: "Inventory",
    emoji: "📦",
    items: [
      { name: "Stock", href: "/inventory", icon: Package, allowedRoles: MANAGER },
      { name: "Adjustments", href: "/inventory/adjustments", icon: SlidersHorizontal, allowedRoles: MANAGER },
      { name: "Transfers", href: "/inventory/transfers", icon: ArrowLeftRight, allowedRoles: MANAGER },
      { name: "Stock Ledger", href: "/inventory/ledger", icon: ScrollText, allowedRoles: MANAGER },
    ],
  },
  {
    id: "purchasing",
    name: "Purchasing",
    emoji: "🚚",
    items: [
      { name: "Suppliers", href: "/suppliers", icon: Truck, allowedRoles: MANAGER },
      { name: "Purchase Orders", href: "/purchase-orders", icon: ClipboardList, allowedRoles: MANAGER },
    ],
  },
  {
    id: "admin",
    name: "Administration",
    emoji: "⚙️",
    items: [
      { name: "Reports", href: "/reports", icon: BarChart3, allowedRoles: MANAGER },
      { name: "Users", href: "/users", icon: Shield, allowedRoles: MANAGER },
      { name: "Settings", href: "/settings", icon: Settings, allowedRoles: MANAGER },
      { name: "Audit Logs", href: "/settings/audit-logs", icon: FileClock, allowedRoles: MANAGER },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleCollapse, isOpen, close } = useSidebar();
  const { currentUser, logout } = useAuth();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const activeGroup = menuGroups.find((group) =>
      group.items.some(
        (item) => pathname === item.href || pathname.startsWith(item.href + "/")
      )
    );
    if (activeGroup)
      setExpandedGroups((p) => ({ ...p, [activeGroup.id]: true }));
  }, [pathname]);

  const canSee = (item: MenuItem) =>
    !item.allowedRoles ||
    (currentUser ? item.allowedRoles.includes(currentUser.role) : false);

  const visibleTopItems = topMenuItems.filter(canSee);
  const visibleGroups = menuGroups
    .map((g) => ({ ...g, items: g.items.filter(canSee) }))
    .filter((g) => g.items.length > 0);

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/cash-register" && pathname.startsWith(href + "/"));

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={close}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 bg-surface border-r border-outline/30 flex flex-col adaptive-transition lg:static shadow-lg lg:shadow-none",
          isCollapsed ? "w-20" : "w-[280px] sm:w-64",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className={cn("p-6 flex items-center justify-between", isCollapsed && "px-4")}>
          {!isCollapsed ? (
            <h1 className="text-2xl font-display text-primary tracking-tighter uppercase select-none">
              Threadline
            </h1>
          ) : (
            <h1 className="text-xl font-display text-primary tracking-tighter uppercase mx-auto select-none">
              TL
            </h1>
          )}
          <button
            onClick={toggleCollapse}
            className="hidden lg:flex w-8 h-8 items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant transition-colors"
          >
            <div className={cn("transition-transform duration-300", isCollapsed && "rotate-180")}>
              <ChevronLeft className="w-5 h-5" />
            </div>
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1.5 mt-4 overflow-y-auto scrollbar-hide">
          {visibleTopItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (window.innerWidth < 1024) close();
              }}
              className={cn(
                "flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 group relative border border-transparent",
                isActive(item.href)
                  ? "bg-primary text-on-primary shadow-sm font-bold"
                  : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
                isCollapsed && "justify-center px-0"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && (
                <span className="whitespace-nowrap font-black uppercase tracking-wider text-[10px]">
                  {item.name}
                </span>
              )}
            </Link>
          ))}

          {visibleGroups.length > 0 && (
            <div className="border-t-2 border-outline-variant/30 my-4" />
          )}

          {visibleGroups.map((group) => {
            const expanded = isCollapsed ? true : !!expandedGroups[group.id];
            return (
              <div key={group.id} className="space-y-1">
                {!isCollapsed && (
                  <button
                    onClick={() =>
                      setExpandedGroups((p) => ({ ...p, [group.id]: !p[group.id] }))
                    }
                    className="flex items-center justify-between w-full px-3 py-2 mt-3 select-none rounded-lg hover:bg-surface-container-high/40 transition-colors group/header"
                  >
                    <span className="flex items-center gap-2 text-[10px] font-black tracking-widest text-on-surface-variant opacity-60 group-hover/header:opacity-100 uppercase">
                      <span className="text-sm leading-none">{group.emoji}</span>
                      {group.name}
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 opacity-40 transition-transform",
                        expanded ? "rotate-0" : "-rotate-90"
                      )}
                    />
                  </button>
                )}
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        "overflow-hidden space-y-1",
                        !isCollapsed && "pl-3.5 mt-1 border-l border-outline-variant/30 ml-2"
                      )}
                    >
                      {group.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => {
                            if (window.innerWidth < 1024) close();
                          }}
                          className={cn(
                            "flex items-center gap-3 rounded-xl transition-all duration-200 group relative uppercase tracking-wider text-[10px] font-bold border border-transparent",
                            isCollapsed ? "justify-center py-3" : "px-3 py-2.5",
                            isActive(item.href)
                              ? "bg-primary text-on-primary shadow-sm"
                              : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                          )}
                        >
                          <item.icon className={cn("flex-shrink-0", isCollapsed ? "w-5 h-5" : "w-4 h-4")} />
                          {!isCollapsed && <span className="whitespace-nowrap">{item.name}</span>}
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t-2 border-outline space-y-2">
          {!isCollapsed && currentUser && (
            <div className="px-3 py-2 mb-1">
              <p className="text-[10px] font-black text-on-surface-variant opacity-60 uppercase tracking-widest truncate">
                {currentUser.role === "admin"
                  ? "Administrator"
                  : currentUser.role === "manager"
                    ? "Manager"
                    : "POS Seller"}
              </p>
              <p className="text-xs font-black text-on-surface truncate">
                {currentUser.name}
              </p>
            </div>
          )}
          <button
            onClick={() => logout()}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-error font-black uppercase tracking-wider hover:bg-error/10 transition-colors border-2 border-transparent hover:border-error",
              isCollapsed && "justify-center px-0"
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="text-[10px]">Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
