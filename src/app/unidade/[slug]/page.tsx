import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { GlobalFilters } from "@/components/shell/global-filters";
import { Panel, MetricCard, FunnelRow } from "@/components/dashboard/primitives";
import { getDashboardOverview } from "@/lib/queries/dashboard";
import { resolvePeriod } from "@/lib/period";
import { CATEGORY_LABELS, FUNNEL_ORDER } from "@/domain/categories";
import { formatBRL, formatInt, formatDateTimeBR } from "@/lib/format";
import type { StageCategory } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function UnidadePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const period = resolvePeriod({
    periodo: pick(sp.periodo),
    de: pick(sp.de),
    ate: pick(sp.ate),
  });

  const data = await getDashboardOverview(period);
  const unitOverview = data.byUnit.find((u) => u.unit.slug === slug);
  if (!unitOverview) notFound();

  const { unit, snapshot: snap, movement } = unitOverview;
  const maxFunnel = Math.max(...FUNNEL_ORDER.map((cat) => snap.byCategory[cat].value), 1);

  // Drill-down: sempre inclui &unidade=<slug>.
  const dd = (cat: StageCategory) => `/leads?categoria=${cat}&unidade=${slug}`;

  return (
    <AppShell
      title={unit.name}
      subtitle={`${period.label} · atualizado ${formatDateTimeBR(data.generatedAt)}`}
      actions={
        <span
          className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: unit.color }} />
          {formatInt(unitOverview.leadsMonth)} leads no período
        </span>
      }
    >
      <GlobalFilters showUnidade={false} />

      {/* Faixa de identidade da unidade */}
      <div
        className="mb-4 flex items-center gap-3 rounded-md border border-border bg-card px-4 py-2.5"
        style={{ borderLeftWidth: 3, borderLeftColor: unit.color }}
      >
        <span className="size-2.5 rounded-full" style={{ backgroundColor: unit.color }} />
        <h2 className="font-mono text-[11px] uppercase tracking-wider" style={{ color: unit.color }}>
          {unit.name}
        </h2>
        <span className="text-[11px] text-muted-foreground/60">visão da unidade · {period.label}</span>
      </div>

      {/* KPIs de entrada */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Leads hoje" value={unitOverview.leadsToday} kind="int" tone="info" />
        <MetricCard label="Leads na semana" value={unitOverview.leadsWeek} kind="int" />
        <MetricCard label="Leads no mês" value={unitOverview.leadsMonth} kind="int" />
        <MetricCard
          label="Pipeline ativo"
          value={snap.activePipelineValue}
          context="leads abertos no funil"
        />
        <MetricCard
          label="Total pipeline"
          value={snap.totalPipelineValue}
          accent={unit.color}
          context="Proposta + Negociação + Contrato + Fechado"
        />
      </div>

      {/* Valores por estágio (estoque atual) */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Em negociação" value={snap.negotiationValue} href={dd("negociacao")} />
        <MetricCard label="Em contrato" value={snap.contractValue} href={dd("contrato")} />
        <MetricCard label="Fechado" value={snap.closedValue} tone="success" href={dd("fechado")} />
        <MetricCard
          label="Concluído"
          value={snap.completedValue}
          tone="success"
          href={dd("concluido")}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Funil — estoque atual */}
        <Panel title="Pipeline por etapa" hint="estoque atual · qtd / valor">
          <div className="py-1">
            {FUNNEL_ORDER.map((cat) => (
              <FunnelRow
                key={cat}
                label={CATEGORY_LABELS[cat]}
                count={snap.byCategory[cat].count}
                value={snap.byCategory[cat].value}
                max={maxFunnel}
                accent={unit.color}
                href={dd(cat)}
              />
            ))}
          </div>
        </Panel>

        {/* Movimentação no período — fluxo */}
        <Panel title={`Movimentação em ${period.label}`} hint="fluxo · entrou no período">
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
              const m = movement.entered[cat];
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

      <p className="mt-4 text-[11px] text-muted-foreground/60">
        Estoque = foto do funil agora. Fluxo = o que entrou no período. Pipeline não é receita
        realizada.
      </p>
    </AppShell>
  );
}
