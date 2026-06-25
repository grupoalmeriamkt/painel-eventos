import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { KommoClient, epochToISO } from "./client";
import { buildUnitSignals, extractLeadFields } from "./mappers";
import { resolveUnit } from "@/domain/unit-resolution";
import {
  loadFieldMap,
  loadStageCategoryMap,
} from "@/lib/config";
import type {
  StageCategory,
  UnitMappingRule,
} from "@/lib/supabase/database.types";
import type { KommoLead } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

interface SyncContext {
  db: Admin;
  client: KommoClient;
  connectionId: string;
  /** kommo_stage_id -> { stageUuid, pipelineUuid } */
  stageRef: Map<number, { stageUuid: string; pipelineUuid: string }>;
  /** kommo_stage_id -> categoria interna */
  categoryByStage: Map<number, StageCategory>;
  unitRules: UnitMappingRule[];
  unitFieldId: number | undefined;
  fieldMap: Awaited<ReturnType<typeof loadFieldMap>>;
  pipelineIds: number[];
}

export interface SyncStats {
  read: number;
  created: number;
  updated: number;
  failed: number;
  historyInserted: number;
  issuesCreated: number;
}

/** Sincroniza estrutura: pipelines + stages do Kommo → catálogo local. */
export async function syncStructure(
  db: Admin,
  client: KommoClient,
  connectionId: string,
): Promise<void> {
  const pipelines = await client.getPipelines();
  for (const p of pipelines) {
    const { data: pipeRow } = await db
      .from("kommo_pipelines")
      .upsert(
        {
          connection_id: connectionId,
          kommo_pipeline_id: p.id,
          name: p.name,
          raw_payload: p as unknown as import("@/lib/supabase/database.types").Json,
        },
        { onConflict: "connection_id,kommo_pipeline_id" },
      )
      .select("id")
      .single();

    const pipelineUuid = pipeRow?.id;
    if (!pipelineUuid) continue;

    const statuses = p._embedded?.statuses ?? [];
    for (const s of statuses) {
      await db.from("kommo_stages").upsert(
        {
          pipeline_id: pipelineUuid,
          kommo_stage_id: s.id,
          name: s.name,
          sort_order: s.sort,
          is_system_stage: !s.is_editable,
          raw_payload: s as unknown as import("@/lib/supabase/database.types").Json,
        },
        { onConflict: "pipeline_id,kommo_stage_id" },
      );
    }
  }
}

async function buildContext(
  db: Admin,
  client: KommoClient,
  opts: { pipelineIds?: number[] },
): Promise<SyncContext> {
  const { data: conn } = await db
    .from("crm_connections")
    .select("id")
    .eq("provider", "kommo")
    .limit(1)
    .single();
  const connectionId = conn!.id;

  // referências de stage (kommo_stage_id -> uuids)
  const { data: stages } = await db
    .from("kommo_stages")
    .select("id, kommo_stage_id, pipeline_id");
  const stageRef = new Map<number, { stageUuid: string; pipelineUuid: string }>();
  for (const s of stages ?? []) {
    stageRef.set(s.kommo_stage_id, { stageUuid: s.id, pipelineUuid: s.pipeline_id! });
  }

  const categoryByStage = await loadStageCategoryMap(db);
  const fieldMap = await loadFieldMap(db);

  const { data: rules } = await db.from("unit_mapping_rules").select("*").eq("is_active", true);
  const unitFieldId = fieldMap.get("unit");

  // pipelines de eventos: os explicitamente ativos, ou todos
  let pipelineIds = opts.pipelineIds ?? [];
  if (pipelineIds.length === 0) {
    const { data: pipes } = await db
      .from("kommo_pipelines")
      .select("kommo_pipeline_id")
      .eq("is_active", true);
    pipelineIds = (pipes ?? []).map((p) => p.kommo_pipeline_id);
  }

  return {
    db,
    client,
    connectionId,
    stageRef,
    categoryByStage,
    unitRules: (rules ?? []) as UnitMappingRule[],
    unitFieldId,
    fieldMap,
    pipelineIds,
  };
}

async function upsertOneLead(ctx: SyncContext, lead: KommoLead, stats: SyncStats): Promise<void> {
  const { db } = ctx;
  const fields = extractLeadFields(lead, ctx.fieldMap);
  const signals = buildUnitSignals(lead, ctx.unitFieldId);
  const unit = resolveUnit(ctx.unitRules, signals);
  const category = ctx.categoryByStage.get(lead.status_id) ?? null;
  const ref = ctx.stageRef.get(lead.status_id);

  // estado anterior (para detectar transição)
  const { data: existing } = await db
    .from("leads")
    .select("id, stage_category, stage_id, unit_id, event_date, current_value")
    .eq("connection_id", ctx.connectionId)
    .eq("kommo_lead_id", lead.id)
    .maybeSingle();

  const nowISO = new Date().toISOString();
  const row = {
    connection_id: ctx.connectionId,
    kommo_lead_id: lead.id,
    name: lead.name,
    pipeline_id: ref?.pipelineUuid ?? null,
    stage_id: ref?.stageUuid ?? null,
    stage_category: category,
    unit_id: unit.unitId,
    unit_resolution_method: unit.method,
    unit_resolution_confidence: unit.confidence,
    responsible_user_id: lead.responsible_user_id,
    current_value: lead.price ?? 0,
    created_at_kommo: epochToISO(lead.created_at),
    updated_at_kommo: epochToISO(lead.updated_at),
    closed_at_kommo: epochToISO(lead.closed_at),
    deleted_at_kommo: lead.is_deleted ? nowISO : null,
    event_date: fields.eventDate,
    event_start_time: fields.eventStartTime,
    event_end_time: fields.eventEndTime,
    guest_count: fields.guestCount,
    event_type: fields.eventType,
    event_space: fields.eventSpace,
    lead_source: fields.leadSource,
    loss_reason: fields.lossReason,
    custom_fields_raw: (lead.custom_fields_values ?? []) as unknown as import("@/lib/supabase/database.types").Json,
    raw_payload: lead as unknown as import("@/lib/supabase/database.types").Json,
    synced_at: nowISO,
  };

  const { data: upserted, error } = await db
    .from("leads")
    .upsert(row, { onConflict: "connection_id,kommo_lead_id" })
    .select("id")
    .single();

  if (error || !upserted) {
    stats.failed += 1;
    return;
  }
  if (existing) stats.updated += 1;
  else stats.created += 1;

  const leadUuid = upserted.id;

  // transição de etapa: nova entrada ou mudança de categoria/etapa/pipeline
  const categoryChanged = !existing || existing.stage_category !== category;
  const stageChanged = !existing || existing.stage_id !== (ref?.stageUuid ?? null);
  if ((categoryChanged || stageChanged) && category) {
    const { error: histErr } = await db.from("lead_stage_history").insert({
      lead_id: leadUuid,
      kommo_lead_id: lead.id,
      from_category: existing?.stage_category ?? null,
      from_stage_id: existing?.stage_id ?? null,
      to_category: category,
      to_stage_id: ref?.stageUuid ?? null,
      to_pipeline_id: ref?.pipelineUuid ?? null,
      changed_at: epochToISO(lead.updated_at) ?? nowISO,
      lead_value_at_change: lead.price ?? 0,
      event_date_at_change: fields.eventDate,
      unit_id_at_change: unit.unitId,
      source: "sync",
    });
    if (!histErr) stats.historyInserted += 1;
  }

  // registros financeiros a partir de campos mapeados (idempotência simples por upsert manual)
  await syncFinancialRecords(ctx, leadUuid, fields);

  // qualidade de dados
  await flagDataQuality(ctx, leadUuid, { category, unit, fields });
}

async function syncFinancialRecords(
  ctx: SyncContext,
  leadUuid: string,
  fields: ReturnType<typeof extractLeadFields>,
): Promise<void> {
  const { db } = ctx;
  const records: {
    record_type: "proposal" | "contract" | "invoice" | "payment";
    amount: number;
    record_date: string | null;
  }[] = [];
  if (fields.proposalValue != null)
    records.push({ record_type: "proposal", amount: fields.proposalValue, record_date: fields.proposalSentAt });
  if (fields.contractValue != null)
    records.push({ record_type: "contract", amount: fields.contractValue, record_date: fields.contractSignedAt });
  if (fields.invoicedValue != null)
    records.push({ record_type: "invoice", amount: fields.invoicedValue, record_date: fields.invoiceIssuedAt });
  if (fields.receivedValue != null)
    records.push({ record_type: "payment", amount: fields.receivedValue, record_date: fields.paymentReceivedAt });

  for (const r of records) {
    // substitui o registro derivado do campo (1 por tipo, origem kommo)
    await db
      .from("lead_financial_records")
      .delete()
      .eq("lead_id", leadUuid)
      .eq("record_type", r.record_type)
      .eq("source", "kommo");
    await db.from("lead_financial_records").insert({
      lead_id: leadUuid,
      record_type: r.record_type,
      amount: r.amount,
      record_date: r.record_date,
      status: fields.paymentStatus,
      reference_number: fields.invoiceNumber,
      source: "kommo",
    });
  }
}

async function flagDataQuality(
  ctx: SyncContext,
  leadUuid: string,
  info: {
    category: StageCategory | null;
    unit: ReturnType<typeof resolveUnit>;
    fields: ReturnType<typeof extractLeadFields>;
  },
): Promise<void> {
  const { db } = ctx;
  const issues: { type: string; severity: "info" | "warning" | "critical"; message: string }[] = [];

  if (info.unit.method === "conflict")
    issues.push({ type: "unit_conflict", severity: "critical", message: "Regras de unidade conflitantes." });
  else if (!info.unit.unitId)
    issues.push({ type: "missing_unit", severity: "warning", message: "Lead sem unidade identificada." });

  if (!info.category)
    issues.push({ type: "missing_stage_mapping", severity: "warning", message: "Etapa do Kommo sem categoria mapeada." });
  if (!info.fields.eventDate)
    issues.push({ type: "missing_event_date", severity: "info", message: "Lead sem data de evento." });
  if (!info.fields.leadSource)
    issues.push({ type: "missing_source", severity: "info", message: "Lead sem origem." });

  for (const i of issues) {
    // uq_dq_open evita duplicar problema aberto por lead+tipo
    await db
      .from("data_quality_issues")
      .upsert(
        { lead_id: leadUuid, issue_type: i.type, severity: i.severity, status: "open", message: i.message },
        { onConflict: "lead_id,issue_type", ignoreDuplicates: true },
      );
  }
}

/** Executa sincronização e registra em sync_runs. */
export async function runSync(opts: {
  type: "backfill" | "incremental";
  /** epoch seconds; default = últimas 2h p/ incremental */
  updatedFrom?: number;
  pipelineIds?: number[];
}): Promise<SyncStats> {
  const db = createAdminClient();
  const client = new KommoClient();

  const { data: run } = await db
    .from("sync_runs")
    .insert({ sync_type: opts.type, status: "running" })
    .select("id, connection_id")
    .single();
  const runId = run?.id;

  const stats: SyncStats = { read: 0, created: 0, updated: 0, failed: 0, historyInserted: 0, issuesCreated: 0 };

  try {
    if (opts.type === "backfill") await syncStructure(db, client, (await connId(db)));
    const ctx = await buildContext(db, client, { pipelineIds: opts.pipelineIds });

    // watermark com janela de sobreposição de 10min p/ incremental
    const updatedFrom =
      opts.type === "incremental"
        ? (opts.updatedFrom ?? Math.floor(Date.now() / 1000) - 2 * 3600) - 600
        : undefined;

    for await (const lead of client.streamLeads({ updatedFrom, pipelineIds: ctx.pipelineIds })) {
      stats.read += 1;
      await upsertOneLead(ctx, lead, stats);
    }

    if (runId) {
      await db
        .from("sync_runs")
        .update({
          status: stats.failed > 0 ? "partial" : "success",
          finished_at: new Date().toISOString(),
          records_read: stats.read,
          records_created: stats.created,
          records_updated: stats.updated,
          records_failed: stats.failed,
          cursor_after: String(Math.floor(Date.now() / 1000)),
          metadata: stats as unknown as import("@/lib/supabase/database.types").Json,
        })
        .eq("id", runId);
      await db
        .from("crm_connections")
        .update({ last_successful_sync_at: new Date().toISOString() })
        .eq("provider", "kommo");
    }
    return stats;
  } catch (err) {
    if (runId) {
      await db
        .from("sync_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_summary: String(err),
          metadata: stats as unknown as import("@/lib/supabase/database.types").Json,
        })
        .eq("id", runId);
    }
    throw err;
  }
}

async function connId(db: Admin): Promise<string> {
  const { data } = await db
    .from("crm_connections")
    .select("id")
    .eq("provider", "kommo")
    .limit(1)
    .single();
  return data!.id;
}

/**
 * Busca a versão atual de cada lead no Kommo e atualiza localmente.
 * Usado pelo processamento de webhook (o payload pode não trazer tudo).
 */
export async function syncLeadsByIds(ids: number[]): Promise<SyncStats> {
  const db = createAdminClient();
  const client = new KommoClient();
  const ctx = await buildContext(db, client, {});
  const stats: SyncStats = { read: 0, created: 0, updated: 0, failed: 0, historyInserted: 0, issuesCreated: 0 };

  for (const id of [...new Set(ids)]) {
    const lead = await client.getLead(id);
    if (!lead) continue;
    stats.read += 1;
    await upsertOneLead(ctx, lead, stats);
  }
  return stats;
}

/**
 * Processa eventos de webhook pendentes de forma idempotente.
 * Para add/update/status: rebusca o lead no Kommo e faz upsert.
 * Para delete: marca deleted_at_kommo (exclusão explícita, sem hard delete).
 */
export async function processPendingWebhooks(limit = 100): Promise<{ processed: number }> {
  const db = createAdminClient();
  const { parseFormEncoded, extractLeadEvents } = await import("./webhook");

  const { data: events } = await db
    .from("crm_webhook_events")
    .select("id, payload, status")
    .in("status", ["received", "failed"])
    .order("received_at", { ascending: true })
    .limit(limit);

  const toFetch = new Set<number>();
  const toDelete = new Set<number>();
  const ids: string[] = [];

  for (const ev of events ?? []) {
    ids.push(ev.id);
    const raw = (ev.payload as { raw?: string }).raw ?? "";
    const leadEvents = extractLeadEvents(parseFormEncoded(raw));
    for (const le of leadEvents) {
      if (le.type === "delete") toDelete.add(le.leadId);
      else toFetch.add(le.leadId);
    }
  }

  if (ids.length === 0) return { processed: 0 };

  await db
    .from("crm_webhook_events")
    .update({ status: "processing", processing_started_at: new Date().toISOString() })
    .in("id", ids);

  try {
    if (toFetch.size > 0) await syncLeadsByIds([...toFetch]);
    if (toDelete.size > 0) {
      await db
        .from("leads")
        .update({ deleted_at_kommo: new Date().toISOString() })
        .in("kommo_lead_id", [...toDelete]);
    }
    await db
      .from("crm_webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .in("id", ids);
  } catch (err) {
    await db
      .from("crm_webhook_events")
      .update({ status: "failed", last_error: String(err) })
      .in("id", ids);
    throw err;
  }

  return { processed: ids.length };
}
