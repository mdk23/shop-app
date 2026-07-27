"use client";

import { Sidebar } from "./Sidebar";
import { Clock } from "./Clock";
import { SidebarProvider, useSidebar } from "./SidebarContext";
import { Menu, ChevronDown, LogOut, User } from "lucide-react";

import { BranchSelector } from "./BranchSelector";
import { ThemeSelector } from "./ThemeSelector";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useRef, useEffect } from "react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  pos_seller: "POS Seller",
};

function UserProfileMenu() {
  const { currentUser, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!currentUser) return null;

  const initials = currentUser.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 lg:gap-3 group"
        id="user-profile-menu-btn"
      >
        <div className="text-right hidden sm:block">
          <p className="text-[10px] font-black text-on-surface uppercase tracking-[0.2em] leading-tight">
            {currentUser.name}
          </p>
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter opacity-60">
            {ROLE_LABELS[currentUser.role] ?? currentUser.role}
          </p>
        </div>
        <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-2xl bg-primary border border-outline/30 shadow-md flex items-center justify-center text-on-primary font-display text-base lg:text-lg select-none">
          {initials}
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-on-surface-variant hidden sm:block transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-surface border border-outline/40 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-outline/30 bg-surface-container-low">
            <p className="text-xs font-black text-on-surface truncate">{currentUser.name}</p>
            <p className="text-[10px] font-bold text-on-surface-variant opacity-60 truncate">
              @{currentUser.username}
            </p>
            <span className="inline-block mt-1 px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">
              {ROLE_LABELS[currentUser.role]}
            </span>
          </div>
          <div className="p-2">
            <button
              onClick={async () => {
                setOpen(false);
                await logout();
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-error hover:bg-error/10 transition-colors text-xs font-black uppercase tracking-widest"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LayoutContent({
  children,
  isFullWidth,
  headerActions,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  isFullWidth?: boolean;
  headerActions?: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const { toggleOpen } = useSidebar();

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        <header className="h-16 lg:h-20 bg-surface/90 backdrop-blur-md border-b border-outline/30 px-4 lg:px-8 flex items-center justify-between z-50 sticky top-0 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleOpen}
              className="lg:hidden p-2 rounded-xl bg-surface-container-low text-on-surface hover:bg-primary hover:text-on-primary transition-all border border-outline/40 shadow-sm"
            >
              <Menu className="w-6 h-6" />
            </button>
            {title && (
              <div className="flex flex-col justify-center min-w-0">
                <h2 className="text-lg lg:text-2xl font-display text-on-surface truncate uppercase tracking-tighter leading-tight">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-[9px] lg:text-[11px] text-on-surface-variant font-bold uppercase tracking-widest opacity-60 truncate leading-none mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 lg:gap-6">
            {headerActions && (
              <div className="flex items-center gap-2">
                {headerActions}
              </div>
            )}
            <BranchSelector />
            <ThemeSelector />
            <div className="hidden sm:block">
              <Clock />
            </div>

            <div className="hidden sm:block h-12 w-[2px] bg-outline opacity-20" />
            <UserProfileMenu />
          </div>
        </header>

        <div
          className={cn(
            "flex-1 overflow-y-auto",
            isFullWidth ? "p-2 lg:p-4" : "p-4 lg:p-8"
          )}
        >
          <div
            className={cn(
              "mx-auto w-full",
              isFullWidth ? "max-w-none" : "max-w-7xl"
            )}
          >
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export function PageLayout({
  children,
  isFullWidth,
  headerActions,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  isFullWidth?: boolean;
  headerActions?: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  return (
    <SidebarProvider>
      <LayoutContent isFullWidth={isFullWidth} headerActions={headerActions} title={title} subtitle={subtitle}>
        {children}
      </LayoutContent>
    </SidebarProvider>
  );
}
