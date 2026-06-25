# Checklist de validação antes de produção

## Infra / Supabase
- [ ] Migrations aplicadas (`supabase/migrations/0001..0009`).
- [ ] Schema **`eventos`** adicionado em *Dashboard → Settings → API → Exposed schemas*.
- [ ] `get_advisors` (security) sem alertas no schema `eventos`.
- [ ] RLS habilitado em todas as tabelas `eventos` (40+ policies).
- [ ] Pelo menos 1 usuário `admin` em `eventos.user_profiles`.

## Variáveis de ambiente (Vercel + .env.local)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (nunca no cliente)
- [ ] `KOMMO_SUBDOMAIN`, `KOMMO_API_BASE_URL`, `KOMMO_LONG_LIVED_TOKEN`
- [ ] `KOMMO_WEBHOOK_SECRET`, `CRON_SECRET` (aleatórios)
- [ ] `APP_URL`, `BUSINESS_TIMEZONE=America/Sao_Paulo`

## Kommo
- [ ] Integração privada criada (Redirect URL **em branco**).
- [ ] Token de longa duração copiado para o `.env.local` (não para o chat/logs).
- [ ] Teste de conexão OK (`/api/kommo/backfill` retorna `ok`).
- [ ] Web Hook configurado: `…/api/kommo/webhook/<KOMMO_WEBHOOK_SECRET>`.
- [ ] Eventos de lead marcados (add/update/status/delete).

## Mapeamentos (sem código)
- [ ] Pipeline(s) de Eventos marcados como ativos.
- [ ] Todas as etapas mapeadas para categorias (`stage_category_mappings`).
- [ ] Campos semânticos com `kommo_field_id` (no mínimo `unit`, `event_date`,
      `lead_source`; e os financeiros existentes).
- [ ] Regras de unidade cobrindo Almeria, Izzi e Matri.
- [ ] Fórmula do Total Pipeline revisada (`total_pipeline_categories`).
- [ ] Critério de "concluído faturado" definido (`billing_criteria`).
- [ ] Limites de alertas revisados (`alert_thresholds`).

## Dados
- [ ] Backfill rodado **após** os mapeamentos (categorias/unidades preenchidas).
- [ ] Relatório de qualidade de dados revisado (`data_quality_issues`):
      sem unidade, conflito, sem etapa mapeada, sem data, sem valor.
- [ ] Snapshot diário gerado para todas as unidades.
- [ ] Conferência: soma do drill-down = valor do card.
- [ ] Movimentação mensal ≠ soma de snapshots (validar um mês real).

## Qualidade
- [ ] `pnpm test` verde (35+).
- [ ] `pnpm typecheck` sem erros.
- [ ] `pnpm build` sem erros.
- [ ] Crons agendados (`vercel.json`) e plano Vercel compatível com a frequência.

## Rollback / recuperação
- [ ] Reprocessar webhooks pendentes: `GET /api/cron/sync`.
- [ ] Reprocessar 1 lead: `syncLeadsByIds([id])`.
- [ ] Recalcular snapshot de um dia: `generateDailySnapshots({ dateKey, recalcReason })`.
- [ ] Recalcular mês: `generateMonthlySummaries({ monthKey })`.
- [ ] Sincronização travada/atrasada visível em `sync_runs`.
