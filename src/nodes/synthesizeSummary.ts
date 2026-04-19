/**
 * synthesizeSummary — LLM synthesis of all findings into structured output.
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { reasoningModel } from "../models.js";

const SynthesisSchema = z.object({
  headline: z.string().describe("One-sentence headline summarizing the research"),
  keyPoints: z.array(z.string()).min(3).max(8).describe("3-8 key insights from the research"),
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]),
  confidence: z.number().min(0).max(1).describe("How well-supported these conclusions are"),
  findings: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
    relevanceScore: z.number(),
  })).describe("Top findings that most support the headline"),
});

const structuredModel = reasoningModel.withStructuredOutput(SynthesisSchema, {
  method: "jsonSchema",
  strict: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const synthesizeSummaryNode = async (state: any) => {
  const { topic, timeframe, dedupedResults } = state;
  const results: unknown[] = Array.isArray(dedupedResults) ? dedupedResults : [];

  if (results.length === 0) {
    return {
      phase: "synthesize",
      synthesis: { headline: "No results found", keyPoints: [], sentiment: "neutral" as const, confidence: 0 },
      findings: [],
    };
  }

  const timeContext = timeframe ? ` (timeframe: ${timeframe})` : "";
  const snippets = results.slice(0, 12).map((r: unknown, i) => {
    const item = r as Record<string, unknown>;
    return `[${i + 1}] ${item.title}\nURL: ${item.url}\n${item.snippet}`;
  }).join("\n\n");

  const synthesis = await structuredModel.invoke([
    new SystemMessage(
      "You are a research synthesizer. Analyze the provided web search results and produce a structured synthesis.\n" +
      "Be objective. Note conflicting information. Cite specific findings in your key points.\n" +
      "Include only the top 5 most relevant findings in your response.",
    ),
    new HumanMessage(
      `Research topic: ${topic}${timeContext}\n\nSearch results:\n${snippets}`,
    ),
  ]);

  return {
    phase: "synthesize",
    synthesis: {
      headline: synthesis.headline,
      keyPoints: synthesis.keyPoints,
      sentiment: synthesis.sentiment,
      confidence: synthesis.confidence,
    },
    findings: synthesis.findings,
  };
};
