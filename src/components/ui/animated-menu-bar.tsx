"use client";

import React from "react";
import { motion, LayoutGroup } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MenuBarItem {
  key: string;
  label: string;
  icon: LucideIcon;
}

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

/**
 * Botão de ícone com label que expande no item ativo (e no hover, desktop),
 * com indicador deslizante (framer-motion layoutId) e tooltip no toque (mobile).
 * Tema Palantir (command center). Base: componente "animated-menu-bar" fornecido.
 */
const IconButton: React.FC<IconButtonProps> = ({ icon: Icon, label, active, onClick }) => {
  const [hovered, setHovered] = React.useState(false);
  const [showTooltip, setShowTooltip] = React.useState(false);
  const tooltipTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const isExpanded = hovered || active;

  const handleClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setShowTooltip(true);
      if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
      tooltipTimeout.current = setTimeout(() => setShowTooltip(false), 1200);
    }
    onClick?.();
  };

  React.useEffect(
    () => () => {
      if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    },
    [],
  );

  return (
    <button
      type="button"
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      className={cn(
        "relative flex min-h-11 min-w-11 items-center justify-center overflow-visible rounded-md px-0 py-2 transition-colors duration-200 focus:outline-none sm:px-3",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="menubar-active"
          className="absolute inset-0 rounded-md border border-primary/40 bg-primary/10"
          transition={{ type: "spring", stiffness: 500, damping: 36 }}
        />
      )}
      {/* tooltip mobile */}
      <span
        className={cn(
          "pointer-events-none absolute -top-7 left-1/2 z-20 -translate-x-1/2 rounded-sm bg-foreground px-2 py-1 text-xs text-background shadow transition-opacity duration-200 sm:hidden",
          showTooltip ? "opacity-100" : "opacity-0",
        )}
      >
        {label}
      </span>
      <span className="relative z-10 flex size-11 items-center justify-center">
        <motion.span
          animate={{ scale: active ? 1.08 : 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="flex items-center justify-center"
        >
          <Icon className="size-5" strokeWidth={1.6} />
        </motion.span>
      </span>
      <span
        className={cn(
          "relative z-10 hidden whitespace-nowrap text-sm font-medium transition-all duration-300 sm:inline",
          isExpanded ? "ml-1 w-auto opacity-100" : "w-0 opacity-0",
        )}
      >
        {label}
      </span>
    </button>
  );
};

export function MenuBar({
  items,
  active,
  onSelect,
  className,
}: {
  items: MenuBarItem[];
  active?: string;
  onSelect?: (key: string) => void;
  className?: string;
}) {
  return (
    <LayoutGroup>
      <nav
        className={cn(
          "flex w-fit items-center gap-1 rounded-2xl border border-border bg-card/95 p-1.5 backdrop-blur",
          className,
        )}
      >
        {items.map((item) => (
          <IconButton
            key={item.key}
            icon={item.icon}
            label={item.label}
            active={active === item.key}
            onClick={() => onSelect?.(item.key)}
          />
        ))}
      </nav>
    </LayoutGroup>
  );
}
