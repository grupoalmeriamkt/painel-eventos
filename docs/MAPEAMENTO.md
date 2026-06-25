# Mapeamento de etapas, campos e unidades

Nada é hardcoded: tudo é configurável em tabelas do schema `eventos`. Os
exemplos de etapas abaixo são **sugestões iniciais** — ajuste conforme a conta.

## Etapas → categorias internas (`stage_category_mappings`)

Sugestão a partir do pipeline atual de Eventos:

| Etapa no Kommo | Categoria interna |
|----------------|-------------------|
| Leads LP | `lead` |
| Entrada e Qualificação | `qualificacao` |
| Em Atendimento - Camila / Carina / Em Atendimento | `atendimento` |
| Proposta Enviada / Propostas para 2027 | `proposta` |
| Em Negociação | `negociacao` |
| Contrato | `contrato` |
| Fechado | `fechado` |
| Concluído | `concluido` |
| Reservas Maiores | `reserva_maior` |
| Perdido | `perdido` |
| Desqualificados | `desqualificado` |

Várias etapas reais podem mapear para a **mesma** categoria. Mudança entre
etapas da mesma categoria não conta como nova entrada comercial.

Flags por mapeamento: `include_in_total_pipeline`, `include_in_active_pipeline`.

## Campos personalizados → chaves semânticas (`custom_field_mappings`)

Preencha `kommo_field_id` para cada chave (descubra os IDs via
`GET /api/v4/leads/custom_fields`). Chaves esperadas:

`unit`, `event_date`, `event_start_time`, `event_end_time`, `guest_count`,
`event_type`, `event_space`, `lead_source`, `proposal_value`, `contract_value`,
`invoiced_value`, `received_value`, `contract_signed_at`, `proposal_sent_at`,
`invoice_issued_at`, `payment_received_at`, `payment_status`, `invoice_number`,
`loss_reason`.

> Após a configuração, a referência principal é o **ID** do campo (não o nome,
> que pode mudar no Kommo).

## Regras de unidade (`unit_mapping_rules`)

Prioridade (menor número vence):
1. `manual_override` (override local) — vence sempre.
2. `custom_field` (ex.: "Espaço que vai ser utilizado").
3. `tag`.
4. `pipeline`.
5. `text_rule` (texto normalizado).
6. Sem identificação → `unresolved` (vai para qualidade de dados).

Exemplos de valores → unidade:

| Valor casado | Unidade |
|--------------|---------|
| contém "almeria" | Almeria |
| contém "izzi" ou "wine garden" | Izzi Wine Garden |
| contém "matri" | Matri |

Operadores: `equals`, `contains`, `starts_with`, `regex` (texto normalizado:
minúsculas, sem acento). **Sem fuzzy agressivo.** Se regras de mesma prioridade
apontarem unidades diferentes → `conflict` (fila de qualidade de dados).

## Decisões explícitas (não assumir em silêncio)

Registradas em `app_config`: campo de unidade, de data do evento, de origem, de
valor; etapas do Total Pipeline; critério de "concluído faturado"; se "fechado"
é venda ganha (`fechado_means_won`); pipeline ativo; metodologia de valor
histórico; fonte de verdade em conflito (`conflict_source_of_truth`).
