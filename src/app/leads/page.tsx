import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/dashboard/primitives";
import { getLeads } from "@/lib/queries/leads";
import { serverEnv } from "@/lib/env";
import { CATEGORY_LABELS, STAGE_CATEGORIES } from "@/domain/categories";
import { formatBRL, formatDateBR, formatDateTimeBR } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const unidade = str(sp.unidade) ?? "all";
  const categoria = str(sp.categoria) ?? "all";
  const q = str(sp.q) ?? "";
  const page = Number(str(sp.page) ?? "1") || 1;

  const { rows, total, pageSize, units } = await getLeads({ unidade, categoria, q, page });
  const subdomain = serverEnv().KOMMO_SUBDOMAIN ?? "";
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const hrefWith = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string> = { unidade, categoria, q, ...patch } as Record<string, string>;
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all" && v !== "") params.set(k, v);
    const s = params.toString();
    return `/leads${s ? `?${s}` : ""}`;
  };

  const chips: { key: string; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "none", label: "Sem unidade" },
    ...units.map((u) => ({ key: u.slug, label: u.name })),
  ];

  return (
    <AppShell
      title="Leads"
      subtitle="Pesquise, filtre e abra no Kommo · ideal para preencher a unidade em massa"
      actions={
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {total.toLocaleString("pt-BR")} resultados
        </span>
      }
    >
      {/* Filtros */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Unidade
          </span>
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={hrefWith({ unidade: chip.key, page: undefined })}
              className={cn(
                "rounded-sm border px-2.5 py-1 text-xs transition-colors",
                unidade === chip.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
              )}
            >
              {chip.label}
            </Link>
          ))}
        </div>

        <form method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="unidade" value={unidade} />
          <div className="flex items-center gap-2 rounded-sm border border-border bg-card px-2.5">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nome do lead…"
              className="w-56 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          <select
            name="categoria"
            defaultValue={categoria}
            className="rounded-sm border border-border bg-card px-2 py-1.5 text-sm outline-none"
          >
            <option value="all">Todas as etapas</option>
            {STAGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-sm border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm text-primary hover:bg-primary/15"
          >
            Filtrar
          </button>
          {(q || categoria !== "all") && (
            <Link href={hrefWith({ q: "", categoria: "all" })} className="text-xs text-muted-foreground hover:text-foreground">
              limpar
            </Link>
          )}
        </form>
      </div>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">Lead</th>
                <th className="px-3 py-2 font-medium">Etapa</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2 font-medium">Data evento</th>
                <th className="px-3 py-2 font-medium">Unidade</th>
                <th className="px-3 py-2 font-medium">Origem</th>
                <th className="px-3 py-2 font-medium">Atualizado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                    Nenhum lead com esses filtros.
                  </td>
                </tr>
              )}
              {rows.map((l) => (
                <tr key={l.id} className="border-b border-border/40 last:border-0 hover:bg-accent/40">
                  <td className="max-w-[260px] truncate px-3 py-2">{l.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {l.stage_category ? CATEGORY_LABELS[l.stage_category] : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatBRL(l.current_value)}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">
                    {formatDateBR(l.event_date)}
                  </td>
                  <td className="px-3 py-2">
                    {l.unit_name ? (
                      l.unit_name
                    ) : (
                      <span className="text-warning">sem unidade</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{l.lead_source ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatDateTimeBR(l.updated_at_kommo)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <a
                      href={`https://${subdomain}.kommo.com/leads/detail/${l.kommo_lead_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-info hover:underline"
                    >
                      Kommo <ExternalLink className="size-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Paginação */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Página {page} de {totalPages} · {total.toLocaleString("pt-BR")} leads
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={hrefWith({ page: String(page - 1) })} className="rounded-sm border border-border px-3 py-1 hover:text-foreground">
              ← Anterior
            </Link>
          )}
          {page < totalPages && (
            <Link href={hrefWith({ page: String(page + 1) })} className="rounded-sm border border-border px-3 py-1 hover:text-foreground">
              Próxima →
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
