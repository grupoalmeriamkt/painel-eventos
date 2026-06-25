import Link from "next/link";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, ExternalLink, Users, Clock, MapPin } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { MetricCard, Panel } from "@/components/dashboard/primitives";
import { getAgenda, type AgendaEvent } from "@/lib/queries/agenda";
import { serverEnv } from "@/lib/env";
import { CATEGORY_LABELS } from "@/domain/categories";
import { formatBRL, formatInt } from "@/lib/format";
import { BUSINESS_TZ } from "@/lib/time";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** "quinta-feira, 3 de julho" a partir de "yyyy-MM-dd". */
function longDate(key: string): string {
  const dt = DateTime.fromISO(key, { zone: BUSINESS_TZ }).setLocale("pt-BR");
  if (!dt.isValid) return key;
  return dt.toFormat("cccc, d 'de' LLLL");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function EventRow({ e, subdomain }: { e: AgendaEvent; subdomain: string }) {
  return (
    <div className="flex items-start gap-3 rounded-sm border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-muted-foreground/40">
      <div className="flex w-12 shrink-0 flex-col items-start">
        <span className="flex items-center gap-1 font-mono text-sm tabular-nums">
          <Clock className="size-3 text-muted-foreground" />
          {e.event_start_time ? e.event_start_time.slice(0, 5) : "—"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{e.name ?? "—"}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: e.unit_color ?? "var(--color-muted-foreground)" }}
              aria-hidden
            />
            {e.unit_name ?? <span className="text-warning">sem unidade</span>}
          </span>
          <span>{e.event_type ?? "—"}</span>
          {e.event_space && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {e.event_space}
            </span>
          )}
          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
            <Users className="size-3" />
            {e.guest_count ?? "—"}
          </span>
          {e.stage_category && (
            <span className="rounded-sm bg-secondary/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">
              {CATEGORY_LABELS[e.stage_category]}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono text-sm tabular-nums">{formatBRL(e.current_value)}</span>
        <a
          href={`https://${subdomain}.kommo.com/leads/detail/${e.kommo_lead_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-info hover:underline"
          aria-label="Abrir no Kommo"
        >
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const mes = pick(sp.mes) ?? undefined;
  const view = pick(sp.v) === "lista" ? "lista" : "mes";

  const a = await getAgenda({ mes });
  const subdomain = serverEnv().KOMMO_SUBDOMAIN ?? "";

  const href = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | null> = {
      mes: a.mes,
      v: view === "mes" ? null : view,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return `/agenda${s ? `?${s}` : ""}`;
  };

  return (
    <AppShell
      title="Agenda"
      subtitle="Calendário de eventos agendados"
      actions={
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {formatInt(a.totalCount)} eventos
        </span>
      }
    >
      {/* Navegação de mês + toggle de visão */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={href({ mes: a.mesAnterior })}
            className="rounded-sm border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-[7.5rem] text-center font-mono text-sm font-medium tabular-nums">
            {capitalize(a.mesLabel)}
          </span>
          <Link
            href={href({ mes: a.mesProximo })}
            className="rounded-sm border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>

        <span className="mx-1 h-5 w-px bg-border" />

        <div className="flex items-center gap-1">
          {[
            { key: "mes", label: "Calendário" },
            { key: "lista", label: "Lista" },
          ].map((t) => (
            <Link
              key={t.key}
              href={href({ v: t.key })}
              className={cn(
                "rounded-sm border px-2.5 py-1 text-xs transition-colors",
                view === t.key
                  ? "border-info/40 bg-info/10 text-info"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Cards-resumo */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <MetricCard label="Eventos no mês" value={a.totalCount} kind="int" tone="info" />
        <MetricCard label="Valor total" value={a.totalValue} kind="money" tone="success" />
        <MetricCard
          label="Sem unidade"
          value={a.semUnidade}
          kind="int"
          tone={a.semUnidade > 0 ? "warning" : "muted"}
          context={a.semUnidade > 0 ? "exigem atenção" : undefined}
        />
      </div>

      {view === "mes" ? (
        <Panel>
          {/* Cabeçalho de dias da semana */}
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="px-1 py-1.5 text-center font-mono text-[9px] uppercase tracking-wider text-muted-foreground sm:text-[10px]"
              >
                {d}
              </div>
            ))}
          </div>
          {/* Grade do mês */}
          <div className="grid grid-cols-7">
            {a.weeks.flat().map((day) => {
              const hasEvents = day.count > 0;
              return (
                <div
                  key={day.date}
                  className={cn(
                    "min-h-[3.5rem] border-b border-r border-border/50 p-1 last:border-r-0 sm:min-h-[6rem] sm:p-1.5",
                    !day.inMonth && "opacity-35",
                    hasEvents && day.inMonth && "bg-info/[0.04]",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex size-5 items-center justify-center rounded-sm font-mono text-[11px] tabular-nums sm:text-xs",
                        day.isToday
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground",
                      )}
                    >
                      {day.dayNum}
                    </span>
                    {hasEvents && (
                      <span className="font-mono text-[10px] font-semibold tabular-nums text-info sm:hidden">
                        {day.count}
                      </span>
                    )}
                  </div>

                  {hasEvents && (
                    <>
                      {/* Mobile: apenas um ponto/contagem (já mostrado acima) */}
                      <div className="mt-1 hidden flex-col gap-0.5 sm:flex">
                        {day.events.slice(0, 3).map((e) => (
                          <div
                            key={e.id}
                            className="flex items-center gap-1 truncate rounded-sm bg-card px-1 py-0.5 text-[10px] leading-tight"
                          >
                            <span
                              className="size-1.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  e.unit_color ?? "var(--color-muted-foreground)",
                              }}
                              aria-hidden
                            />
                            <span className="truncate text-muted-foreground">
                              {e.event_start_time ? e.event_start_time.slice(0, 5) + " " : ""}
                              {e.name ?? "—"}
                            </span>
                          </div>
                        ))}
                        {day.count > 3 && (
                          <span className="px-1 text-[10px] text-muted-foreground">
                            +{day.count - 3}
                          </span>
                        )}
                      </div>
                      {/* Valor total do dia */}
                      <div className="mt-0.5 hidden font-mono text-[9px] tabular-nums text-success/80 sm:block">
                        {formatBRL(day.valueSum)}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      ) : a.days.length === 0 ? (
        <Panel>
          <div className="px-3 py-10 text-center text-muted-foreground">
            Nenhum evento agendado em {capitalize(a.mesLabel)}.
          </div>
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {a.days.map((day) => (
            <div key={day.date}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3
                  className={cn(
                    "font-mono text-[11px] uppercase tracking-wider",
                    day.isToday ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {capitalize(longDate(day.date))}
                  {day.isToday && " · hoje"}
                </h3>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
                  {formatInt(day.count)} · {formatBRL(day.valueSum)}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {day.events.map((e) => (
                  <EventRow key={e.id} e={e} subdomain={subdomain} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
