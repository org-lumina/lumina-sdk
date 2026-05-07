// Snake_case → camelCase conversion for API responses.
//
// The Lumina API returns DB rows with snake_case keys (`policy_id`,
// `coverage_amount`, `tx_hash`, `created_at`) because those are the
// canonical Postgres column names. The SDK's `Policy` / `Bond` /
// `Listing` interfaces use camelCase to match the rest of the SDK.
// Rather than touch every API response shape, we normalize at the SDK
// boundary so callers always see camelCase.

export function snakeToCamelKey(key: string): string {
  // Match `_<lower-letter|digit>` and uppercase the captured char.
  // Leading underscores (e.g. `_internal`) are preserved as-is to
  // avoid mangling them into a leading capital.
  if (key.startsWith("_")) return key;
  return key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

/**
 * Recursively convert snake_case keys to camelCase. Arrays are mapped
 * element-wise; primitives, Dates, and nulls are returned as-is. Cycles
 * are not handled (API responses are always trees).
 */
export function snakeToCamel<T = unknown>(input: unknown): T {
  if (input === null || input === undefined) return input as T;
  if (Array.isArray(input)) {
    return input.map((item) => snakeToCamel(item)) as unknown as T;
  }
  if (input instanceof Date) return input as unknown as T;
  if (typeof input !== "object") return input as T;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[snakeToCamelKey(k)] = snakeToCamel(v);
  }
  return out as T;
}
