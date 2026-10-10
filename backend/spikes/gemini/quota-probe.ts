// SPIKE (throwaway): what are this key's real Gemini limits? Sends tiny sequential requests to a model until the
// first 429, then prints the quota violation details (which quota, per minute or per day, and its value).
// Run: npx tsx spikes/gemini/quota-probe.ts [model] [maxCalls]
import { ai } from "./shared";

const model = process.argv[2] ?? "gemini-3.8-flash";
const maxCalls = Number(process.argv[3] ?? 20);

async function main() {
  const started = performance.now();
  for (let i = 1; i <= maxCalls; i++) {
    const t = performance.now();
    try {
      const res = await ai.models.generateContent({
        model,
        contents: "Reply with the single word: ok",
        config: model.includes("lite") ? {} : { thinkingConfig: { thinkingLevel: "LOW" as never } },
      });
      console.log(`#${i} ok ${Math.round(performance.now() - t)}ms (${((performance.now() - started) / 1000).toFixed(1)}s elapsed) -> ${res.text?.trim()}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`#${i} FAILED after ${((performance.now() - started) / 1000).toFixed(1)}s`);
      try {
        const body = JSON.parse(msg.slice(msg.indexOf("{")));
        console.log(`  ${body.error.code} ${body.error.status}`);
        console.log(`  ${String(body.error.message).split("\n").slice(0, 6).join("\n  ")}`);
        for (const d of body.error.details ?? []) {
          if (d.violations) for (const v of d.violations) console.log(`  violation: ${v.quotaId} value=${v.quotaValue ?? "?"} ${JSON.stringify(v.quotaDimensions)}`);
          if (d.retryDelay) console.log(`  retryDelay: ${d.retryDelay}`);
        }
      } catch {
        console.log(`  ${msg.slice(0, 800)}`);
      }
      return;
    }
  }
  console.log(`no 429 in ${maxCalls} calls`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
