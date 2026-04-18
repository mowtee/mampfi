import { describe, expect, it } from "vitest";
import { filterMoneyInput, parseMoneyToMinor } from "../lib/money";

describe("filterMoneyInput", () => {
  it("keeps bare digits", () => {
    expect(filterMoneyInput("1234")).toBe("1234");
  });

  it("strips letters and symbols", () => {
    expect(filterMoneyInput("12a3")).toBe("123");
    expect(filterMoneyInput("€12.50")).toBe("12.50");
    expect(filterMoneyInput("1,50 EUR")).toBe("1,50");
  });

  it("strips leading negative sign", () => {
    expect(filterMoneyInput("-5")).toBe("5");
  });

  it("preserves the first separator", () => {
    expect(filterMoneyInput("1,50")).toBe("1,50");
    expect(filterMoneyInput("1.50")).toBe("1.50");
  });

  it("drops additional separators after the first", () => {
    expect(filterMoneyInput("1,2,3")).toBe("1,23");
    expect(filterMoneyInput("1.2.3")).toBe("1.23");
    expect(filterMoneyInput("1,2.3")).toBe("1,23");
  });

  it("truncates to two fractional digits", () => {
    expect(filterMoneyInput("1.234")).toBe("1.23");
    expect(filterMoneyInput("5,6789")).toBe("5,67");
  });

  it("allows empty and partial input while typing", () => {
    expect(filterMoneyInput("")).toBe("");
    expect(filterMoneyInput(",")).toBe(",");
    expect(filterMoneyInput("5,")).toBe("5,");
    expect(filterMoneyInput(",5")).toBe(",5");
  });

  it("strips whitespace", () => {
    expect(filterMoneyInput(" 1,50 ")).toBe("1,50");
    expect(filterMoneyInput("1 000,50")).toBe("1000,50");
  });

  it("handles null/undefined safely", () => {
    expect(filterMoneyInput(null as unknown as string)).toBe("");
    expect(filterMoneyInput(undefined as unknown as string)).toBe("");
  });
});

describe("filterMoneyInput → parseMoneyToMinor round trip", () => {
  it("never returns NaN for full numeric input", () => {
    const cases = ["0", "1", "1,50", "1.50", "12,34", "99.99", "1000"];
    for (const c of cases) {
      const filtered = filterMoneyInput(c);
      const minor = parseMoneyToMinor(filtered);
      expect(minor).not.toBeNaN();
    }
  });

  it("produces the same minor value for equivalent locale forms", () => {
    expect(parseMoneyToMinor(filterMoneyInput("1,50"))).toBe(150);
    expect(parseMoneyToMinor(filterMoneyInput("1.50"))).toBe(150);
  });
});
