# graph-web-researcher — Product Requirements Document

## Purpose
Single-purpose remote subgraph that decomposes a topic query into parallel search threads, executes web searches via Tavily MCP, deduplicates and cross-references findings, then synthesizes a structured summary with source citations. Called by `graph-daily-briefing` and `graph-monitor-alert`. Also usable standalone as a research primitive.

## Deployment
- Deployed on LangSmith Deployment as `webResearcher`
- `langgraph.json`: `{ "graphs": { "webResearcher": "./src/graph.ts:graph" } }`

## Pipeline
```
START → decomposeQuery → [parallel search branches] → mergeFindings → deduplicateFindings → synthesizeSummary → END
```

### Node Responsibilities

**`decomposeQuery`** (fastModel)
- Break `topic` into 3–5 targeted search queries covering different angles
- Apply `timeframe` filter to queries if provided (e.g. append `after:2026-01-01`)
- Output: `searchQueries: string[]`

**`[parallel search branches]`** (Send API fan-out)
- Each query dispatched via `Send('searchBranch', { query })` to a `searchBranch` node
- `searchBranch` calls Tavily MCP `search` tool: returns `title`, `url`, `content`, `score`
- Merge results back into `rawResults: SearchResult[]`

**`mergeFindings`**
- Collect all `rawResults` from parallel branches
- Normalize: trim whitespace, remove empty results, cap content at 2000 chars per result
- Output: `normalizedResults: SearchResult[]`

**`deduplicateFindings`** (fastModel)
- Remove results with > 80% URL domain overlap
- Identify and merge results making the same claim from different sources
- Rank by `score` descending, cap at `maxSources`
- Output: `dedupedResults: SearchResult[]`, `sourceUrls: string[]`

**`synthesizeSummary`** (reasoningModel)
- Synthesize `dedupedResults` into a structured `synthesis` with:
  - `headline`: one-sentence summary of the most significant finding
  - `keyPoints: string[]`: 3–7 bullet points
  - `sentiment`: `positive | neutral | negative | mixed`
  - `confidence`: 0–1 based on source agreement
- Inline citations from `sourceUrls`
- Output: `synthesis`, `findings: string[]`, `confidence`

## State Schema
```ts
{
  topic: string;
  timeframe?: string;
  maxSources: number; // default 8

  searchQueries: string[];
  rawResults: SearchResult[];
  normalizedResults: SearchResult[];
  dedupedResults: SearchResult[];
  sourceUrls: string[];

  synthesis: { headline: string; keyPoints: string[]; sentiment: string; confidence: number };
  findings: string[];

  error?: string;
  phase: string;
}
```

## MCP Tools
- Tavily MCP server: `search` tool — `{ query: string, max_results: number, include_domains?: string[] }`
- Wire via `MultiServerMCPClient` in `src/search.ts` (follow `graph-ux-research` pattern)

## Models
- `fastModel` — query decomposition, deduplication
- `reasoningModel` — synthesis (needs multi-source reasoning)

## Environment Variables
```
TAVILY_API_KEY=
OPENROUTER_API_KEY=
LANGSMITH_API_KEY=
LANGSMITH_TRACING_V2=true
LANGSMITH_PROJECT=graph-web-researcher
DATABASE_URL=
```

## Agent Instructions
1. Use `Send` API for parallel search — do not run searches sequentially
2. `searchBranch` node must be added with `.addNode('searchBranch', ...)` and dispatched via `Send`
3. Implement `src/search.ts` following the `graph-ux-research` Tavily client pattern exactly
4. `synthesizeSummary` must use structured output with the exact shape defined above
5. The graph must handle Tavily rate limits gracefully — `standardRetry` on `searchBranch` is critical
6. Add a `topicHistory` field (optional) so callers can pass previous synthesis for diff-based monitoring
7. Write tests with mocked Tavily responses for 3 topic scenarios

## Acceptance Criteria
- `topic: 'LangGraph platform updates'` returns ≥ 5 deduplicated findings with source URLs
- Parallel search completes in < 8 seconds for 4 queries
- `synthesis.keyPoints` contains 3–7 items
- LangSmith trace shows parallel `searchBranch` nodes executing concurrently
