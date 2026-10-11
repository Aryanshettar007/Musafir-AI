// Gnani TTS fails with a generic 500 above ~2 000 characters per request, so scripts are split on sentence
// boundaries and the resulting mp3s are concatenated.
export const MAX_TTS_CHARS = 1800;

// A sentence = anything up to and including its end mark(s) and closing quotes, or up to a newline / the end.
// `*` (not `+`) so a stray end mark (e.g. after a newline) still forms a unit: every character lands in some unit.
const SENTENCE = /[^.?!।॥\n]*(?:[.?!।॥]+["')\]”’]*|\n+|$)/g;

export function chunkScript(text: string, maxChars = MAX_TTS_CHARS): string[] {
  const units = (text.match(SENTENCE) ?? []).map((s) => s.trim()).filter(Boolean).flatMap((s) => splitLong(s, maxChars));
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (current && current.length + 1 + unit.length > maxChars) {
      chunks.push(current);
      current = unit;
    } else {
      current = current ? `${current} ${unit}` : unit;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// A sentence longer than the limit: split on commas, then on spaces, then hard.
function splitLong(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence];
  const byComma = sentence.match(/[^,，،、]*(?:[,，،、]+|$)/g) ?? [sentence];
  return pack(byComma, maxChars).flatMap((piece) =>
    piece.length <= maxChars ? [piece] : pack(piece.split(/\s+/), maxChars).flatMap((w) => hardSplit(w, maxChars)),
  );
}

function pack(parts: string[], maxChars: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (current && current.length + 1 + part.length > maxChars) {
      out.push(current);
      current = part;
    } else {
      current = current ? `${current} ${part}` : part;
    }
  }
  if (current) out.push(current);
  return out;
}

// A single "word" longer than the limit (shouldn't happen in real text).
function hardSplit(word: string, maxChars: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i += maxChars) out.push(word.slice(i, i + maxChars));
  return out;
}
