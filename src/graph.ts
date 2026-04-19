/**
 * graph-web-researcher
 *
 * Pipeline: decomposeQuery → [parallel searchBranch × queries] → mergeFindings → deduplicateFindings → synthesizeSummary
 *
 * Input:  WebResearcherInput  (topic, timeframe?, maxSources)
 * Output: WebResearcherOutput (synthesis, findings[], sourceUrls[])
 *
 * TODO: implement nodes under src/nodes/ per PRD.md
 * TODO: wire Tavily MCP client in src/search.ts
 */

import { StateGraph, START, END, MemorySaver, StateSchema, UntrackedValue, Send } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import pg from 'pg';
import { z } from 'zod';

function lastValue<T>(schema: z.ZodType<T, any, any>): UntrackedValue<T> {
  return schema as unknown as UntrackedValue<T>;
}

const ResearchState = new StateSchema({
  topic:              lastValue(z.string().default('')),
  timeframe:          lastValue(z.string().optional()),
  maxSources:         lastValue(z.number().default(8)),
  searchQueries:      lastValue(z.array(z.string()).default(() => [])),
  rawResults:         lastValue(z.array(z.any()).default(() => [])),
  normalizedResults:  lastValue(z.array(z.any()).default(() => [])),
  dedupedResults:     lastValue(z.array(z.any()).default(() => [])),
  sourceUrls:         lastValue(z.array(z.string()).default(() => [])),
  synthesis:          lastValue(z.any().optional()),
  findings:           lastValue(z.array(z.string()).default(() => [])),
  error:              lastValue(z.string().optional()),
  phase:              lastValue(z.string().default('')),
});

const standardRetry = { maxAttempts: 3, initialInterval: 1000, backoffFactor: 2 };

// TODO: implement real nodes
const decomposeQueryNode     = async (s: any) => ({ phase: 'decompose-query', searchQueries: [s.topic] });
const searchBranchNode       = async (s: any) => ({ rawResults: [] });
const mergeFindingsNode      = async (s: any) => ({ phase: 'merge-findings', normalizedResults: s.rawResults });
const deduplicateFindingsNode = async (s: any) => ({ phase: 'deduplicate', dedupedResults: s.normalizedResults, sourceUrls: [] });
const synthesizeSummaryNode  = async (s: any) => ({ phase: 'synthesize', synthesis: { headline: '', keyPoints: [], sentiment: 'neutral', confidence: 0 }, findings: [] });

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
