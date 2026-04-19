/**
 * tests/research.test.ts — integration test for graph-web-researcher
 */
import "dotenv/config";
import { graph } from "../src/graph.js";

const TEST_CASES = [
  {
    name: "LangGraph state management",
    input: {
      topic: "LangGraph state management in TypeScript agents",
      maxSources: 4,
    },
    validate: (r: Record<string, unknown>) =>
      Array.isArray(r.findings) && (r.findings as unknown[]).length > 0 &&
      r.synthesis != null &&
      Array.isArray(r.sourceUrls) && (r.sourceUrls as unknown[]).length > 0,
  },
  {
    name: "OpenAI structured outputs",
    input: {
      topic: "OpenAI structured outputs JSON schema strict mode",
      maxSources: 3,
    },
    validate: (r: Record<string, unknown>) =>
      Array.isArray(r.findings) && (r.findings as unknown[]).length > 0 &&
      r.synthesis != null,
  },
];

async function runTest(tc: (typeof TEST_CASES)[0]) {
  const config = { configurable: { thread_id: `test-${Date.now()}` } };
  const result = await graph.invoke(tc.input, config);

  const valid = tc.validate(result as Record<string, unknown>);
  const icon = valid ? "✅" : "⚠️";
  const synth = result.synthesis;
  const synthPreview = typeof synth === "string"
    ? synth.slice(0, 120)
    : (synth as any)?.summary?.slice(0, 120) ?? JSON.stringify(synth ?? "").slice(0, 120);

  console.log(
    `${icon} [${tc.name}] findings=${(result.findings as unknown[])?.length ?? 0} sources=${(result.sourceUrls as unknown[])?.length ?? 0}`,
  );
  console.log(`   synthesis: ${synthPreview}...`);
  if (!valid) {
    console.log(`   FAIL — got:`, JSON.stringify(result, null, 2).slice(0, 400));
  }
  return valid;
}

async function main() {
  console.log("\n=== graph-web-researcher integration tests ===\n");
  const results = [];
  for (const tc of TEST_CASES) {
    results.push(await runTest(tc));
  }
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (passed < results.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
