import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/dashboard/primitives";
import { getConfigView } from "@/lib/queries/config-view";
import { CATEGORY_LABELS } from "@/domain/categories";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";
import type { StageCategory } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const METHODOLOGY_LABELS: Record<"at_stage_entry" | "current", string> = {
  at_stage_entry: "Valor no momento de entrada na etapa (histórico congelado)",
  current: "Valor atual do lead (recalculado a cada leitura)",
};

const BILLING_METHOD_LABELS: Record<string, string> = {
  invoiced_value_gt_zero: "Valor faturado maior que zero",
  financial_record: "Existência de registro financeiro",
  payment_status: "Status de pagamento",
};

function catLabel(c: string): string {
  return CATEGORY_LABELS[c as StageCategory] ?? c;
}

/** Linha rótulo → valor de configuração. */
function ConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/40 px-4 py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-sm tabular-nums text-foreground sm:text-right">
        {children}
      </span>
    </div>
  );
}

function ReadOnlyNotice() {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
      <Lock className="size-3" />
      somente leitura nesta versão
    </span>
  );
}

export default async function ConfiguracoesPage() {
  const {
    calcConfig,
    billingCriteria,
    alertThresholds,
    appConfig,
    fieldMappings,
    stageMappings,
    unitRules,
  } = await getConfigView();

  const totalFormula = calcConfig.totalPipelineCategories.map(catLabel).join(" + ");
  const activeFormula = calcConfig.activePipelineCategories.map(catLabel).join(" + ");

  return (
    <AppShell
      title="Configurações"
      subtitle="Parâmetros de cálculo, mapeamentos e regras de negócio"
      actions={<ReadOnlyNotice />}
    >
      <div className="grid gap-4">
        {/* Fórmula do Total Pipeline */}
        <Panel title="Fórmula do Total Pipeline" hint="derivada de app_config">
          <div className="px-4 py-4">
            <div className="rounded-sm border border-info/30 bg-info/5 px-4 py-3 font-mono text-sm text-info">
              Total Pipeline = {totalFormula || "—"}
            </div>
            <div className="mt-3 rounded-sm border border-border bg-secondary/20 px-4 py-3 font-mono text-sm text-muted-foreground">
              Pipeline Ativo = {activeFormula || "—"}
            </div>
          </div>
        </Panel>

        <div className="grid gap-4 xl:grid-cols-2">
          {/* Critérios financeiros */}
          <Panel title="Critérios financeiros" hint="billing_criteria">
            <ConfigRow label="Método de faturamento">
              {BILLING_METHOD_LABELS[billingCriteria.method] ?? billingCriteria.method}
            </ConfigRow>
            <ConfigRow label="Status de nota considerados">
              {billingCriteria.invoice_status_values.join(", ") || "—"}
            </ConfigRow>
            <ConfigRow label="Status de pagamento considerados">
              {billingCriteria.payment_status_values.join(", ") || "—"}
            </ConfigRow>
          </Panel>

          {/* Metodologia de valor histórico */}
          <Panel title="Metodologia de valor histórico" hint="historical_value_methodology">
            <div className="px-4 py-4 text-sm text-muted-foreground">
              {METHODOLOGY_LABELS[calcConfig.historicalValueMethodology]}
            </div>
          </Panel>
        </div>

        {/* Limites de alertas */}
        <Panel title="Limites de alertas" hint="alert_thresholds">
          <ConfigRow label="Valor para lead parado de alto valor">
            R$ {formatInt(alertThresholds.stale_high_value_amount)}
          </ConfigRow>
          <ConfigRow label="Dias parado (alto valor)">
            {formatInt(alertThresholds.stale_high_value_days)} dias
          </ConfigRow>
          <ConfigRow label="Dias sem contrato antes do evento">
            {formatInt(alertThresholds.event_no_contract_days)} dias
          </ConfigRow>
          <ConfigRow label="Dias sem retorno após proposta">
            {formatInt(alertThresholds.proposal_no_return_days)} dias
          </ConfigRow>
          <ConfigRow label="Dias em negociação sem movimento">
            {formatInt(alertThresholds.negotiation_stale_days)} dias
          </ConfigRow>
        </Panel>

        {/* Etapas → Categorias */}
        <Panel title="Etapas → Categorias" hint="stage_category_mappings · kommo_stages">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Etapa (Kommo)</th>
                  <th className="px-3 py-2 text-right font-medium">ID etapa</th>
                  <th className="px-3 py-2 font-medium">Categoria interna</th>
                  <th className="px-3 py-2 font-medium">Ativo</th>
                </tr>
              </thead>
              <tbody>
                {stageMappings.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">
                      Nenhum mapeamento de etapa.
                    </td>
                  </tr>
                )}
                {stageMappings.map((m, i) => (
                  <tr key={`${m.kommo_stage_id ?? "x"}-${i}`} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2">{m.stage_name}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {m.kommo_stage_id ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {catLabel(m.internal_category)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "font-mono text-[11px] uppercase tracking-wider",
                          m.is_active ? "text-success" : "text-muted-foreground",
                        )}
                      >
                        {m.is_active ? "Sim" : "Não"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Campos → Chaves semânticas */}
        <Panel title="Campos → Chaves semânticas" hint="custom_field_mappings">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Chave semântica</th>
                  <th className="px-3 py-2 text-right font-medium">ID campo Kommo</th>
                  <th className="px-3 py-2 font-medium">Nome do campo</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {fieldMappings.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">
                      Nenhum mapeamento de campo.
                    </td>
                  </tr>
                )}
                {fieldMappings.map((f) => (
                  <tr key={f.semantic_key} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2 font-mono">{f.semantic_key}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {f.kommo_field_id ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{f.kommo_field_name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{f.value_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Regras de unidade */}
        <Panel title="Regras de unidade" hint="unit_mapping_rules · por prioridade">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-right font-medium">Prioridade</th>
                  <th className="px-3 py-2 font-medium">Origem</th>
                  <th className="px-3 py-2 font-medium">Operador</th>
                  <th className="px-3 py-2 font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">Unidade</th>
                  <th className="px-3 py-2 font-medium">Ativo</th>
                </tr>
              </thead>
              <tbody>
                {unitRules.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                      Nenhuma regra de unidade.
                    </td>
                  </tr>
                )}
                {unitRules.map((r, i) => (
                  <tr key={`${r.priority}-${i}`} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {r.priority}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.source_type}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.match_operator}</td>
                    <td className="max-w-[220px] truncate px-3 py-2">{r.match_value}</td>
                    <td className="px-3 py-2">{r.unit_name}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "font-mono text-[11px] uppercase tracking-wider",
                          r.is_active ? "text-success" : "text-muted-foreground",
                        )}
                      >
                        {r.is_active ? "Sim" : "Não"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* app_config bruto */}
        <Panel title="Todas as chaves de configuração" hint="app_config (leitura)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Chave</th>
                  <th className="px-3 py-2 font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {appConfig.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-10 text-center text-muted-foreground">
                      Nenhuma configuração registrada.
                    </td>
                  </tr>
                )}
                {appConfig.map((c) => (
                  <tr key={c.key} className="border-b border-border/40 align-top last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 font-mono">{c.key}</td>
                    <td className="max-w-[360px] px-3 py-2">
                      <code className="block whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                        {JSON.stringify(c.value)}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{c.description ?? "—"}</td>
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
