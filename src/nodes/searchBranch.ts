/**
 * searchBranch — executes a single Tavily search query. Invoked in parallel via Send().
 */
import { createSearchTool } from "../search.js";

const searchTool = createSearchTool("tavily");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const searchBranchNode = async (state: any) => {
  const query: string = state.query ?? "";

  let raw: unknown;
  try {
    raw = await searchTool.invoke({ query });
  } catch (err) {
    console.warn(`[searchBranch] Tavily error for "${query}":`, (err as Error).message);
    return { rawResults: [] };
  }

  let results: unknown[] = [];
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    results = Array.isArray(parsed) ? parsed : (parsed.results ?? []);
  } catch {
    results = [];
  }

  // Normalize each result into a consistent shape
  const normalized = results.map((r: unknown) => {
    const item = r as Record<string, unknown>;
    return {
      title:          String(item.title ?? ""),
      url:            String(item.url ?? ""),
      snippet:        String(item.content ?? item.snippet ?? ""),
      relevanceScore: typeof item.score === "number" ? item.score : 0,
      query,
    };
  });

  return { rawResults: normalized };
};
