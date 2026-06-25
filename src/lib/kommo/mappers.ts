import type { KommoLead, KommoCustomFieldValue } from "./types";
import type { UnitSignals } from "@/domain/unit-resolution";

/**
 * Extração de campos semânticos a partir do lead do Kommo, usando o mapeamento
 * configurável (semantic_key -> kommo_field_id). Sem campo mapeado, o valor fica
 * indefinido (e o indicador aparece como "não configurado", nunca zero silencioso).
 */

export type SemanticKey =
  | "unit"
  | "event_date"
  | "event_start_time"
  | "event_end_time"
  | "guest_count"
  | "event_type"
  | "event_space"
  | "lead_source"
  | "proposal_value"
  | "contract_value"
  | "invoiced_value"
  | "received_value"
  | "contract_signed_at"
  | "proposal_sent_at"
  | "invoice_issued_at"
  | "payment_received_at"
  | "payment_status"
  | "invoice_number"
  | "loss_reason";

/** Mapa semantic_key -> kommo_field_id (vem de custom_field_mappings). */
export type FieldMap = Map<SemanticKey, number>;

function firstValue(cf: KommoCustomFieldValue): string | null {
  const v = cf.values?.[0]?.value;
  if (v === null || v === undefined) return null;
  return String(v);
}

function findField(lead: KommoLead, fieldId: number): KommoCustomFieldValue | undefined {
  return (lead.custom_fields_values ?? []).find((f) => f.field_id === fieldId);
}

export function getSemanticRaw(
  lead: KommoLead,
  map: FieldMap,
  key: SemanticKey,
): string | null {
  const fieldId = map.get(key);
  if (fieldId === undefined) return null;
  const field = findField(lead, fieldId);
  return field ? firstValue(field) : null;
}

/** "yyyy-MM-dd" a partir de date/date_time do Kommo (epoch seconds ou ISO). */
export function toDateOnly(raw: string | null): string | null {
  if (!raw) return null;
  const asNum = Number(raw);
  const d = Number.isFinite(asNum) && raw.trim() !== ""
    ? new Date(asNum * 1000)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Inteiro seguro p/ coluna int (ex.: convidados). Trunca; null se não numérico. */
function toIntOrNull(raw: string | null): number | null {
  const n = toNumber(raw);
  return n === null ? null : Math.trunc(n);
}

/**
 * "Horário aproximado" é texto livre no Kommo ("18h", "18:30", "às 19").
 * Converte para "HH:MM:00" válido para coluna time, ou null se não der.
 */
function toTimeOrNull(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})(?:[:h.\s](\d{2}))?/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(h) || h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

export interface ExtractedLeadFields {
  eventDate: string | null;
  eventStartTime: string | null;
  eventEndTime: string | null;
  guestCount: number | null;
  eventType: string | null;
  eventSpace: string | null;
  leadSource: string | null;
  lossReason: string | null;
  paymentStatus: string | null;
  invoiceNumber: string | null;
  proposalValue: number | null;
  contractValue: number | null;
  invoicedValue: number | null;
  receivedValue: number | null;
  contractSignedAt: string | null;
  proposalSentAt: string | null;
  invoiceIssuedAt: string | null;
  paymentReceivedAt: string | null;
}

export function extractLeadFields(lead: KommoLead, map: FieldMap): ExtractedLeadFields {
  return {
    eventDate: toDateOnly(getSemanticRaw(lead, map, "event_date")),
    eventStartTime: toTimeOrNull(getSemanticRaw(lead, map, "event_start_time")),
    eventEndTime: toTimeOrNull(getSemanticRaw(lead, map, "event_end_time")),
    guestCount: toIntOrNull(getSemanticRaw(lead, map, "guest_count")),
    eventType: getSemanticRaw(lead, map, "event_type"),
    eventSpace: getSemanticRaw(lead, map, "event_space"),
    leadSource: getSemanticRaw(lead, map, "lead_source"),
    lossReason: getSemanticRaw(lead, map, "loss_reason"),
    paymentStatus: getSemanticRaw(lead, map, "payment_status"),
    invoiceNumber: getSemanticRaw(lead, map, "invoice_number"),
    proposalValue: toNumber(getSemanticRaw(lead, map, "proposal_value")),
    contractValue: toNumber(getSemanticRaw(lead, map, "contract_value")),
    invoicedValue: toNumber(getSemanticRaw(lead, map, "invoiced_value")),
    receivedValue: toNumber(getSemanticRaw(lead, map, "received_value")),
    contractSignedAt: toDateOnly(getSemanticRaw(lead, map, "contract_signed_at")),
    proposalSentAt: toDateOnly(getSemanticRaw(lead, map, "proposal_sent_at")),
    invoiceIssuedAt: toDateOnly(getSemanticRaw(lead, map, "invoice_issued_at")),
    paymentReceivedAt: toDateOnly(getSemanticRaw(lead, map, "payment_received_at")),
  };
}

/** Sinais p/ resolução de unidade (campo configurado de unidade + tags + pipeline). */
export function buildUnitSignals(
  lead: KommoLead,
  unitFieldId: number | undefined,
  manualOverrideUnitId?: string | null,
): UnitSignals {
  const customFields = (lead.custom_fields_values ?? [])
    .filter((f) => (unitFieldId ? f.field_id === unitFieldId : true))
    .flatMap((f) =>
      (f.values ?? []).map((v) => ({
        fieldId: f.field_id,
        fieldName: f.field_name ?? null,
        value: v.value === null || v.value === undefined ? "" : String(v.value),
      })),
    );
  const tags = (lead._embedded?.tags ?? []).map((t) => t.name);
  return {
    manualOverrideUnitId: manualOverrideUnitId ?? null,
    customFields,
    tags,
    pipelineId: lead.pipeline_id,
  };
}
