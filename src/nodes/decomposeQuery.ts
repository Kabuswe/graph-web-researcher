/**
 * decomposeQuery — breaks a topic into N targeted search queries using LLM.
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { fastModel } from "../models.js";

const DecomposeSchema = z.object({
  queries: z.array(z.string()).min(1).max(8),
});

const structuredModel = fastModel.withStructuredOutput(DecomposeSchema, {
  method: "jsonSchema",
  strict: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const decomposeQueryNode = async (state: any) => {
  const { topic, timeframe, maxSources } = state;

  const queryCount = Math.min(Math.max(Math.ceil((maxSources as number) / 2), 2), 6);

  const timeContext = timeframe ? ` Focus on information from ${timeframe}.` : "";

  const { queries } = await structuredModel.invoke([
    new SystemMessage(
      `You decompose research topics into targeted search queries.
Generate exactly ${queryCount} diverse search queries that together provide comprehensive coverage of the topic.
Each query should approach the topic from a different angle: overview, recent developments, expert opinions, data/statistics, criticism, use cases.
Keep queries specific and searchable (what someone would type into a search engine).${timeContext}`,
    ),
    new HumanMessage(`Research topic: ${topic}`),
  ]);

  return {
    phase: "decompose-query",
    searchQueries: queries,
  };
};
