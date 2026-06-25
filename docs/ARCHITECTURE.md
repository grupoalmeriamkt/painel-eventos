# Arquitetura

## Camadas (separação rígida)

```
Kommo CRM ──(API v4, server-only)──▶ src/lib/kommo  ──▶ Supabase (schema eventos)
                                          │ sync/webhook              │
                                          ▼                           ▼
                                   src/lib/jobs  ◀── src/domain (cálculo puro, testado)
                                          │
                                          ▼
                            tabelas agregadas (snapshots, summaries)
                                          │
                                          ▼
                            app/ (Server Components) ──▶ UI (P2)
```

- **`src/domain`** — funções puras de cálculo, sem React e sem DB. É a **fonte de
  verdade** das regras e o que os testes cobrem. Nunca colocar cálculo crítico em
  componentes.
- **`src/lib/kommo`** — adapter da API v4 (com `server-only`): `client` (auth,
  paginação, retry, rate-limit), `sync` (backfill/incremental, histórico de
  etapas, qualidade de dados), `webhook` (parser idempotente), `mappers`.
- **`src/lib/jobs`** — orquestra o domínio + persistência: gera snapshots diários
  e consolidações mensais.
- **`src/lib/supabase`** — três clients: `client` (browser, anon, RLS), `server`
  (SSR, anon + sessão, RLS), `admin` (service role, **bypassa RLS**, só backend).
- **SQL** (`supabase/migrations`) — schema, índices, RLS, e funções analíticas
  (`fn_lead_state_as_of`, `fn_movement_entries`) + views de drill-down.

## Por que SQL **e** domínio em TS?

A fonte de verdade do cálculo de snapshot/movimentação é o **domínio em TS**
(testável, auditável), que os jobs persistem em tabelas agregadas. O SQL fornece
armazenamento, índices, RLS e funções/views para **drill-down** e checagens de
integridade. Assim não há duplicação de lógica de negócio crítica em dois lugares.

## Quatro dimensões de tempo (tratadas separadamente)

1. Criação do lead no Kommo (`created_at_kommo`).
2. Entrada/saída de etapa (`lead_stage_history.changed_at`).
3. Data do evento (`event_date`).
4. Datas financeiras (proposta/contrato/NF/pagamento em `lead_financial_records`).

## Quatro valores financeiros (não confundir)

1. Valor atual do lead (`leads.current_value`).
2. Proposta · 3. Contrato · 4. Faturado/Recebido — em `lead_financial_records`
   (suporta múltiplas faturas/pagamentos). Pipeline **não** é receita realizada.

## Fuso horário

Timestamps em UTC no banco. Agrupamento diário/mensal e fechamento no fuso de
negócio (`America/Sao_Paulo`) — `src/lib/time.ts`. O snapshot diário usa
`as_of = 23:59:59.999` (BRT) do dia, convertido para UTC.

## Segurança

- Token do Kommo só no backend (env), nunca no cliente/logs/banco aberto.
- Webhook autenticado por segredo no caminho da rota (Kommo não assina) + HTTPS,
  com verificação em tempo constante e limite de tamanho de corpo.
- Crons protegidos por `CRON_SECRET` (header `Authorization: Bearer`).
- RLS em todas as tabelas; jobs usam service role (bypass) de forma isolada.

## Idempotência e resiliência

- Upsert de leads por `(connection_id, kommo_lead_id)`.
- Histórico de etapa inserido só em mudança real de categoria/etapa/pipeline.
- Webhooks: dedup por `payload_hash`; reprocessamento via cron de segurança.
- Sync incremental com watermark `updated_at` e janela de sobreposição (10 min).
- Toda execução registrada em `sync_runs`; exclusões são explícitas
  (`deleted_at_kommo`), nunca hard delete silencioso.
