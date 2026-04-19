import { StructuredTool } from "@langchain/core/tools";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";

export type SearchProvider = "tavily";

/** Minimum Tavily score (0–1) a result must meet to be kept. */
const TAVILY_SCORE_THRESHOLD = 0.5;

/**
 * Thin wrapper around TavilySearch that drops results below TAVILY_SCORE_THRESHOLD.
 * TavilySearch returns a JSON string; we parse → filter → re-serialize.
 */
class FilteredTavilySearch extends StructuredTool {
  name = "tavily_search";
  description = "Search the web using Tavily (score-filtered)";
  schema = z.object({ query: z.string() });

  private inner: TavilySearch;
  constructor(inner: TavilySearch) {
    super();
    this.inner = inner;
  }

  async _call(
    input: z.infer<typeof this.schema>,
    _runManager?: unknown,
    _config?: RunnableConfig,
  ): Promise<string> {
    const raw = await this.inner.invoke(input);
    try {
      const parsed = JSON.parse(raw);
      const results: unknown[] = Array.isArray(parsed) ? parsed : (parsed.results ?? []);
      const images: unknown[]  = Array.isArray(parsed) ? [] : (parsed.images ?? []);

      const filtered = results.filter((r: unknown) => {
        const score = (r as Record<string, unknown>).score;
        return typeof score === "number" && score >= TAVILY_SCORE_THRESHOLD;
      });

      const dropped = results.length - filtered.length;
      if (dropped > 0) {
        console.log(`[search] Tavily: kept ${filtered.length}/${results.length} results (dropped ${dropped} below ${TAVILY_SCORE_THRESHOLD} score)`);
      }

      if (Array.isArray(parsed)) return JSON.stringify(filtered);
      return JSON.stringify({ ...parsed, results: filtered, images });
    } catch {
      return raw;
    }
  }
}

/**
 * Returns the Tavily search tool (score-filtered).
 */
export function createSearchTool(
  _provider: SearchProvider = "tavily",
  options: { includeImages?: boolean } = {}
): StructuredTool {
  const inner = new TavilySearch({
    maxResults: 5,
    includeImages: options.includeImages ?? false,
    includeImageDescriptions: options.includeImages ?? false,
  });

  return new FilteredTavilySearch(inner);
}
