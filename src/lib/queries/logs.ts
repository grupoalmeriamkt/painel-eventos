import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RunStatus, WebhookStatus } from "@/lib/supabase/database.types";

export interface SyncRunRow {
  id: string;
  sync_type: string;
  status: RunStatus;
  records_read: number;
  records_created: number;
  records_updated: number;
  records_failed: number;
  started_at: string;
  finished_at: string | null;
  error_summary: string | null;
}

export interface WebhookRow {
  id: string;
  status: WebhookStatus;
  entity_type: string | null;
  entity_external_id: number | null;
  received_at: string;
  processed_at: string | null;
  last_error: string | null;
}

export interface QualityIssueCount {
  issue_type: string;
  count: number;
}

export interface AuditRow {
  id: string;
  action: string;
  entity_type: string | null;
  created_at: string;
}

export interface LogsView {
  syncRuns: SyncRunRow[];
  webhooks: WebhookRow[];
  qualityIssues: QualityIssueCount[];
  auditLogs: AuditRow[];
}

export async function getLogs(): Promise<LogsView> {
  const db = createAdminClient();

  const [syncRes, webhookRes, issuesRes, auditRes] = await Promise.all([
    db
      .from("sync_runs")
      .select(
        "id,sync_type,status,records_read,records_created,records_updated,records_failed,started_at,finished_at,error_summary",
      )
      .order("started_at", { ascending: false })
      .limit(30),
    db
      .from("crm_webhook_events")
      .select("id,status,entity_type,entity_external_id,received_at,processed_at,last_error")
      .order("received_at", { ascending: false })
      .limit(30),
    db
      .from("data_quality_issues")
      .select("issue_type")
      .eq("status", "open")
      .limit(2000),
    db
      .from("audit_logs")
      .select("id,action,entity_type,created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const counts = new Map<string, number>();
  for (const row of issuesRes.data ?? []) {
    counts.set(row.issue_type, (counts.get(row.issue_type) ?? 0) + 1);
  }
  const qualityIssues: QualityIssueCount[] = [...counts.entries()]
    .map(([issue_type, count]) => ({ issue_type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    syncRuns: syncRes.data ?? [],
    webhooks: webhookRes.data ?? [],
    qualityIssues,
    auditLogs: auditRes.data ?? [],
  };
}
