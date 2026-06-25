import { serverEnv } from "@/lib/env";

/**
 * Valida a chamada de cron. A Vercel envia `Authorization: Bearer <CRON_SECRET>`
 * nas rotas de cron quando CRON_SECRET está definido. Também aceita o header
 * em chamadas manuais autorizadas.
 */
export function isAuthorizedCron(req: Request): boolean {
  const env = serverEnv();
  if (!env.CRON_SECRET) return false; // sem segredo configurado: bloqueia
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${env.CRON_SECRET}`;
}
