"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  LayoutDashboard,
  ShoppingCart,
  Package,
  UtensilsCrossed,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronDown,
  ChefHat,
  Landmark,
  Receipt,
  FileText,
  Activity,
  Shield,
  Bell,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type MenuItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  allowedRoles?: UserRole[]; // undefined = all roles
};

type MenuGroup = {
  id: string;
  name: string;
  emoji: string;
  items: MenuItem[];
};

// Dashboard, POS, and Caixa are top-level items outside any collapsible group
const topMenuItems: MenuItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    allowedRoles: ["admin", "manager"],
  },
  { name: "POS", href: "/pos", icon: ShoppingCart },
  { name: "Active Orders", href: "/active-orders", icon: Bell },
  { name: "Caixa", href: "/caixa", icon: Landmark },
];

const menuGroups: MenuGroup[] = [
  {
    id: "sales_finance",
    name: "Sales & Finance",
    emoji: "📊",
    items: [
      {
        name: "Sales",
        href: "/sales",
        icon: Receipt,
        allowedRoles: ["admin", "manager"],
      },
      {
        name: "Caixa Reports",
        href: "/caixa/reports",
        icon: FileText,
        allowedRoles: ["admin", "manager"],
      },
      {
        name: "Clients",
        href: "/clients",
        icon: Users,
        allowedRoles: ["admin", "manager"],
      },
    ],
  },
  {
    id: "production_menu",
    name: "Production & Menu",
    emoji: "🍳",
    items: [
      {
        name: "Dishes",
        href: "/dishes",
        icon: UtensilsCrossed,
        allowedRoles: ["admin", "manager"],
      },
      {
        name: "Production",
        href: "/kitchen",
        icon: ChefHat,
        allowedRoles: ["admin", "manager"],
      },
    ],
  },
  {
    id: "inventory_management",
    name: "Inventory Management",
    emoji: "📦",
    items: [
      {
        name: "Inventory",
        href: "/inventory",
        icon: Package,
        allowedRoles: ["admin", "manager"],
      },
      {
        name: "Stock Overview",
        href: "/stock-overview",
        icon: Activity,
        allowedRoles: ["admin", "manager"],
      },
      {
        name: "Suppliers",
        href: "/suppliers",
        icon: Truck,
        allowedRoles: ["admin", "manager"],
      },
      {
        name: "Purchase Orders",
        href: "/purchase-orders",
        icon: FileText,
        allowedRoles: ["admin", "manager"],
      },
    ],
  },
  {
    id: "administration",
    name: "Administration",
    emoji: "⚙️",
    items: [
      {
        name: "Users",
        href: "/users",
        icon: Shield,
        allowedRoles: ["admin", "manager"],
      },
      {
        name: "Settings",
        href: "/settings",
        icon: Settings,
        allowedRoles: ["admin", "manager"],
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleCollapse, isOpen, close } = useSidebar();
  const { currentUser, logout } = useAuth();

  // Track which groups are expanded/collapsed (initially all collapsed)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Active Orders subscription & shake notification state
  const activeOrders = useQuery(api.orders.listActiveOrders);
  const [isBellShaking, setIsBellShaking] = useState(false);
  const [prevActiveCount, setPrevActiveCount] = useState<number | null>(null);

  useEffect(() => {
    if (activeOrders === undefined) return;
    const currentCount = activeOrders.length;
    if (prevActiveCount !== null && currentCount > prevActiveCount) {
      setIsBellShaking(true);
      const timer = setTimeout(() => setIsBellShaking(false), 600);
      return () => clearTimeout(timer);
    }
    setPrevActiveCount(currentCount);
  }, [activeOrders, prevActiveCount]);

  // Auto-expand the group containing the active page when pathname changes
  useEffect(() => {
    const activeGroup = menuGroups.find((group) =>
      group.items.some(
        (item) =>
          pathname === item.href ||
          (item.href !== "/caixa" && pathname.startsWith(item.href + "/"))
      )
    );
    if (activeGroup) {
      setExpandedGroups((prev) => ({
        ...prev,
        [activeGroup.id]: true,
      }));
    }
  }, [pathname]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // Filter top-level items based on role
  const visibleTopItems = topMenuItems.filter((item) => {
    if (!item.allowedRoles) return true;
    if (!currentUser) return false;
    return item.allowedRoles.includes(currentUser.role);
  });

  // Filter groups and items based on role
  const visibleGroups = menuGroups
    .map((group) => {
      const visibleItems = group.items.filter((item) => {
        if (!item.allowedRoles) return true;
        if (!currentUser) return false;
        return item.allowedRoles.includes(currentUser.role);
      });
      return {
        ...group,
        items: visibleItems,
      };
    })
    .filter((group) => group.items.length > 0);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={close}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 bg-surface border-r-4 border-outline flex flex-col adaptive-transition lg:static shadow-2xl lg:shadow-none",
          isCollapsed ? "w-20" : "w-[280px] sm:w-64",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className={cn("p-6 flex items-center justify-between", isCollapsed && "px-4")}>
          {!isCollapsed && (
            <h1 className="text-2xl font-display text-primary tracking-tighter uppercase select-none">
              Take Away
            </h1>
          )}
          {isCollapsed && (
            <h1 className="text-xl font-display text-primary tracking-tighter uppercase mx-auto select-none">
              TA
            </h1>
          )}

          <button
            onClick={toggleCollapse}
            className="hidden lg:flex w-8 h-8 items-center justify-center rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors border border-transparent hover:border-outline"
          >
            <div className={cn("transition-transform duration-300", isCollapsed && "rotate-180")}>
              <ChevronLeft className="w-5 h-5" />
            </div>
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-8 overflow-y-auto scrollbar-hide">
          {/* Top Level Menu Items (Dashboard, POS, Caixa) */}
          {visibleTopItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/caixa" && pathname.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (window.innerWidth < 1024) close();
                }}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group relative border-2 border-transparent",
                  isActive
                    ? "bg-primary text-on-primary border-outline shadow-hard animate-pulse-subtle"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface hover:border-outline",
                  isCollapsed && "justify-center px-0"
                )}
              >
                <item.icon
                  className={cn(
                    "w-5 h-5 flex-shrink-0",
                    isActive ? "text-on-primary" : "text-on-surface-variant group-hover:text-primary",
                    item.name === "Active Orders" && isBellShaking && "animate-shake"
                  )}
                />
                {!isCollapsed && (
                  <span className="whitespace-nowrap font-black uppercase tracking-wider text-[10px]">
                    {item.name}
                  </span>
                )}

                {item.name === "Active Orders" && activeOrders && activeOrders.length > 0 && !isCollapsed && (
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[8px] font-black tracking-tighter uppercase border ml-2 transition-all",
                    isActive 
                      ? "bg-surface text-on-surface border-outline" 
                      : "bg-primary/10 text-primary border-primary/20"
                  )}>
                    {activeOrders.length}
                  </span>
                )}

                {isCollapsed && item.name === "Active Orders" && activeOrders && activeOrders.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-error rounded-full border border-surface shadow-hard-sm" />
                )}

                {isActive && !isCollapsed && (
                  <div className="ml-auto w-2 h-2 bg-surface border border-outline rounded-full" />
                )}

                {isCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-surface-container-highest text-on-surface text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap shadow-hard border border-outline font-black uppercase tracking-wider">
                    {item.name}
                  </div>
                )}
              </Link>
            );
          })}

          {/* Separator between Top Items and Collapsible Groups */}
          {visibleGroups.length > 0 && (
            <div className="border-t-2 border-outline-variant/30 my-4" />
          )}

          {/* Collapsible Groups or Flat Icons if Collapsed */}
          {isCollapsed ? (
            visibleGroups.map((group, groupIdx) => (
              <div key={group.id} className="space-y-1">
                {groupIdx > 0 && <div className="border-t-2 border-outline-variant/30 my-2" />}
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/caixa" && pathname.startsWith(item.href + "/"));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        if (window.innerWidth < 1024) close();
                      }}
                      className={cn(
                        "flex items-center justify-center w-full py-3 rounded-lg transition-all duration-200 group relative border-2 border-transparent",
                        isActive
                          ? "bg-primary text-on-primary border-outline shadow-hard"
                          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface hover:border-outline"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "w-5 h-5 flex-shrink-0",
                          isActive ? "text-on-primary" : "text-on-surface-variant group-hover:text-primary"
                        )}
                      />
                      <div className="absolute left-full ml-2 px-2 py-1 bg-surface-container-highest text-on-surface text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap shadow-hard border border-outline font-black uppercase tracking-wider">
                        {item.name}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ))
          ) : (
            visibleGroups.map((group) => {
              const isExpanded = !!expandedGroups[group.id];
              return (
                <div key={group.id} className="space-y-1">
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="flex items-center justify-between w-full px-3 py-2 mt-4 select-none cursor-pointer rounded-lg hover:bg-surface-container-high/40 transition-colors group/header"
                  >
                    <span className="flex items-center gap-2 text-[10px] font-black tracking-widest text-on-surface-variant opacity-60 group-hover/header:opacity-100 transition-opacity uppercase">
                      <span className="text-sm leading-none">{group.emoji}</span>
                      <span>{group.name}</span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 text-on-surface-variant opacity-40 group-hover/header:opacity-80 transition-transform duration-200",
                        isExpanded ? "rotate-0" : "-rotate-90"
                      )}
                    />
                  </button>

                  {/* Group Items with Framer Motion slide height */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden space-y-1 pl-3.5 mt-1 border-l border-outline-variant/30 ml-2"
                      >
                        {group.items.map((item) => {
                          const isActive =
                            pathname === item.href ||
                            (item.href !== "/caixa" && pathname.startsWith(item.href + "/"));
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => {
                                if (window.innerWidth < 1024) close();
                              }}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative uppercase tracking-wider text-[10px] font-black border-2 border-transparent",
                                isActive
                                  ? "bg-primary text-on-primary border-outline shadow-hard animate-pulse-subtle"
                                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface hover:border-outline"
                              )}
                            >
                              <item.icon
                                className={cn(
                                  "w-4 h-4 flex-shrink-0",
                                  isActive ? "text-on-primary" : "text-on-surface-variant group-hover:text-primary"
                                )}
                              />
                              <span className="whitespace-nowrap">{item.name}</span>

                              {isActive && (
                                <div className="ml-auto w-2 h-2 bg-surface border border-outline rounded-full" />
                              )}
                            </Link>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
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
              <p className="text-xs font-black text-on-surface truncate">{currentUser.name}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-error font-black uppercase tracking-wider hover:bg-error/10 transition-colors border-2 border-transparent hover:border-error",
              isCollapsed && "justify-center px-0"
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="text-[10px]">Sign Out</span>}
            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-surface-container-highest text-on-surface text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap shadow-hard border border-outline">
                Sign Out
              </div>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
