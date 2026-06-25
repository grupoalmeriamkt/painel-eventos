import { z } from "zod";

/**
 * Validação de variáveis de ambiente.
 *
 * - Variáveis públicas (NEXT_PUBLIC_*) são seguras para o browser.
 * - Variáveis privadas (service role, token Kommo, segredos) NUNCA podem
 *   ser importadas em código que roda no cliente. Este módulo lança erro
 *   se `serverEnv` for acessado no browser.
 *
 * Credenciais do Kommo são opcionais no schema para permitir build/deploy
 * antes da conexão. Use `getKommoConfig()` no ponto de uso — ele lança um
 * erro claro se algo estiver faltando quando a integração for de fato usada.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

type PublicEnv = z.infer<typeof publicSchema>;
let cachedPublic: PublicEnv | null = null;

/**
 * Variáveis públicas (NEXT_PUBLIC_*), validadas de forma preguiçosa para não
 * quebrar o build quando ainda não configuradas. Seguras para o cliente.
 */
export function getPublicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  cachedPublic = publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return cachedPublic;
}

const serverSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_DB_SCHEMA: z.string().min(1).default("eventos"),

  KOMMO_SUBDOMAIN: z.string().min(1).optional(),
  KOMMO_API_BASE_URL: z.string().url().optional(),
  KOMMO_LONG_LIVED_TOKEN: z.string().min(1).optional(),
  KOMMO_WEBHOOK_SECRET: z.string().min(1).optional(),

  CRON_SECRET: z.string().min(1).optional(),
  SENTRY_DSN: z.string().url().optional(),
  BUSINESS_TIMEZONE: z.string().min(1).default("America/Sao_Paulo"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/** Lê e valida as variáveis privadas. Lança erro se chamado no browser. */
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverEnv() foi acessado no cliente. Variáveis privadas não podem ir para o browser.",
    );
  }
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export interface KommoConfig {
  subdomain: string;
  baseUrl: string;
  token: string;
  webhookSecret: string;
}

/** Configuração do Kommo com erro claro quando ainda não conectado. */
export function getKommoConfig(): KommoConfig {
  const env = serverEnv();
  const missing: string[] = [];
  if (!env.KOMMO_SUBDOMAIN) missing.push("KOMMO_SUBDOMAIN");
  if (!env.KOMMO_LONG_LIVED_TOKEN) missing.push("KOMMO_LONG_LIVED_TOKEN");
  if (!env.KOMMO_WEBHOOK_SECRET) missing.push("KOMMO_WEBHOOK_SECRET");
  if (missing.length > 0) {
    throw new Error(
      `Kommo não configurado. Defina no .env.local: ${missing.join(", ")}.`,
    );
  }
  const baseUrl =
    env.KOMMO_API_BASE_URL ?? `https://${env.KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
  return {
    subdomain: env.KOMMO_SUBDOMAIN!,
    baseUrl,
    token: env.KOMMO_LONG_LIVED_TOKEN!,
    webhookSecret: env.KOMMO_WEBHOOK_SECRET!,
  };
}

export function isKommoConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.KOMMO_SUBDOMAIN && env.KOMMO_LONG_LIVED_TOKEN);
}
