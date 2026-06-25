import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/dashboard/primitives";
import { getAlertas, type AlertSeverity, type AlertLead } from "@/lib/queries/alertas";
import { serverEnv } from "@/lib/env";
import { CATEGORY_LABELS } from "@/domain/categories";
import { formatBRL, formatDateBR, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MAX_ROWS = 50;

const SEVERITY_TEXT: Record<AlertSeverity, string> = {
  critical: "text-critical",
  warning: "text-warning",
  info: "text-info",
};

const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  critical: "border-critical/40 bg-critical/10 text-critical",
  warning: "border-warning/40 bg-warning/10 text-warning",
  info: "border-info/40 bg-info/10 text-info",
};

const SEVERITY_ACCENT: Record<AlertSeverity, string> = {
  critical: "var(--color-critical)",
  warning: "var(--color-warning)",
  info: "var(--color-info)",
};

export default async function AlertasPage() {
  const { groups, thresholds } = await getAlertas();
  const subdomain = serverEnv().KOMMO_SUBDOMAIN ?? "";
  const totalAlertas = groups.reduce((acc, g) => acc + g.leads.length, 0);

  return (
    <AppShell
      title="Alertas"
      subtitle="Riscos operacionais e financeiros do funil · ação requerida"
      actions={
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {formatInt(totalAlertas)} alertas
        </span>
      }
    >
      {/* Cards-resumo */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {groups.map((g) => (
          <a
            key={g.key}
            href={`#${g.key}`}
            className="group relative block overflow-hidden rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-muted-foreground/40"
          >
            <span
              className="absolute inset-y-0 left-0 w-0.5"
              style={{ backgroundColor: SEVERITY_ACCENT[g.severidade] }}
              aria-hidden
            />
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {g.titulo}
            </div>
            <div
              className={cn(
                "mt-1 font-mono text-2xl font-semibold tabular-nums tracking-tight",
                g.leads.length > 0 ? SEVERITY_TEXT[g.severidade] : "text-muted-foreground",
              )}
            >
              {formatInt(g.leads.length)}
            </div>
          </a>
        ))}
      </div>

      {/* Grupos */}
      <div className="space-y-6">
        {groups.map((g) => {
          const shown = g.leads.slice(0, MAX_ROWS);
          const rest = g.leads.length - shown.length;
          return (
            <section key={g.key} id={g.key} className="scroll-mt-20">
              <Panel
                title={g.titulo}
                actions={
                  <span
                    className={cn(
                      "rounded-sm border px-2 py-0.5 font-mono text-[11px] tabular-nums",
                      g.leads.length > 0
                        ? SEVERITY_BORDER[g.severidade]
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {formatInt(g.leads.length)}
                  </span>
                }
              >
                <p className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
                  {g.descricao}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Lead</th>
                        <th className="px-3 py-2 font-medium">Etapa</th>
                        <th className="px-3 py-2 text-right font-medium">Valor</th>
                        <th className="px-3 py-2 font-medium">Evento</th>
                        <th className="px-3 py-2 text-right font-medium">Parado</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-3 py-8 text-center text-muted-foreground"
                          >
                            Nenhum alerta neste grupo.
                          </td>
                        </tr>
                      )}
                      {shown.map((l) => (
                        <AlertRow
                          key={l.id}
                          lead={l}
                          subdomain={subdomain}
                          severity={g.severidade}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                {rest > 0 && (
                  <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                    +{formatInt(rest)} restantes
                  </div>
                )}
              </Panel>
            </section>
          );
        })}
      </div>

      {/* Rodapé: limites configuráveis */}
      <footer className="mt-8 border-t border-border pt-3 text-[11px] text-muted-foreground/70">
        <span className="font-mono uppercase tracking-wider">Limites (configuráveis):</span>{" "}
        valor alto &gt; {formatBRL(thresholds.stale_high_value_amount)} /{" "}
        {thresholds.stale_high_value_days}d · evento sem contrato{" "}
        {thresholds.event_no_contract_days}d · proposta sem retorno{" "}
        {thresholds.proposal_no_return_days}d · negociação parada{" "}
        {thresholds.negotiation_stale_days}d
      </footer>
    </AppShell>
  );
}

function AlertRow({
  lead,
  subdomain,
  severity,
}: {
  lead: AlertLead;
  subdomain: string;
  severity: AlertSeverity;
}) {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-accent/40">
      <td className="max-w-[240px] truncate px-3 py-2">{lead.name ?? "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">
        {lead.stage_category ? CATEGORY_LABELS[lead.stage_category] : "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {formatBRL(lead.current_value)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-muted-foreground">
        {formatDateBR(lead.event_date)}
      </td>
      <td className="px-3 py-2 text-right">
        {lead.daysStale === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={cn("font-mono tabular-nums", SEVERITY_TEXT[severity])}>
            {formatInt(lead.daysStale)}d
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <a
          href={`https://${subdomain}.kommo.com/leads/detail/${lead.kommo_lead_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-info hover:underline"
        >
          <ExternalLink className="size-3" />
        </a>
      </td>
    </tr>
  );
}
