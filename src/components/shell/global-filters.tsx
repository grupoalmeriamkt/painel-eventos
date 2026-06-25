"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { PeriodPreset } from "@/lib/period";

const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
  { key: "ano", label: "Ano" },
  { key: "tudo", label: "Tudo" },
];

export function GlobalFilters({
  units,
  showUnidade = true,
}: {
  units?: { slug: string; name: string }[];
  showUnidade?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const periodo = (sp.get("periodo") as PeriodPreset) || "mes";
  const unidade = sp.get("unidade") || "all";
  const de = sp.get("de") || "";
  const ate = sp.get("ate") || "";

  const update = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-md border border-border bg-card/50 p-2 sm:flex-row sm:flex-wrap sm:items-center">
      {showUnidade && units && units.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto">
          <span className="mr-1 hidden font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70 sm:inline">
            Unidade
          </span>
          {[{ slug: "all", name: "Todas" }, ...units].map((u) => (
            <button
              key={u.slug}
              onClick={() => update({ unidade: u.slug === "all" ? null : u.slug })}
              className={cn(
                "shrink-0 rounded-sm border px-2.5 py-1 text-xs transition-colors",
                unidade === u.slug || (u.slug === "all" && unidade === "all")
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {u.name}
            </button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" />
        </div>
      )}

      <div className="flex items-center gap-1 overflow-x-auto">
        <span className="mr-1 hidden font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70 sm:inline">
          Período
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => update({ periodo: p.key, de: null, ate: null })}
            className={cn(
              "shrink-0 rounded-sm border px-2.5 py-1 text-xs transition-colors",
              periodo === p.key
                ? "border-info/40 bg-info/10 text-info"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 sm:ml-auto">
        <input
          type="date"
          defaultValue={de}
          onChange={(e) => e.target.value && update({ periodo: "custom", de: e.target.value, ate: ate || e.target.value })}
          className="rounded-sm border border-border bg-card px-2 py-1 text-xs outline-none [color-scheme:dark]"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <input
          type="date"
          defaultValue={ate}
          onChange={(e) => e.target.value && update({ periodo: "custom", de: de || e.target.value, ate: e.target.value })}
          className="rounded-sm border border-border bg-card px-2 py-1 text-xs outline-none [color-scheme:dark]"
        />
      </div>
    </div>
  );
}
