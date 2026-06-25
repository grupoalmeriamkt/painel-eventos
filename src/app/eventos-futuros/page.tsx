import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/dashboard/primitives";
import { getFutureEvents } from "@/lib/queries/future-events";
import { serverEnv } from "@/lib/env";
import { CATEGORY_LABELS } from "@/domain/categories";
import { formatBRL, formatDateBR, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

const WINDOWS = [
  { key: "7", label: "7 dias" },
  { key: "15", label: "15 dias" },
  { key: "30", label: "30 dias" },
  { key: "mes", label: "Este mês" },
  { key: "2027", label: "2027" },
  { key: "all", label: "Todos" },
];

export default async function EventosFuturosPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const janela = pick(sp.janela) ?? "all";
  const unidade = pick(sp.unidade) ?? "all";
  const semContrato = pick(sp.semContrato) === "1";

  const { rows, total, units } = await getFutureEvents({ janela, unidade, semContrato });
  const subdomain = serverEnv().KOMMO_SUBDOMAIN ?? "";

  const href = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | null> = { janela, unidade, semContrato: semContrato ? "1" : null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all") params.set(k, v);
    const s = params.toString();
    return `/eventos-futuros${s ? `?${s}` : ""}`;
  };

  return (
    <AppShell
      title="Eventos Futuros"
      subtitle="Agenda de eventos a partir de hoje · risco operacional e financeiro"
      actions={
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {formatInt(total)} eventos
        </span>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {WINDOWS.map((w) => (
          <Link
            key={w.key}
            href={href({ janela: w.key })}
            className={cn(
              "rounded-sm border px-2.5 py-1 text-xs transition-colors",
              janela === w.key
                ? "border-info/40 bg-info/10 text-info"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {w.label}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        {[{ slug: "all", name: "Todas" }, ...units, { slug: "none", name: "Sem unidade" }].map((u) => (
          <Link
            key={u.slug}
            href={href({ unidade: u.slug })}
            className={cn(
              "rounded-sm border px-2.5 py-1 text-xs transition-colors",
              unidade === u.slug
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {u.name}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <Link
          href={href({ semContrato: semContrato ? null : "1" })}
          className={cn(
            "rounded-sm border px-2.5 py-1 text-xs transition-colors",
            semContrato
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Sem contrato
        </Link>
      </div>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 text-right font-medium">Dias</th>
                <th className="px-3 py-2 font-medium">Lead</th>
                <th className="px-3 py-2 font-medium">Unidade</th>
                <th className="px-3 py-2 text-right font-medium">Conv.</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Espaço</th>
                <th className="px-3 py-2 font-medium">Etapa</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                    Nenhum evento futuro com esses filtros.
                  </td>
                </tr>
              )}
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-border/40 last:border-0 hover:bg-accent/40">
                  <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums">
                    {formatDateBR(e.event_date)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        e.daysUntil <= 15 ? "text-warning" : "text-muted-foreground",
                      )}
                    >
                      {e.daysUntil}d
                    </span>
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2">{e.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {e.unit_name ?? <span className="text-warning">sem unidade</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {e.guest_count ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{e.event_type ?? "—"}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-muted-foreground">
                    {e.event_space ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {e.stage_category ? CATEGORY_LABELS[e.stage_category] : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatBRL(e.current_value)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <a
                      href={`https://${subdomain}.kommo.com/leads/detail/${e.kommo_lead_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-info hover:underline"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}
