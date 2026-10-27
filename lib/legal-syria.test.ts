import { describe, expect, it } from "vitest";
import { isOfficialSyriaSource, SYRIA_COURT_LEVEL_SUGGESTIONS, SYRIA_GOVERNORATE_SUGGESTIONS } from "./legal-syria";

describe("editable Syria legal hints", () => {
  it("labels only known government domains as official-looking references", () => {
    expect(isOfficialSyriaSource("https://moj.gov.sy/" )).toBe(true);
    expect(isOfficialSyriaSource("https://laws.moct.gov.sy/" )).toBe(true);
    expect(isOfficialSyriaSource("https://moj.gov.sy.example.org/" )).toBe(false);
    expect(isOfficialSyriaSource("not a URL")).toBe(false);
  });

  it("includes common court levels and all governorates as editable suggestions", () => {
    expect(SYRIA_COURT_LEVEL_SUGGESTIONS).toEqual(expect.arrayContaining(["صلح", "بداية", "استئناف", "نقض"]));
    expect(SYRIA_GOVERNORATE_SUGGESTIONS).toHaveLength(14);
  });
});
