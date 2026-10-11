import type { LanguageId } from "../catalog/languages";
import { LANGUAGE_STYLES, type Script } from "./languageStyles";

const INDIC_SCRIPTS = ["Devanagari", "Kannada", "Tamil", "Telugu", "Malayalam", "Bengali", "Gujarati", "Gurmukhi"] as const;

// One regex per script; letters and vowel signs both carry the script property.
const SCRIPT_REGEX: Record<Script, RegExp> = {
  Latin: /\p{Script=Latin}/u,
  Devanagari: /\p{Script=Devanagari}/u,
  Kannada: /\p{Script=Kannada}/u,
  Tamil: /\p{Script=Tamil}/u,
  Telugu: /\p{Script=Telugu}/u,
  Malayalam: /\p{Script=Malayalam}/u,
  Bengali: /\p{Script=Bengali}/u,
  Gujarati: /\p{Script=Gujarati}/u,
  Gurmukhi: /\p{Script=Gurmukhi}/u,
};
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;

const MIN_SCRIPT_RATIO = 0.6;
const MIN_BUDGET_RATIO = 0.6;
const MAX_BUDGET_RATIO = 1.3;

// Deterministic checks on a generated script (trip spec 5.6). Returns problems written for the model, so they can be
// appended to the prompt for a retry; [] means the script is fine.
export function checkScript(text: string, language: LanguageId, opts: { wordBudget?: number } = {}): string[] {
  const problems: string[] = [];
  const expected = LANGUAGE_STYLES[language].script;

  // Any decimal digit: ASCII and the Indic digit sets (೧೭೯೯, १७९९, ...). Gnani reads numbers well only as words.
  const digits = text.match(/\p{Nd}+/gu);
  if (digits) problems.push(`Contains digits: ${[...new Set(digits)].slice(0, 5).join(", ")}. Write numbers as words.`);

  // "km" not inside a Latin word, so "5km" and "ಕೋಟೆkm" count but "skm" doesn't.
  const km = text.match(/(?<![a-z])kms?(?![a-z])/gi);
  if (km) problems.push(`Contains "${km[0]}". Write "kilometres" in full, in the script of the language.`);

  for (const script of INDIC_SCRIPTS) {
    if (script === expected) continue;
    const stray = [...text].filter((ch) => SCRIPT_REGEX[script].test(ch));
    if (stray.length > 0) {
      const sample = [...new Set(stray)].slice(0, 5).join(" ");
      problems.push(
        expected === "Latin"
          ? `Contains ${script} letters (${sample}). Write only in Latin script (English letters).`
          : `Contains ${script} letters (${sample}). Write only in ${expected} script (Latin letters are allowed for English words).`,
      );
    }
  }

  if (expected !== "Latin") {
    const letters = [...text].filter((ch) => LETTER_OR_MARK.test(ch));
    if (letters.length > 0) {
      const inScript = letters.filter((ch) => SCRIPT_REGEX[expected].test(ch)).length;
      const ratio = inScript / letters.length;
      if (ratio < MIN_SCRIPT_RATIO) {
        problems.push(
          `Only ${Math.round(ratio * 100)}% of the letters are ${expected} script; at least ${MIN_SCRIPT_RATIO * 100}% must be. ` +
            `Write the sentences in ${expected} script, not in English letters.`,
        );
      }
    }
  }

  if (opts.wordBudget !== undefined) {
    // Tokens with at least one letter or number; a spaced-out dash or danda is not a word.
    const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    const min = Math.ceil(opts.wordBudget * MIN_BUDGET_RATIO), max = Math.floor(opts.wordBudget * MAX_BUDGET_RATIO);
    if (words < min || words > max) {
      problems.push(`The script has ${words} words; aim for about ${opts.wordBudget} (allowed ${min} to ${max}).`);
    }
  }
  return problems;
}
