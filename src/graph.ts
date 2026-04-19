/**
 * graph-web-researcher
 *
 * Pipeline: decomposeQuery â†’ [parallel searchBranch Ã— queries] â†’ mergeFindings â†’ deduplicateFindings â†’ synthesizeSummary
 *
 * Input:  WebResearcherInput  (topic, timeframe?, maxSources)
 * Output: WebResearcherOutput (synthesis, findings[], sourceUrls[])
 *
 * Implementation tracked in GitHub issues -- see repo Issues tab.
 */

import { StateGraph, START, END, MemorySaver, Annotation, Send } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import pg from 'pg';

// rawResults must use a concat reducer so parallel searchBranch fan-out nodes can each append
const ResearchState = Annotation.Root({
  topic:             Annotation<string>({ default: () => '', reducer: (_l, r) => r }),
  timeframe:         Annotation<string | undefined>({ default: () => undefined, reducer: (_l, r) => r }),
  maxSources:        Annotation<number>({ default: () => 8, reducer: (_l, r) => r }),
  searchQueries:     Annotation<string[]>({ default: () => [], reducer: (_l, r) => r }),
  rawResults:        Annotation<unknown[]>({ default: () => [], reducer: (l, r) => [...l, ...(Array.isArray(r) ? r : [r])] }),
  normalizedResults: Annotation<unknown[]>({ default: () => [], reducer: (_l, r) => r }),
  dedupedResults:    Annotation<unknown[]>({ default: () => [], reducer: (_l, r) => r }),
  sourceUrls:        Annotation<string[]>({ default: () => [], reducer: (_l, r) => r }),
  synthesis:         Annotation<unknown>({ default: () => undefined, reducer: (_l, r) => r }),
  findings:          Annotation<string[]>({ default: () => [], reducer: (_l, r) => r }),
  error:             Annotation<string | undefined>({ default: () => undefined, reducer: (_l, r) => r }),
  phase:             Annotation<string>({ default: () => '', reducer: (_l, r) => r }),
});

const standardRetry = { maxAttempts: 3, initialInterval: 1000, backoffFactor: 2 };

import { decomposeQueryNode }      from './nodes/decomposeQuery.js';
import { searchBranchNode }        from './nodes/searchBranch.js';
import { mergeFindingsNode }        from './nodes/mergeFindings.js';
import { deduplicateFindingsNode } from './nodes/deduplicateFindings.js';
import { synthesizeSummaryNode }   from './nodes/synthesizeSummary.js';

// Fan-out: dispatch one Send per query
const dispatchSearches = (s: any): Send[] =>
  (s.searchQueries as string[]).map(q => new Send('searchBranch', { query: q }));

function assembleGraph(checkpointer?: MemorySaver) {
  const builder = new StateGraph(ResearchState)
    .addNode('decomposeQuery',      decomposeQueryNode,      { retryPolicy: standardRetry })
    .addNode('searchBranch',        searchBranchNode,        { retryPolicy: standardRetry })
    .addNode('mergeFindings',       mergeFindingsNode)
    .addNode('deduplicateFindings', deduplicateFindingsNode, { retryPolicy: standardRetry })
    .addNode('synthesizeSummary',   synthesizeSummaryNode,   { retryPolicy: standardRetry })
    .addEdge(START, 'decomposeQuery')
    .addConditionalEdges('decomposeQuery', dispatchSearches, ['searchBranch'])
    .addEdge('searchBranch', 'mergeFindings')
    .addEdge('mergeFindings', 'deduplicateFindings')
    .addEdge('deduplicateFindings', 'synthesizeSummary')
    .addEdge('synthesizeSummary', END);

  return checkpointer ? builder.compile({ checkpointer }) : builder.compile();
}

export const graph: any = assembleGraph(new MemorySaver());

export async function buildGraph(): Promise<any> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const checkpointer = new PostgresSaver(pool);
  await checkpointer.setup();
  return assembleGraph(checkpointer as unknown as MemorySaver);
}
