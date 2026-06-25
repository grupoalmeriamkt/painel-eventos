import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { GlobalFilters } from "@/components/shell/global-filters";
import { Panel, MetricCard, FunnelRow } from "@/components/dashboard/primitives";
import { getDashboardOverview } from "@/lib/queries/dashboard";
import { resolvePeriod } from "@/lib/period";
import { CATEGORY_LABELS } from "@/domain/categories";
import { formatBRL, formatInt, formatDateTimeBR } from "@/lib/format";
import type { StageCategory } from "@/lib/supabase/database.types";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

const FUNNEL: StageCategory[] = [
  "lead",
  "qualificacao",
  "atendimento",
  "proposta",
  "negociacao",
  "contrato",
  "fechado",
  "concluido",
];

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export default async function VisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const period = resolvePeriod({
    periodo: pick(sp.periodo),
    de: pick(sp.de),
    ate: pick(sp.ate),
  });
  const data = await getDashboardOverview(period);
  const c = data.consolidated;
  const snap = c.snapshot;
  const maxFunnel = Math.max(...FUNNEL.map((cat) => snap.byCategory[cat].value), 1);
  void MONTH_NAMES;
  const monthLabel = period.label;
  const dd = (cat: StageCategory) => `/leads?categoria=${cat}`;

  return (
    <AppShell
      title="Visão Geral"
      subtitle={`Consolidado Almeria + Izzi · atualizado ${formatDateTimeBR(data.generatedAt)}`}
      actions={
        <Link
          href="/leads"
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {formatInt(data.totalLeads)} leads
        </Link>
      }
    >
      <GlobalFilters showUnidade={false} />
      {/* Alertas de qualidade */}
      {(data.unresolvedUnitCount > 0 || data.dataQualityOpen > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-warning/30 bg-warning/5 px-4 py-2 text-xs text-warning">
          <AlertTriangle className="size-4" />
          {data.unresolvedUnitCount > 0 && (
            <span>
              <strong className="font-mono tabular-nums">{data.unresolvedUnitCount}</strong> leads sem
              unidade identificada
            </span>
          )}
          {data.dataQualityOpen > 0 && (
            <span>
              <strong className="font-mono tabular-nums">{data.dataQualityOpen}</strong> problemas de
              qualidade de dados em aberto
            </span>
          )}
        </div>
      )}

      {/* KPIs de entrada */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Leads hoje" value={c.leadsToday} kind="int" tone="info" />
        <MetricCard label="Leads na semana" value={c.leadsWeek} kind="int" />
        <MetricCard label="Leads no mês" value={c.leadsMonth} kind="int" />
        <MetricCard
          label="Pipeline ativo"
          value={snap.activePipelineValue}
          context="leads abertos no funil"
        />
        <MetricCard
          label="Total pipeline"
          value={snap.totalPipelineValue}
          tone="info"
          context="Proposta + Negociação + Contrato + Fechado"
        />
      </div>

      {/* Valores por estágio (estoque atual) */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Em negociação" value={snap.negotiationValue} href={dd("negociacao")} />
        <MetricCard label="Em contrato" value={snap.contractValue} href={dd("contrato")} />
        <MetricCard label="Fechado" value={snap.closedValue} tone="success" href={dd("fechado")} />
        <MetricCard label="Concluído" value={snap.completedValue} tone="success" href={dd("concluido")} />
        <MetricCard label="Reservas maiores" value={snap.reserveValue} href={dd("reserva_maior")} />
        <MetricCard label="Perdido (estoque)" value={snap.lostValue} tone="critical" href={dd("perdido")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Funil — estoque atual */}
        <Panel title="Pipeline por etapa" hint="estoque atual · qtd / valor">
          <div className="py-1">
            {FUNNEL.map((cat) => (
              <FunnelRow
                key={cat}
                label={CATEGORY_LABELS[cat]}
                count={snap.byCategory[cat].count}
                value={snap.byCategory[cat].value}
                max={maxFunnel}
                href={dd(cat)}
              />
            ))}
          </div>
        </Panel>

        {/* Movimentação do mês — fluxo */}
        <Panel title={`Movimentação em ${monthLabel}`} hint="fluxo · entrou no período">
          <div className="grid grid-cols-2 gap-px bg-border">
            {(
              [
                ["proposta", "Propostas emitidas", "info"],
                ["negociacao", "Entrou em negociação", "default"],
                ["contrato", "Entrou em contrato", "default"],
                ["fechado", "Fechamentos", "success"],
                ["concluido", "Concluídos", "success"],
                ["perdido", "Perdas", "critical"],
              ] as const
            ).map(([cat, label, tone]) => {
              const m = c.movement.entered[cat];
              const toneCls =
                tone === "success"
                  ? "text-success"
                  : tone === "critical"
                    ? "text-critical"
                    : tone === "info"
                      ? "text-info"
                      : "text-foreground";
              return (
                <div key={cat} className="bg-card px-4 py-3">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {label}
                  </div>
                  <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${toneCls}`}>
                    {formatBRL(m.value)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatInt(m.count)} {m.count === 1 ? "lead" : "leads"}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* Comparativo por unidade */}
      <Panel title="Comparativo por unidade" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Unidade</th>
                <th className="px-4 py-2 text-right font-medium">Leads/mês</th>
                <th className="px-4 py-2 text-right font-medium">Negociação</th>
                <th className="px-4 py-2 text-right font-medium">Contrato</th>
                <th className="px-4 py-2 text-right font-medium">Fechado</th>
                <th className="px-4 py-2 text-right font-medium">Total pipeline</th>
              </tr>
            </thead>
            <tbody>
              {data.byUnit.map((u) => (
                <tr key={u.unit.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/leads?unidade=${u.unit.slug}`}
                      className="inline-flex items-center gap-2 hover:text-info"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: u.unit.color }}
                      />
                      <span className="font-medium">{u.unit.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatInt(u.leadsMonth)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                    {formatBRL(u.snapshot.negotiationValue)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                    {formatBRL(u.snapshot.contractValue)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-success">
                    {formatBRL(u.snapshot.closedValue)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                    {formatBRL(u.snapshot.totalPipelineValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="mt-4 text-[11px] text-muted-foreground/60">
        Estoque = foto do funil agora. Fluxo = o que entrou no período. Pipeline não é receita
        realizada.
      </p>
    </AppShell>
  );
}
