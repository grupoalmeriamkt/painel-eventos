import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Panel, FunnelRow } from "@/components/dashboard/primitives";
import { getPipelineAnalysis } from "@/lib/queries/pipeline";
import { CATEGORY_LABELS } from "@/domain/categories";
import { formatBRL, formatInt, formatPercent, formatDateTimeBR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const data = await getPipelineAnalysis();
  const maxFunnel = Math.max(...data.stages.map((s) => s.value), 1);
  const dd = (cat: string) => `/leads?categoria=${cat}`;

  return (
    <AppShell
      title="Pipeline Comercial"
      subtitle={`Estoque atual por etapa do funil · conversão e ticket · atualizado ${formatDateTimeBR(
        data.generatedAt,
      )}`}
    >
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Funil visual — estoque atual por etapa */}
        <Panel title="Funil comercial" hint="estoque atual · qtd / valor">
          <div className="py-1">
            {data.stages.map((s) => (
              <FunnelRow
                key={s.category}
                label={CATEGORY_LABELS[s.category]}
                count={s.count}
                value={s.value}
                max={maxFunnel}
                href={dd(s.category)}
              />
            ))}
          </div>
        </Panel>

        {/* Tabela densa — métricas por etapa */}
        <Panel title="Métricas por etapa" hint="conversão a partir da etapa anterior">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Etapa</th>
                  <th className="px-3 py-2 text-right font-medium">Qtd</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 text-right font-medium">Ticket</th>
                  <th className="px-3 py-2 text-right font-medium">Conv.</th>
                  <th className="px-3 py-2 text-right font-medium">Dias/etapa</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.stages.map((s) => (
                  <tr
                    key={s.category}
                    className="border-b border-border/40 last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-3 py-2.5">
                      <Link href={dd(s.category)} className="hover:text-info">
                        {CATEGORY_LABELS[s.category]}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatInt(s.count)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatBRL(s.value)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {formatBRL(s.ticketMedio)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-info">
                      {formatPercent(s.conversion)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {s.avgDaysInStage !== null
                        ? `${s.avgDaysInStage.toFixed(1).replace(".", ",")}d`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link href={dd(s.category)} className="inline-flex text-info hover:underline">
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground/60">
        Estoque = foto do funil agora. Conversão = qtd da etapa ÷ qtd da etapa anterior no funil.
        Dias/etapa = média do tempo entre entrar e sair da etapa no histórico (etapas já
        abandonadas). Pipeline não é receita realizada.
      </p>
    </AppShell>
  );
}
