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

// Filter a raw input string down to a valid money-entry draft string.
// Keeps digits and a single separator (, or .), truncates fractional part to 2 digits,
// and strips everything else. Returns the cleaned string (may be empty or end on a
// trailing separator while the user is still typing). Feed the result straight into
// an input's `value`.
export function filterMoneyInput(raw: string): string {
  if (raw == null) return "";
  // Keep digits, commas, dots
  let s = String(raw).replace(/[^0-9.,]/g, "");
  // Find the first separator, drop any further commas/dots entirely
  const firstSep = s.search(/[.,]/);
  if (firstSep !== -1) {
    const sep = s[firstSep];
    const head = s.slice(0, firstSep);
    const tail = s.slice(firstSep + 1).replace(/[.,]/g, "");
    s = head + sep + tail.slice(0, 2);
  }
  return s;
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
