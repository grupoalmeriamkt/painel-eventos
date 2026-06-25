/**
 * Aritmética monetária segura para BRL.
 * Trabalha em centavos internamente para evitar drift de ponto flutuante;
 * o banco continua sendo a fonte de verdade (numeric(14,2)).
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Soma uma lista de valores em reais sem acumular erro de float. */
export function sumMoney(values: number[]): number {
  const cents = values.reduce((acc, v) => acc + Math.round(v * 100), 0);
  return cents / 100;
}
