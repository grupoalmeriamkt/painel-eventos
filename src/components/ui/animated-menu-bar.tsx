"use client";

import React from "react";
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
 * Botão de ícone com label que expande no hover (desktop) ou no item ativo,
 * e tooltip no toque (mobile). Adaptado ao tema Palantir (command center).
 * Base: componente "animated-menu-bar" fornecido.
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
        "relative flex items-center justify-center overflow-visible rounded-md border transition-colors duration-300 focus:outline-none",
        "min-h-11 min-w-11 px-0 py-2 sm:px-3",
        active
          ? "border-primary/40 bg-primary/10 font-medium text-primary"
          : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {/* tooltip mobile */}
      <span
        className={cn(
          "pointer-events-none absolute -top-7 left-1/2 z-20 -translate-x-1/2 rounded-sm bg-foreground px-2 py-1 text-xs text-background shadow transition-opacity duration-200 sm:hidden",
          showTooltip ? "opacity-100" : "opacity-0",
        )}
      >
        {label}
      </span>
      <span className="flex size-11 items-center justify-center">
        <Icon className="size-5" strokeWidth={1.6} />
      </span>
      <span
        className={cn(
          "pointer-events-none whitespace-nowrap text-sm transition-all duration-300",
          isExpanded ? "ml-1 w-auto opacity-100" : "w-0 opacity-0",
          "hidden sm:inline",
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
    <nav
      className={cn(
        "flex w-fit items-center gap-1 rounded-2xl border border-border bg-card/95 p-1.5 backdrop-blur transition-all duration-300",
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
  );
}
