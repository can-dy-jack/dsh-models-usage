/** Tiny runtime guards shared by both halves (bundled into each output). */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
