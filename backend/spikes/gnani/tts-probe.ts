// SPIKE (throwaway): generate the same road-trip narration across languages/voices
// and record latency + output size. Listen to the files in spikes/out/.
// Run: npx tsx spikes/gnani/tts-probe.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { OUT_DIR, tts, type TtsRequest } from "./client";

const LONG_EN =
  "You're approaching Srirangapatna Fort, on your right. This island town sits between two branches of the Kaveri river, " +
  "and for decades it was the capital of Hyder Ali and his son, Tipu Sultan. Tipu was known as the Tiger of Mysore. " +
  "He experimented with iron-cased rockets, which so impressed the British that they studied them and built their own. " +
  "In seventeen ninety-nine, during the final siege of Srirangapatna, the British broke through the fort walls, " +
  "and Tipu died fighting near the water gate. If you stop here, look for the Daria Daulat Bagh, his summer palace, " +
  "with its painted walls showing scenes from his battles. And just a little ahead is the Ranganathaswamy temple, " +
  "which gives the town its name. Many travellers say the best time to visit is early morning, when the river is calm " +
  "and the old stone walls are still cool.";

const CASES: Array<{ id: string; note: string; req: TtsRequest }> = [
  {
    id: "en-kaveri",
    note: "English, female",
    req: { language: "en-IN", voice: "Kaveri", text: "You're approaching Srirangapatna Fort. This place played an important role in the history of Tipu Sultan." },
  },
  {
    id: "en-girish",
    note: "English, male",
    req: { language: "en-IN", voice: "Girish", text: "Welcome to Mysuru, the city of palaces, sandalwood and Dasara." },
  },
  {
    id: "kn-saanvi",
    note: "Kannada native script, female",
    req: {
      language: "kn-IN",
      voice: "Saanvi",
      text: "ನೀವು ಶ್ರೀರಂಗಪಟ್ಟಣ ಕೋಟೆಯ ಹತ್ತಿರ ಬರುತ್ತಿದ್ದೀರಿ. ಟಿಪ್ಪು ಸುಲ್ತಾನನ ಇತಿಹಾಸದಲ್ಲಿ ಈ ಸ್ಥಳಕ್ಕೆ ಬಹಳ ಮುಖ್ಯವಾದ ಪಾತ್ರವಿದೆ.",
    },
  },
  {
    id: "kn-kavin",
    note: "Kannada native script, male",
    req: { language: "kn-IN", voice: "Kavin", text: "ಮೈಸೂರಿಗೆ ಸ್ವಾಗತ. ಅರಮನೆಗಳು, ಶ್ರೀಗಂಧ ಮತ್ತು ದಸರೆಯ ನಗರ." },
  },
  {
    id: "kanglish-mixed-script",
    note: "Kanglish: Kannada script + English words in Latin",
    req: { language: "kn-IN", voice: "Saanvi", text: "ನೀವು Srirangapatna fort ಹತ್ತಿರ ಬರ್ತಿದೀರಾ. ಇದು Tipu Sultan ಅವರ history ಅಲ್ಲಿ ತುಂಬಾ important place." },
  },
  {
    id: "kanglish-latin",
    note: "Kanglish fully romanised (expected weakest)",
    req: { language: "kn-IN", voice: "Saanvi", text: "Neevu Srirangapatna fort hattira bartidira. Idu Tipu Sultan avara history alli tumba important place." },
  },
  {
    id: "hi-nalini",
    note: "Hindi native script",
    req: { language: "hi-IN", voice: "Nalini", text: "आप श्रीरंगपट्टनम किले के पास पहुँच रहे हैं। टीपू सुल्तान के इतिहास में इस जगह की बहुत अहम भूमिका रही है।" },
  },
  {
    id: "hinglish-poorvi",
    note: "Hinglish (hi-en), romanised",
    req: { language: "hi-en", voice: "Poorvi", text: "Aap Srirangapatna Fort ke paas pahunch rahe ho. Yeh jagah Tipu Sultan ki history mein bahut important hai." },
  },
  {
    id: "auto-kn",
    note: "language=auto with Kannada text",
    req: { language: "auto", voice: "Saanvi", text: "ಮುಂದೆ ಎಂಟುನೂರು ಮೀಟರ್ ದೂರದಲ್ಲಿ ಬೆಣ್ಣೆ ದೋಸೆಗೆ ಹೆಸರಾದ ಒಂದು ಹೋಟೆಲ್ ಇದೆ." },
  },
  {
    id: "en-long-90s",
    note: `English long-form story (${LONG_EN.length} chars) - checks length limits`,
    req: { language: "en-IN", voice: "Kaveri", text: LONG_EN },
  },
  {
    id: "en-long-90s-wav",
    note: "Same long story as WAV, to compare size vs mp3",
    req: { language: "en-IN", voice: "Kaveri", text: LONG_EN, container: "wav" },
  },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const only = process.argv[2];

  for (const c of CASES.filter((c) => !only || c.id === only)) {
    const ext = c.req.container ?? "mp3";
    const { ms, status, attempts, value } = await tts(c.req);
    const tries = attempts && attempts > 1 ? ` (${attempts} tries)` : "";
    if (typeof value === "string") {
      console.log(`✗ ${c.id.padEnd(24)} ${status} ${ms}ms${tries}  ${value.slice(0, 300)}`);
      continue;
    }
    const file = path.join(OUT_DIR, `${c.id}.${ext}`);
    await writeFile(file, value);
    const kb = (value.length / 1024).toFixed(0);
    const msPerChar = (ms / c.req.text.length).toFixed(1);
    console.log(`✓ ${c.id.padEnd(24)} ${status} ${String(ms).padStart(6)}ms  ${kb.padStart(5)}KB  ${msPerChar}ms/char${tries}  ${c.note}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
