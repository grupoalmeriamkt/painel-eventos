import { AppShell } from "@/components/shell/app-shell";
import { Panel, MetricCard } from "@/components/dashboard/primitives";
import { getFinanceOverview } from "@/lib/queries/financeiro";
import { formatBRL, formatInt, formatPercent, formatDateBR } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

const monthLabel = (key: string) => {
  if (key === "sem-data") return "Sem data de evento";
  const [y, m] = key.split("-");
  const names = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${names[idx]}/${y}` : key;
};

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await searchParams;
  const data = await getFinanceOverview();
  const t = data.totals;

  const coverage =
    data.totalLeads > 0 ? (data.leadsWithRecords / data.totalLeads) * 100 : null;

  return (
    <AppShell
      title="Financeiro"
      subtitle="Receita realizada · registros financeiros do Kommo (NF, contrato, pagamento)"
      actions={
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {formatInt(data.recordCount)} registros
        </span>
      }
    >
      {/* Aviso de cobertura — registros financeiros são esparsos */}
      <div className="mb-4 flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md border border-warning/30 bg-warning/5 px-4 py-2.5 text-xs text-warning">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-0.5">
          <p>
            Faturado/Recebido vêm de registros financeiros do Kommo (NF, contrato, pagamento), que
            ainda são esparsos. Pipeline não é receita realizada.
          </p>
          <p className="text-muted-foreground">
            <strong className="font-mono tabular-nums text-warning">
              {formatInt(data.leadsWithRecords)}
            </strong>{" "}
            de{" "}
            <strong className="font-mono tabular-nums text-warning">
              {formatInt(data.totalLeads)}
            </strong>{" "}
            leads possuem algum registro financeiro
            {coverage !== null && (
              <>
                {" "}
                (<span className="font-mono tabular-nums">{formatPercent(coverage)}</span> de
                cobertura)
              </>
            )}
            .
          </p>
        </div>
      </div>

      {/* Cards de totais */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Proposto" value={t.proposto} context="Σ propostas" />
        <MetricCard label="Contratado" value={t.contratado} context="Σ contratos" />
        <MetricCard label="Faturado" value={t.faturado} tone="info" context="Σ notas fiscais" />
        <MetricCard
          label="Recebido"
          value={t.recebido}
          tone="success"
          context="Σ pagamentos − estornos"
        />
        <MetricCard
          label="Saldo a receber"
          value={t.saldoAReceber}
          tone="warning"
          context="Faturado − Recebido"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Por unidade */}
        <Panel title="Por unidade" hint="registros financeiros reais">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Unidade</th>
                  <th className="px-4 py-2 text-right font-medium">Contratado</th>
                  <th className="px-4 py-2 text-right font-medium">Faturado</th>
                  <th className="px-4 py-2 text-right font-medium">Recebido</th>
                  <th className="px-4 py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {data.byUnit.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum registro financeiro encontrado.
                    </td>
                  </tr>
                )}
                {data.byUnit.map((u) => (
                  <tr
                    key={u.unitId ?? "none"}
                    className="border-b border-border/50 last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: u.unitColor ?? "var(--color-muted-foreground)" }}
                        />
                        <span
                          className={u.unitId ? "font-medium" : "font-medium text-warning"}
                        >
                          {u.unitName}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {u.contratado ? formatBRL(u.contratado) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-info">
                      {u.faturado ? formatBRL(u.faturado) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-success">
                      {u.recebido ? formatBRL(u.recebido) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-warning">
                      {u.saldoAReceber ? formatBRL(u.saldoAReceber) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Por mês do evento */}
        <Panel title="Por mês do evento" hint="agrupado por leads.event_date">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Mês</th>
                  <th className="px-4 py-2 text-right font-medium">Faturado</th>
                  <th className="px-4 py-2 text-right font-medium">Recebido</th>
                  <th className="px-4 py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {data.byMonth.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum registro de NF/pagamento encontrado.
                    </td>
                  </tr>
                )}
                {data.byMonth.map((m) => (
                  <tr
                    key={m.monthKey}
                    className="border-b border-border/50 last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-2.5">
                      <span className={m.monthKey === "sem-data" ? "text-warning" : ""}>
                        {monthLabel(m.monthKey)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-info">
                      {m.faturado ? formatBRL(m.faturado) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-success">
                      {m.recebido ? formatBRL(m.recebido) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-warning">
                      {m.saldo ? formatBRL(m.saldo) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground/60">
        Atualizado {formatDateBR(data.generatedAt)} · valores em BRL. Proposto/Contratado são os
        registros de proposta e contrato; Faturado = notas fiscais; Recebido = pagamentos líquidos
        de estornos.
      </p>
    </AppShell>
  );
}
