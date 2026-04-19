import { describe, it, expect } from "vitest";
import { emailDateToDDMMYYYY } from "./email-date.js";

describe("emailDateToDDMMYYYY", () => {
  it("formats a midday IL date", () => {
    // 2026-04-19 12:00 UTC = 15:00 Asia/Jerusalem (DST)
    const d = new Date("2026-04-19T12:00:00Z");
    expect(emailDateToDDMMYYYY(d)).toBe("19/04/2026");
  });

  it("rolls forward across midnight in IL timezone", () => {
    // 2026-04-19 22:30 UTC = 2026-04-20 01:30 IL
    const d = new Date("2026-04-19T22:30:00Z");
    expect(emailDateToDDMMYYYY(d)).toBe("20/04/2026");
  });

  it("does NOT roll back when UTC midnight is still 'today' in IL", () => {
    // 2026-04-19 00:30 UTC = 2026-04-19 03:30 IL
    const d = new Date("2026-04-19T00:30:00Z");
    expect(emailDateToDDMMYYYY(d)).toBe("19/04/2026");
  });

  it("zero-pads single-digit days and months", () => {
    const d = new Date("2026-01-05T12:00:00Z");
    expect(emailDateToDDMMYYYY(d)).toBe("05/01/2026");
  });
});
