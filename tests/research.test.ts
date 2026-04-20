/**
 * tests/research.test.ts — vitest integration tests for graph-web-researcher.
 * Makes real Tavily + OpenRouter calls — requires TAVILY_API_KEY and OPENROUTER_API_KEY in .env.
 */
import "dotenv/config";
import { describe, test, expect } from "vitest";
import { graph } from "../src/graph.js";

describe("graph-web-researcher", () => {
  test("researches LangGraph state management", async () => {
    const result = await graph.invoke(
      { topic: "LangGraph state management in TypeScript agents", maxSources: 4 },
      { configurable: { thread_id: `test-${Date.now()}` } },
    );
    expect(Array.isArray(result.findings)).toBe(true);
    expect((result.findings as unknown[]).length).toBeGreaterThan(0);
    expect(result.synthesis).not.toBeNull();
    expect(Array.isArray(result.sourceUrls)).toBe(true);
    expect((result.sourceUrls as unknown[]).length).toBeGreaterThan(0);
    const synth = result.synthesis as Record<string, unknown>;
    expect(typeof synth?.headline).toBe("string");
    expect(Array.isArray(synth?.keyPoints)).toBe(true);
  }, 90000);

  test("researches OpenAI structured outputs", async () => {
    const result = await graph.invoke(
      { topic: "OpenAI structured outputs JSON schema strict mode", maxSources: 3 },
      { configurable: { thread_id: `test-${Date.now()}` } },
    );
    expect(Array.isArray(result.findings)).toBe(true);
    expect((result.findings as unknown[]).length).toBeGreaterThan(0);
    expect(result.synthesis).not.toBeNull();
  }, 90000);
});
