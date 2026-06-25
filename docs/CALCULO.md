# Regras de cálculo dos indicadores

Todas as regras abaixo são implementadas em `src/domain` e cobertas por testes
(`pnpm test`). Configurações ficam em `eventos.app_config`.

## Estoque × Fluxo (a regra mais importante)

- **Estoque (snapshot diário)** — `computeDailySnapshot`. Estado do funil em um
  instante `as_of` (fim do dia em BRT). Cada lead conta **uma vez**, na categoria
  em que estava. Base: `resolveStateAsOf` (última transição ≤ as_of).
- **Fluxo (movimentação)** — `computeMovement`. Conta cada **entrada** real numa
  categoria dentro de `[início, fim)`. Base: `lead_stage_history`.
- ❌ **Nunca** somar snapshots diários para obter movimentação mensal (duplicaria
  leads que ficam dias na mesma etapa). Teste dedicado garante isso.

## Valor histórico

Config `historical_value_methodology`:
- `at_stage_entry` (padrão) — usa `lead_value_at_change` (valor no instante da
  entrada). Se o valor mudar depois, relatórios históricos **não** mudam.
- `current` — usa o valor atual do lead.

## Total Pipeline (configurável)

Config `total_pipeline_categories` (padrão `["proposta","negociacao","contrato","fechado"]`):
```
Total Pipeline = soma do valor das categorias selecionadas (estoque no dia)
```
`active_pipeline_categories` define o "pipeline ativo" (exclui concluído,
perdido, desqualificado, reserva_maior por padrão).

## Categorias de entrada (fluxo) — entrada real

Uma transição conta como entrada quando `to_category != from_category`.
- Mudança entre **etapas da mesma categoria** (ex.: "Atendimento Camila" →
  "Atendimento Carina") **não** conta.
- **Reentrada** (sair e voltar para a mesma categoria) **conta** de novo.

## Indicadores obrigatórios (mapa)

| # | Indicador | Tipo | Fonte |
|---|-----------|------|-------|
| 1 | Eventos concluídos (qtd/valor) | estoque | `byCategory.concluido` |
| 2 | Concluídos faturados/pagos | financeiro | `lead_financial_records` + `billing_criteria` |
| 3 | Em negociação (R$) | estoque | `negotiationValue` |
| 4 | Atendimento precificado | estoque | `pricedLeadsInService*` |
| 5 | Propostas emitidas no mês | fluxo | `movement.entered.proposta` |
| 6 | Propostas emitidas no ano | fluxo | idem, período anual |
| 7 | Propostas p/ eventos 2027 (pipeline e emitidas) | estoque + fluxo | `eventYearBreakdown` / `proposalsByEventYear` |
| 8/9 | Fechado no mês/ano | fluxo | `movement.entered.fechado` |
| 10/11 | Contratado no mês/ano | fluxo | `movement.entered.contrato` |
| 12 | Leads por dia/mês | criação | `created_at_kommo` |

Anos (2026/2027/…) **não** são hardcoded: `eventYearBreakdown` e
`proposalsByEventYear` são dinâmicos por ano do evento.

## "Concluído faturado/pago" (config `billing_criteria`)

`method`:
- `invoiced_value_gt_zero` — há registro `invoice` com valor > 0.
- `financial_record` — existe registro financeiro do tipo configurado.
- `payment_status` — `payment_status` ∈ valores configurados.

Faturado = soma `invoice`; Recebido = soma `payment` − `refund`;
Saldo a receber = Faturado − Recebido (view `v_lead_financial_summary`).

## Resumo automático do dia

`generateDailySummary` — determinístico (sem IA), ex.:
> "13 leads recebidos. 4 leads em atendimento. 7 propostas emitidas. 2 leads
> avançaram para negociação. 1 contrato entrou no funil. 3 perdas registradas."

## Drill-down

Todo número é explicável: cada card abre a lista de leads que o compõem, com
fórmula, dimensão de data usada e filtros ativos. Teste garante que a soma das
linhas detalhadas é igual ao valor do card.
