/**
 * Removes theoretical quantities from an open count before it crosses the API
 * boundary. Hiding the columns only in the UI is not a blind count because the
 * expected values would still be visible in the network response.
 */
export function redactOpenInventoryCount<T extends { status: string; lines?: unknown[] }>(
  count: T,
): unknown {
  if (count.status !== 'OPEN' || !count.lines) return count;

  return {
    ...count,
    lines: count.lines.map((line) => {
      if (line === null || typeof line !== 'object') return line;
      const visible = { ...(line as Record<string, unknown>) };
      delete visible.expectedBase;
      delete visible.differenceBase;
      return visible;
    }),
  };
}
