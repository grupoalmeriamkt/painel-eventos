"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  CalendarHeart,
  Users,
  AlertTriangle,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "@/lib/nav";
import { MenuBar, type MenuBarItem } from "@/components/ui/animated-menu-bar";

// Itens da barra inferior (mobile / iOS tab bar)
const MOBILE_TABS: (MenuBarItem & { href?: string })[] = [
  { key: "/", label: "Geral", icon: LayoutDashboard, href: "/" },
  { key: "/agenda", label: "Agenda", icon: CalendarHeart, href: "/agenda" },
  { key: "/leads", label: "Leads", icon: Users, href: "/leads" },
  { key: "/alertas", label: "Alertas", icon: AlertTriangle, href: "/alertas" },
  { key: "__more", label: "Mais", icon: MoreHorizontal },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title} className="mb-4">
          <div className="px-2 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {section.title}
          </div>
          {section.items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            const inner = (
              <>
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {!item.ready && (
                  <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50">
                    breve
                  </span>
                )}
              </>
            );
            const base = "flex items-center gap-2.5 rounded-sm px-2 py-2 text-sm transition-colors";
            return item.ready ? (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  base,
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {inner}
              </Link>
            ) : (
              <div key={item.href} className={cn(base, "cursor-not-allowed text-muted-foreground/40")}>
                {inner}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/almeria-logo.png"
        alt="Almeria"
        width={120}
        height={55}
        priority
        className="h-7 w-auto object-contain"
      />
      <div className="border-l border-border pl-2.5 font-mono text-[10px] uppercase leading-tight tracking-wider text-muted-foreground">
        Painel
        <br />
        Eventos
      </div>
    </div>
  );
}

export function AppShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = MOBILE_TABS.find((t) => t.href === pathname)?.key;

  // trava o scroll do body quando o drawer está aberto
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex min-h-[100dvh]">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Brand />
        </div>
        <NavList />
        <div className="border-t border-border px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
          America/Sao_Paulo
        </div>
      </aside>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-sidebar pt-[env(safe-area-inset-top)]">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Brand />
              <button
                onClick={() => setOpen(false)}
                className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Fechar menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 pt-[env(safe-area-inset-top)] sm:px-5">
          <button
            onClick={() => setOpen(true)}
            className="-ml-1 rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">{title}</h1>
            {subtitle && <p className="hidden truncate text-xs text-muted-foreground sm:block">{subtitle}</p>}
          </div>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
        <main className="flex-1 overflow-x-hidden p-3 pb-24 sm:p-5 lg:pb-5">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      {/* Barra inferior animada (mobile / iOS tab bar) */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 lg:hidden">
        <MenuBar
          items={MOBILE_TABS}
          active={activeTab}
          onSelect={(key) => {
            if (key === "__more") {
              setOpen(true);
              return;
            }
            const tab = MOBILE_TABS.find((t) => t.key === key);
            if (tab?.href) router.push(tab.href);
          }}
          className="shadow-lg shadow-black/40"
        />
      </div>
    </div>
  );
}
