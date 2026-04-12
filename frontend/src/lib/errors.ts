/**
 * Extract a human-readable message from an API error.
 * Handles the `HTTP NNN: {"detail": "..."}` format from our api.ts helper.
 */
export function errorMessage(err: unknown): string {
  const str = String(err);
  // Try to extract detail from "HTTP 4xx: {"detail":"..."}"
  const match = str.match(/HTTP \d+: (.+)/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]) as { detail?: string | { reason?: string } };
      if (typeof parsed.detail === "string") return parsed.detail;
      if (typeof parsed.detail === "object" && parsed.detail?.reason) return parsed.detail.reason;
    } catch {
      /* fall through */
    }
  }
  // Fallback: strip "Error: " prefix
  return str.replace(/^Error:\s*/, "");
}
