import "server-only";
import { getKommoConfig, type KommoConfig } from "@/lib/env";
import type {
  KommoCollection,
  KommoCustomFieldDef,
  KommoLead,
  KommoPipeline,
  KommoUser,
} from "./types";

/**
 * Cliente da API v4 do Kommo. SOMENTE backend.
 * - Auth: Authorization: Bearer <long-lived token>
 * - Base URL: https://<subdomain>.kommo.com/api/v4
 * - Retry exponencial em falhas transitórias e respeito a 429/Retry-After.
 * - Paginação completa via _links.next.
 * O token nunca é logado.
 */

export class KommoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "KommoError";
  }
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;
const PAGE_LIMIT = 250; // máximo da API v4

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class KommoClient {
  private readonly cfg: KommoConfig;

  constructor(cfg?: KommoConfig) {
    this.cfg = cfg ?? getKommoConfig();
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.cfg.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  /** Caminho relativo (ex.: "/leads?page=1") ou URL absoluta (paginação). */
  async request<T>(pathOrUrl: string, init?: RequestInit): Promise<T | null> {
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${this.cfg.baseUrl}${pathOrUrl}`;

    let attempt = 0;
    // retry exponencial p/ 429/5xx/erros de rede
    while (true) {
      attempt += 1;
      let res: Response;
      try {
        res = await fetch(url, { ...init, headers: { ...this.headers(), ...init?.headers } });
      } catch (err) {
        if (attempt > MAX_RETRIES) throw new KommoError(`Falha de rede: ${String(err)}`, 0);
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
        continue;
      }

      // 204 = sem conteúdo (ex.: página vazia)
      if (res.status === 204) return null;

      if (res.status === 429 || res.status >= 500) {
        if (attempt > MAX_RETRIES) {
          throw new KommoError(`Kommo ${res.status} após ${MAX_RETRIES} tentativas`, res.status);
        }
        const retryAfter = Number(res.headers.get("Retry-After"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : BASE_DELAY_MS * 2 ** (attempt - 1);
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          body = await res.text().catch(() => undefined);
        }
        throw new KommoError(`Kommo respondeu ${res.status}`, res.status, body);
      }

      if (res.status === 200) {
        return (await res.json()) as T;
      }
      return null;
    }
  }

  /**
   * Itera por todas as páginas de uma coleção, extraindo a chave de _embedded.
   * Ex.: paginate<KommoLead>("/leads?limit=250&with=...", "leads")
   */
  async *paginate<T>(
    firstPath: string,
    embeddedKey: string,
  ): AsyncGenerator<T, void, unknown> {
    let next: string | null = firstPath;
    while (next) {
      const page: KommoCollection<T> | null = await this.request<KommoCollection<T>>(next);
      if (!page) return;
      const items = page._embedded?.[embeddedKey] ?? [];
      for (const item of items) yield item;
      next = page._links?.next?.href ?? null;
    }
  }

  // ── Endpoints de alto nível ────────────────────────────────────────────────

  async testConnection(): Promise<KommoUser[]> {
    const data = await this.request<KommoCollection<KommoUser>>("/users?limit=1");
    return data?._embedded?.users ?? [];
  }

  async getPipelines(): Promise<KommoPipeline[]> {
    const data = await this.request<KommoCollection<KommoPipeline>>(
      "/leads/pipelines",
    );
    return data?._embedded?.pipelines ?? [];
  }

  async getCustomFields(): Promise<KommoCustomFieldDef[]> {
    const out: KommoCustomFieldDef[] = [];
    for await (const f of this.paginate<KommoCustomFieldDef>(
      `/leads/custom_fields?limit=${PAGE_LIMIT}`,
      "custom_fields",
    )) {
      out.push(f);
    }
    return out;
  }

  async getUsers(): Promise<KommoUser[]> {
    const out: KommoUser[] = [];
    for await (const u of this.paginate<KommoUser>(`/users?limit=${PAGE_LIMIT}`, "users")) {
      out.push(u);
    }
    return out;
  }

  /** Um lead específico, com tags. null se não existir/arquivado. */
  async getLead(id: number): Promise<KommoLead | null> {
    return this.request<KommoLead>(`/leads/${id}?with=contacts`);
  }

  /**
   * Stream de leads. Sem filtro = backfill completo. Com `updatedFrom`
   * (epoch seconds) = incremental por watermark de updated_at.
   * `pipelineIds` restringe ao(s) pipeline(s) de Eventos.
   */
  async *streamLeads(opts: {
    updatedFrom?: number;
    pipelineIds?: number[];
  } = {}): AsyncGenerator<KommoLead, void, unknown> {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_LIMIT));
    params.set("with", "contacts");
    if (opts.updatedFrom) params.set("filter[updated_at][from]", String(opts.updatedFrom));
    if (opts.pipelineIds?.length) {
      opts.pipelineIds.forEach((id, i) => params.set(`filter[pipeline_id][${i}]`, String(id)));
    }
    yield* this.paginate<KommoLead>(`/leads?${params.toString()}`, "leads");
  }
}

export function epochToISO(epochSeconds: number | null | undefined): string | null {
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000).toISOString();
}
