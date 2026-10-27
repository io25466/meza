import { describe, expect, it } from "vitest";
import { normalizeAppData } from "./models";

describe("encrypted vault data migration", () => {
  it("adds new empty collections while retaining older records", () => {
    const migrated = normalizeAppData({
      clients: [{ id: "c1", name: "موكل", phone: "", createdAt: "2026-01-01" }],
      cases: [], payments: [], appointments: [], powers: [], files: [], articles: [], lawSources: [], currency: "د.أ",
    });
    expect(migrated.clients).toHaveLength(1);
    expect(migrated.currency).toBe("د.أ");
    expect(migrated.tasks).toEqual([]);
    expect(migrated.templates).toEqual([]);
    expect(migrated.expenses).toEqual([]);
    expect(migrated.lawyerName).toBe("");
  });

  it("defaults an older vault without a currency value to the Syrian new pound", () => {
    const migrated = normalizeAppData({ clients: [], cases: [] });
    expect(migrated.currency).toBe("ل.س (جديدة)");
    expect(migrated.jurisdiction).toBe("SY");
  });
});
