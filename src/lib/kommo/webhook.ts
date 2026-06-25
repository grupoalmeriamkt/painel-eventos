import { createHash } from "node:crypto";

/**
 * Parsing e normalização de webhooks do Kommo.
 *
 * O Kommo envia `application/x-www-form-urlencoded` com chaves aninhadas, ex.:
 *   leads[status][0][id]=123&leads[status][0][status_id]=456&account[subdomain]=x
 * Não há assinatura nativa — a segurança é o segredo no caminho da rota
 * (/api/kommo/webhook/<KOMMO_WEBHOOK_SECRET>) + HTTPS.
 */

type Nested = Record<string, unknown>;

/** Converte chave "a[b][0][c]" + valor numa estrutura aninhada. */
function assignNested(root: Nested, path: string[], value: string): void {
  let node: Nested = root;
  for (let i = 0; i < path.length; i++) {
    const key = path[i]!;
    const last = i === path.length - 1;
    if (last) {
      node[key] = value;
    } else {
      if (typeof node[key] !== "object" || node[key] === null) {
        node[key] = {};
      }
      node = node[key] as Nested;
    }
  }
}

export function parseFormEncoded(body: string): Nested {
  const root: Nested = {};
  const params = new URLSearchParams(body);
  for (const [rawKey, value] of params.entries()) {
    // "leads[status][0][id]" -> ["leads","status","0","id"]
    const path = rawKey
      .replace(/\]/g, "")
      .split("[")
      .filter((p) => p.length > 0);
    if (path.length === 0) continue;
    assignNested(root, path, value);
  }
  return root;
}

export type KommoWebhookEventType =
  | "add"
  | "update"
  | "status"
  | "delete"
  | "restore";

export interface KommoLeadEvent {
  type: KommoWebhookEventType;
  leadId: number;
  /** dados crus do evento (pode não conter todos os campos) */
  raw: Record<string, unknown>;
}

const LEAD_EVENT_KEYS: KommoWebhookEventType[] = [
  "add",
  "update",
  "status",
  "delete",
  "restore",
];

/** Extrai eventos de lead do payload já parseado. */
export function extractLeadEvents(parsed: Nested): KommoLeadEvent[] {
  const leads = parsed.leads as Record<string, unknown> | undefined;
  if (!leads) return [];

  const events: KommoLeadEvent[] = [];
  for (const type of LEAD_EVENT_KEYS) {
    const bucket = leads[type];
    if (!bucket || typeof bucket !== "object") continue;
    // bucket é { "0": {...}, "1": {...} }
    for (const item of Object.values(bucket as Record<string, unknown>)) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const id = Number(rec.id);
      if (!Number.isFinite(id)) continue;
      events.push({ type, leadId: id, raw: rec });
    }
  }
  return events;
}

/** Hash estável do payload bruto para idempotência (uq_webhook_payload_hash). */
export function payloadHash(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

/** Compara o segredo do caminho com o configurado, em tempo constante. */
export function verifyWebhookSecret(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
