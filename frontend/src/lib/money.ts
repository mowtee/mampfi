// Parse a localized money string in major units into minor units (integer cents)
// Accepts both comma and dot as decimal separator, and ignores typical thousand separators.
// Examples:
//  - "1,23" -> 123
//  - "1.23" -> 123
//  - "1.234,56" -> 123456
//  - "1,234.56" -> 123456
export function parseMoneyToMinor(input: string): number {
  if (input == null) return NaN;
  let s = String(input).trim();
  if (s === "") return NaN;
  // Remove spaces and apostrophes commonly used as thousand separators
  s = s.replace(/[\s']/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let decimalSep: "," | "." | null = null;

  if (hasComma && hasDot) {
    // Choose the last separator as the decimal separator
    decimalSep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
  } else if (hasComma) {
    decimalSep = ",";
  } else if (hasDot) {
    decimalSep = ".";
  } else {
    decimalSep = null;
  }

  let normalized = s;
  if (decimalSep === ",") {
    // Remove dots as thousand separators and replace comma with dot
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (decimalSep === ".") {
    // Remove commas as thousand separators
    normalized = normalized.replace(/,/g, "");
  }

  const num = Number(normalized);
  if (!isFinite(num)) return NaN;
  return Math.round(num * 100);
}

// Format minor units (integer cents) with Intl.NumberFormat to a currency string
// Example: formatMoney(1234, 'EUR') -> "€12.34" (locale-dependent symbol/placement)
export function formatMoney(minor: number, currency: string, locale?: string): string {
  const nf = new Intl.NumberFormat(locale || undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return nf.format(Number(minor || 0) / 100);
}
