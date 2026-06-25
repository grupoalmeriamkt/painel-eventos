import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL, formatInt } from "@/lib/format";

/** Painel de superfície com cabeçalho em caixa-alta (estilo command center). */
export function Panel({
  title,
  hint,
  actions,
  className,
  children,
}: {
  title?: string;
  hint?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-md border border-border bg-card", className)}>
      {(title || actions) && (
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          {title && (
            <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {title}
            </h2>
          )}
          {hint && <span className="text-[11px] text-muted-foreground/60">{hint}</span>}
          {actions && <div className="ml-auto">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

const TONE: Record<string, string> = {
  default: "text-foreground",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  critical: "text-critical",
  muted: "text-muted-foreground",
};

/** Card de métrica: valor grande monoespaçado + label em caixa-alta + contexto. */
export function MetricCard({
  label,
  value,
  kind = "money",
  tone = "default",
  context,
  accent,
  href,
}: {
  label: string;
  value: number | null;
  kind?: "money" | "int";
  tone?: keyof typeof TONE;
  context?: string;
  accent?: string;
  href?: string;
}) {
  const formatted = kind === "money" ? formatBRL(value) : formatInt(value);
  const inner = (
    <>
      {accent && (
        <span
          className="absolute inset-y-0 left-0 w-0.5"
          style={{ backgroundColor: accent }}
          aria-hidden
        />
      )}
      <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
        {href && (
          <ArrowUpRight className="ml-auto size-3 opacity-0 transition-opacity group-hover:opacity-60" />
        )}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-2xl font-semibold tabular-nums tracking-tight",
          TONE[tone],
        )}
      >
        {formatted}
      </div>
      {context && <div className="mt-0.5 text-[11px] text-muted-foreground">{context}</div>}
    </>
  );
  const cls =
    "group relative block overflow-hidden rounded-md border border-border bg-card px-4 py-3";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-muted-foreground/40")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Barra de funil por categoria (qtd + valor). */
export function FunnelRow({
  label,
  count,
  value,
  max,
  accent = "var(--color-info)",
  href,
}: {
  label: string;
  count: number;
  value: number;
  max: number;
  accent?: string;
  href?: string;
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  const Row = (
    <div className="flex items-center gap-3 px-4 py-1.5">
      <div className="w-28 shrink-0 text-xs text-muted-foreground">{label}</div>
      <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-secondary/40">
        <div
          className="absolute inset-y-0 left-0 rounded-sm opacity-30"
          style={{ width: `${pct}%`, backgroundColor: accent }}
        />
        <div className="absolute inset-0 flex items-center justify-between px-2">
          <span className="font-mono text-[11px] tabular-nums text-foreground">
            {formatInt(count)}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatBRL(value)}
          </span>
        </div>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-colors hover:bg-accent/40">
      {Row}
    </Link>
  ) : (
    Row
  );
}
