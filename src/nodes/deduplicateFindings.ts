/**
 * deduplicateFindings — removes near-duplicate results by URL domain + title similarity.
 */

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deduplicateFindingsNode = async (state: any) => {
  const results: unknown[] = Array.isArray(state.normalizedResults) ? state.normalizedResults : [];

  // Sort by relevance score descending before dedup
  const sorted = [...results].sort((a: unknown, b: unknown) => {
    const aScore = (a as Record<string, unknown>).relevanceScore as number ?? 0;
    const bScore = (b as Record<string, unknown>).relevanceScore as number ?? 0;
    return bScore - aScore;
  });

  const seenDomains = new Map<string, number>();
  const seenTitles = new Set<string>();
  const MAX_PER_DOMAIN = 2;

  const deduped = sorted.filter((r: unknown) => {
    const item = r as Record<string, unknown>;
    const domain = domainOf(String(item.url ?? ""));
    const title = normalizeTitle(String(item.title ?? ""));

    if (seenTitles.has(title) && title.length > 10) return false;
    const domainCount = seenDomains.get(domain) ?? 0;
    if (domainCount >= MAX_PER_DOMAIN) return false;

    seenDomains.set(domain, domainCount + 1);
    if (title.length > 10) seenTitles.add(title);
    return true;
  });

  const sourceUrls = deduped.map((r: unknown) => String((r as Record<string, unknown>).url ?? "")).filter(Boolean);

  return {
    phase: "deduplicate",
    dedupedResults: deduped,
    sourceUrls,
  };
};
