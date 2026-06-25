import { describe, it, expect } from "vitest";
import { parseFormEncoded, extractLeadEvents, payloadHash } from "./webhook";

describe("parseFormEncoded", () => {
  it("converte chaves aninhadas em objeto", () => {
    const body =
      "leads[status][0][id]=123&leads[status][0][status_id]=456&leads[status][0][pipeline_id]=789&account[subdomain]=minhaconta";
    const parsed = parseFormEncoded(body);
    const leads = parsed.leads as Record<string, Record<string, Record<string, string>>>;
    expect(leads.status!["0"]!.id).toBe("123");
    expect(leads.status!["0"]!.status_id).toBe("456");
    expect((parsed.account as Record<string, string>).subdomain).toBe("minhaconta");
  });
});

describe("extractLeadEvents", () => {
  it("extrai eventos de status, add, update e delete", () => {
    const body =
      "leads[add][0][id]=1&leads[status][0][id]=2&leads[status][0][status_id]=99&leads[update][0][id]=3&leads[delete][0][id]=4";
    const events = extractLeadEvents(parseFormEncoded(body));
    const byType = Object.fromEntries(events.map((e) => [e.type, e.leadId]));
    expect(byType.add).toBe(1);
    expect(byType.status).toBe(2);
    expect(byType.update).toBe(3);
    expect(byType.delete).toBe(4);
    expect(events).toHaveLength(4);
  });

  it("ignora payload sem leads", () => {
    expect(extractLeadEvents(parseFormEncoded("account[id]=1"))).toHaveLength(0);
  });
});

describe("payloadHash", () => {
  it("é determinístico e idempotente", () => {
    const a = payloadHash("leads[status][0][id]=1");
    const b = payloadHash("leads[status][0][id]=1");
    const c = payloadHash("leads[status][0][id]=2");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
