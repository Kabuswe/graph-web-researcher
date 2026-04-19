/**
 * mergeFindings — collects parallel search branch results and normalizes them.
 * After Send() fan-out, each branch appended to rawResults. This node consolidates.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mergeFindingsNode = async (state: any) => {
  const raw: unknown[] = Array.isArray(state.rawResults) ? state.rawResults : [];

  // Results are already normalized in searchBranch, just ensure no duplicates by URL
  const seen = new Set<string>();
  const normalized = raw.filter((r: unknown) => {
    const item = r as Record<string, unknown>;
    const url = String(item.url ?? "");
    if (seen.has(url) || !url) return false;
    seen.add(url);
    return true;
  });

  return {
    phase: "merge-findings",
    normalizedResults: normalized,
  };
};
