# Configuração do Kommo — passo a passo

Este guia conecta o Painel ao Kommo via **integração privada** com **token de
longa duração** (somente backend). Baseado na documentação oficial:
- https://developers.kommo.com/docs/private-integration
- https://developers.kommo.com/docs/webhooks-general

---

## 1. Criar a integração privada

No Kommo: **Configurações → Integrações → Criar integração**.

Preencha a tela "Criar integração" assim:

| Campo | O que colocar |
|-------|---------------|
| **URL de redirecionamento** | **DEIXE EM BRANCO.** A doc oficial diz: *"If you are going to use a long-lived token, don't type anything in Redirect URL field."* |
| Acesse web hook de notificação revogada (opcional) | Pode deixar em branco (ou apontar para `https://SEU_APP/api/kommo/revoked` no futuro). |
| **Permitir acesso** | Marque **Todos** (a leitura de leads, pipelines, campos e usuários precisa de acesso completo). |
| Controle duplicado / Fontes múltiplas | Deixe desmarcado. |
| **Nome da integração** | `Painel Eventos` (3–255 caracteres). |
| **Descrição** | `Camada de inteligência comercial de eventos (Almeria, Izzi, Matri).` (mín. 5 caracteres). |

Clique **Salvar**.

## 2. Pegar o token de longa duração

Após salvar, abra a integração e vá na aba **"Chaves e escopos"**
(*Keys and scopes*). Lá aparecem:

- **Token de longa duração** ← é este que usamos (`KOMMO_LONG_LIVED_TOKEN`).
- Chave secreta e ID da integração (não precisamos para token de longa duração).

> ⚠️ O token é um segredo. **Não cole no chat.** Copie direto para o `.env.local`.

## 3. Preencher o `.env.local`

```bash
KOMMO_SUBDOMAIN=suaconta            # de suaconta.kommo.com
KOMMO_API_BASE_URL=https://suaconta.kommo.com/api/v4
KOMMO_LONG_LIVED_TOKEN=<cole o token aqui>
KOMMO_WEBHOOK_SECRET=<gere um segredo aleatório>   # ex.: openssl rand -hex 24
CRON_SECRET=<gere outro segredo aleatório>
```

Gere segredos aleatórios:
```bash
openssl rand -hex 24   # rode duas vezes (webhook e cron)
```

## 4. Testar a conexão e rodar o backfill inicial

Com o app rodando (`pnpm dev`) ou já em produção:

```bash
# Backfill: sincroniza pipelines, etapas e todos os leads do Kommo.
curl -X POST https://SEU_APP/api/kommo/backfill \
  -H "Authorization: Bearer $CRON_SECRET"
```

Isso popula `kommo_pipelines`, `kommo_stages` e `leads`. Os leads ainda ficam
**sem categoria** até você mapear as etapas (passo 5).

## 5. Mapear etapas → categorias e campos → chaves semânticas

A inteligência depende destes mapeamentos (feitos no banco ou pela tela de
Configurações quando a UI estiver pronta):

1. **Etapas → categorias internas** (`eventos.stage_category_mappings`):
   ligue cada `kommo_stage_id` a uma categoria (`lead`, `proposta`,
   `negociacao`, `contrato`, `fechado`, `concluido`, etc.). Veja exemplos em
   [MAPEAMENTO.md](./MAPEAMENTO.md).
2. **Campos personalizados → chaves semânticas** (`eventos.custom_field_mappings`):
   preencha `kommo_field_id` para `unit`, `event_date`, `lead_source`,
   `proposal_value`, `contract_value`, etc. (use `GET /api/v4/leads/custom_fields`
   ou a tela de onboarding para descobrir os IDs).
3. **Regras de unidade** (`eventos.unit_mapping_rules`): ex.: campo
   "Espaço que vai ser utilizado" contém "Almeria" → unidade Almeria.

Depois de mapear, **rode o backfill de novo** para preencher categorias,
unidades e valores corretamente. O backfill é idempotente (upsert).

## 6. Configurar os Web Hooks

No Kommo: **Configurações → Integrações → Web Hooks** (botão no topo).

- **URL**: `https://SEU_APP/api/kommo/webhook/<KOMMO_WEBHOOK_SECRET>`
  (o segredo vai **no caminho** da URL — é assim que autenticamos, já que o
  Kommo não assina os webhooks).
- **Eventos**: marque criação/edição/mudança de status/exclusão de **Leads**
  (e mudança de responsável, se disponível).

O endpoint persiste o evento na hora, responde `200` em menos de 2s e processa
de forma assíncrona e idempotente (rebusca o lead atualizado no Kommo).

## 7. Agendamentos (cron) — segurança e fechamento

Já configurados em `vercel.json` (horários em UTC):

| Cron | Quando | Função |
|------|--------|--------|
| `/api/cron/sync` | de hora em hora | sincronização de segurança + reprocessa webhooks perdidos |
| `/api/cron/daily-snapshot` | 03:10 UTC (00:10 BRT) | fecha o snapshot do dia anterior por unidade |
| `/api/cron/monthly` | 03:40 UTC | recalcula a consolidação do mês corrente (idempotente) |

> Cron na Vercel: a frequência horária exige plano **Pro**. No **Hobby** os
> crons rodam no máximo 1x/dia — ajuste o `schedule` se necessário.

## Notas de segurança

- O token do Kommo **nunca** vai para o cliente, logs ou banco em texto aberto —
  fica só em variável de ambiente e é usado apenas no backend.
- Todas as chamadas ao Kommo saem do servidor (`src/lib/kommo/*` tem `server-only`).
- O webhook valida o segredo do caminho em tempo constante e limita o tamanho do corpo.
