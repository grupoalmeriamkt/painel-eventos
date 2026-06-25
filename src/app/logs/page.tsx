import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/dashboard/primitives";
import { getLogs } from "@/lib/queries/logs";
import { formatDateTimeBR, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RunStatus, WebhookStatus } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const RUN_STATUS: Record<RunStatus, { label: string; cls: string }> = {
  success: { label: "Sucesso", cls: "text-success" },
  partial: { label: "Parcial", cls: "text-warning" },
  failed: { label: "Falhou", cls: "text-critical" },
  running: { label: "Rodando", cls: "text-muted-foreground" },
};

const WEBHOOK_STATUS: Record<WebhookStatus, { label: string; cls: string }> = {
  received: { label: "Recebido", cls: "text-info" },
  processing: { label: "Processando", cls: "text-muted-foreground" },
  processed: { label: "Processado", cls: "text-success" },
  failed: { label: "Falhou", cls: "text-critical" },
  skipped: { label: "Ignorado", cls: "text-muted-foreground" },
};

function StatusBadge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={cn("font-mono text-[11px] uppercase tracking-wider", cls)}>{label}</span>
  );
}

export default async function LogsPage() {
  const { syncRuns, webhooks, qualityIssues, auditLogs } = await getLogs();
  const totalIssues = qualityIssues.reduce((acc, i) => acc + i.count, 0);

  return (
    <AppShell
      title="Logs e Auditoria"
      subtitle="Sincronizações, webhooks, qualidade de dados e trilha de auditoria"
      actions={
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {formatInt(totalIssues)} problemas abertos
        </span>
      }
    >
      <div className="grid gap-4">
        {/* Sincronizações */}
        <Panel title="Sincronizações" hint="últimas 30 execuções">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Lidos</th>
                  <th className="px-3 py-2 text-right font-medium">Criados</th>
                  <th className="px-3 py-2 text-right font-medium">Atualizados</th>
                  <th className="px-3 py-2 text-right font-medium">Falhas</th>
                  <th className="px-3 py-2 font-medium">Início</th>
                  <th className="px-3 py-2 font-medium">Fim</th>
                  <th className="px-3 py-2 font-medium">Erro</th>
                </tr>
              </thead>
              <tbody>
                {syncRuns.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                      Nenhuma sincronização registrada.
                    </td>
                  </tr>
                )}
                {syncRuns.map((r) => {
                  const s = RUN_STATUS[r.status];
                  return (
                    <tr key={r.id} className="border-b border-border/40 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 font-mono">{r.sync_type}</td>
                      <td className="px-3 py-2">
                        <StatusBadge label={s.label} cls={s.cls} />
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                        {formatInt(r.records_read)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                        {formatInt(r.records_created)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                        {formatInt(r.records_updated)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono tabular-nums",
                          r.records_failed > 0 ? "text-critical" : "text-muted-foreground",
                        )}
                      >
                        {formatInt(r.records_failed)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-muted-foreground">
                        {formatDateTimeBR(r.started_at)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-muted-foreground">
                        {formatDateTimeBR(r.finished_at)}
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-2 text-critical">
                        {r.error_summary ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          {/* Webhooks recebidos */}
          <Panel title="Webhooks recebidos" hint="últimos 30 eventos">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Entidade</th>
                    <th className="px-3 py-2 text-right font-medium">ID externo</th>
                    <th className="px-3 py-2 font-medium">Recebido</th>
                    <th className="px-3 py-2 font-medium">Processado</th>
                    <th className="px-3 py-2 font-medium">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {webhooks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                        Nenhum webhook recebido.
                      </td>
                    </tr>
                  )}
                  {webhooks.map((w) => {
                    const s = WEBHOOK_STATUS[w.status];
                    return (
                      <tr key={w.id} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2">
                          <StatusBadge label={s.label} cls={s.cls} />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{w.entity_type ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                          {w.entity_external_id ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-muted-foreground">
                          {formatDateTimeBR(w.received_at)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-muted-foreground">
                          {formatDateTimeBR(w.processed_at)}
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-critical">
                          {w.last_error ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Qualidade de dados */}
          <Panel title="Qualidade de dados" hint="problemas em aberto por tipo">
            {qualityIssues.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhum problema em aberto.
              </div>
            ) : (
              <ul>
                {qualityIssues.map((i) => (
                  <li
                    key={i.issue_type}
                    className="flex items-center justify-between border-b border-border/40 px-4 py-2.5 text-sm last:border-0"
                  >
                    <span className="text-muted-foreground">{i.issue_type}</span>
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        i.count > 0 ? "text-warning" : "text-muted-foreground",
                      )}
                    >
                      {formatInt(i.count)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Auditoria */}
        <Panel title="Auditoria" hint="últimas 20 ações">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Ação</th>
                  <th className="px-3 py-2 font-medium">Entidade</th>
                  <th className="px-3 py-2 font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-10 text-center text-muted-foreground">
                      Nenhuma ação registrada.
                    </td>
                  </tr>
                )}
                {auditLogs.map((a) => (
                  <tr key={a.id} className="border-b border-border/40 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 font-mono">{a.action}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.entity_type ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-muted-foreground">
                      {formatDateTimeBR(a.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
