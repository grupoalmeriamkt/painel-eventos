import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/dashboard/primitives";
import { getPerformanceByResponsible } from "@/lib/queries/performance";
import { formatBRL, formatInt, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await searchParams;
  const rows = await getPerformanceByResponsible();

  return (
    <AppShell
      title="Performance Comercial"
      subtitle="Indicadores comerciais por responsável · estoque e fluxo do funil"
      actions={
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {formatInt(rows.length)} responsáveis
        </span>
      }
    >
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">Responsável</th>
                <th className="px-3 py-2 text-right font-medium">Leads</th>
                <th className="px-3 py-2 text-right font-medium">Propostas</th>
                <th className="px-3 py-2 text-right font-medium">Contratos</th>
                <th className="px-3 py-2 text-right font-medium">Fechamentos</th>
                <th className="px-3 py-2 text-right font-medium">Ticket médio</th>
                <th className="px-3 py-2 text-right font-medium">Pipeline</th>
                <th className="px-3 py-2 text-right font-medium">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                    Sem dados comerciais.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.responsible}
                  className="border-b border-border/40 last:border-0 hover:bg-accent/40"
                >
                  <td className="max-w-[220px] truncate px-3 py-2">{r.responsible}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatInt(r.leadsRecebidos)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {formatInt(r.propostas)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {formatInt(r.contratos)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatInt(r.fechamentos)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {formatBRL(r.ticketMedio)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatBRL(r.valorEmPipeline)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        r.conversao >= 10
                          ? "text-success"
                          : r.conversao > 0
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {formatPercent(r.conversao)}
                    </span>
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
