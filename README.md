# Painel de Inteligência Comercial de Eventos

Sistema web próprio que substitui a planilha manual "Acompanhamento Eventos",
sincronizando o pipeline de **Eventos** do **Kommo CRM** e gerando histórico,
acompanhamento diário, consolidação mensal e leitura financeira para três
unidades: **Almeria**, **Izzi Wine Garden** e **Matri**.

> Status: **Fundação (Prioridade 1) concluída** — modelo de dados, histórico de
> etapas, snapshots, cálculo correto (estoque × fluxo), integração Kommo
> (adapter + sync + webhooks + cron) e camada de domínio testada. As telas
> (P2/P3) são as próximas etapas.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind + shadcn/ui · Supabase
(Postgres/Auth) · Recharts · TanStack Table · Zod · React Hook Form · Vitest ·
Deploy na Vercel.

## Princípio central (não confundir)

- **Estoque** = snapshot diário: foto do funil ao fim de cada dia, por unidade.
  Responde *"quanto havia em contrato no dia 23/06?"*.
- **Fluxo** = movimentação por período: o que **entrou** em cada categoria num
  intervalo. Responde *"quanto entrou em contrato em junho?"*.
- **A movimentação mensal NUNCA é a soma dos snapshots diários** (isso duplicaria
  leads que ficam dias no funil). São cálculos independentes — veja
  [docs/CALCULO.md](docs/CALCULO.md).

Valor histórico = valor **no instante da entrada** na etapa. Fuso de fechamento:
`America/Sao_Paulo`; timestamps armazenados em UTC.

## Estrutura

```
src/
  app/api/            # webhook do Kommo + crons (sync, daily-snapshot, monthly)
  domain/             # camada de cálculo pura e TESTÁVEL (sem React, sem DB)
    snapshot.ts       #   estoque (estado do funil em um instante)
    movement.ts       #   fluxo (entradas por período)
    summary.ts        #   resumo automático determinístico do dia
    unit-resolution.ts#   resolução de unidade por prioridade configurável
  lib/
    kommo/            # adapter da API v4 (server-only): client, sync, webhook, mappers
    jobs/             # geração de snapshot diário e consolidação mensal
    supabase/         # clients (browser/server/admin) + tipos do schema `eventos`
    config.ts         # carrega fórmulas/critérios de app_config
    time.ts           # regras de fuso (America/Sao_Paulo) ↔ UTC
supabase/
  migrations/         # 9 migrations versionadas (schema `eventos`, 23 tabelas, RLS)
  seed.sql            # seed de DEV (isolado, não rodar em produção)
docs/                 # KOMMO_SETUP, ARCHITECTURE, CALCULO, MAPEAMENTO, CHECKLIST
```

## Banco de dados

Tudo vive no schema dedicado **`eventos`** (no projeto Supabase compartilhado),
para não colidir com os outros apps. RLS habilitado em todas as tabelas, com
papéis `admin` / `manager` / `sales` / `viewer`.

> ⚠️ **Passo manual obrigatório:** adicionar `eventos` em
> *Dashboard → Settings → API → Exposed schemas* para o cliente Supabase
> alcançar o schema. Não fizemos via SQL para não afetar os outros apps.

## Começando

```bash
pnpm install
cp .env.example .env.local   # preencha (veja docs/KOMMO_SETUP.md)
pnpm dev
pnpm test                    # camada de domínio (35 testes)
pnpm typecheck
pnpm build
```

## Documentação

- [docs/KOMMO_SETUP.md](docs/KOMMO_SETUP.md) — conectar o Kommo passo a passo
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitetura e decisões
- [docs/CALCULO.md](docs/CALCULO.md) — regras de cálculo dos indicadores
- [docs/MAPEAMENTO.md](docs/MAPEAMENTO.md) — etapas, campos e unidades
- [docs/CHECKLIST_PRE_PRODUCAO.md](docs/CHECKLIST_PRE_PRODUCAO.md) — validação antes de produção
