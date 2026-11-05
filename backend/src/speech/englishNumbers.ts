// Spells out the numbers and units in English text (Wikipedia FACTS, place cards) before Gemini sees it. The model
// translates what it is given: with "1799" and "5 km" in the facts it writes digits and "km" in the script, which Gnani
// mispronounces; with "seventeen ninety-nine" and "five kilometres" it writes words.

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
  "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: [number, string][] = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];

function underThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) parts.push(n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[Math.floor(n / 10)]);
  else if (n > 0 || parts.length === 0) parts.push(ONES[n]);
  return parts.join(" ");
}

function cardinal(n: number): string {
  if (n < 1000) return underThousand(n);
  for (const [size, name] of SCALES) {
    if (n >= size) {
      const rest = n % size;
      return `${cardinal(Math.floor(n / size))} ${name}${rest ? ` ${cardinal(rest)}` : ""}`;
    }
  }
  return underThousand(n);
}

const ORDINAL_ENDINGS: Record<string, string> = {
  one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth",
};
function ordinal(n: number): string {
  const words = cardinal(n);
  const last = words.split(/[ -]/).pop() ?? words;
  const head = words.slice(0, words.length - last.length);
  if (ORDINAL_ENDINGS[last]) return head + ORDINAL_ENDINGS[last];
  if (last.endsWith("y")) return `${head}${last.slice(0, -1)}ieth`;
  return `${head}${last}th`;
}

// 1100-2099 read the way years are spoken: 1799 "seventeen ninety-nine", 1805 "eighteen oh five", 2005 "two thousand five".
function year(n: number): string {
  if (n >= 2000 && n < 2010) return n === 2000 ? "two thousand" : `two thousand ${ONES[n - 2000]}`;
  const [hi, lo] = [Math.floor(n / 100), n % 100];
  if (lo === 0) return `${cardinal(hi)} hundred`;
  return `${cardinal(hi)} ${lo < 10 ? `oh ${ONES[lo]}` : cardinal(lo)}`;
}

const digitByDigit = (s: string) => [...s].map((d) => ONES[Number(d)]).join(" ");

const UNITS: Record<string, string> = { km: "kilometres", kms: "kilometres", m: "metres", "%": "percent" };

// number (with optional thousands commas and decimals), optional ordinal ending, optional unit
const NUMBER = /(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(st|nd|rd|th)?(?:\s?(kms?|m(?![a-z])|%))?/gi;

export function spellOutNumbers(text: string): string {
  return text.replace(NUMBER, (_m, whole: string, decimals: string | undefined, ending: string | undefined, unit: string | undefined, offset: number) => {
    const digits = whole.replace(/,/g, "");
    const n = Number(digits);
    // Part of a code such as "NH275" or "B2": read the digits one by one.
    if (offset > 0 && /[A-Za-z]/.test(text[offset - 1])) return ` ${digitByDigit(digits + (decimals ?? ""))}`;
    const unitWord = unit ? UNITS[unit.toLowerCase()] : undefined;
    let spoken: string;
    if (decimals !== undefined) spoken = `${cardinal(n)} point ${digitByDigit(decimals)}`;
    else if (ending) spoken = ordinal(n);
    else if (!unitWord && !whole.includes(",") && digits.length === 4 && n >= 1100 && n <= 2099) spoken = year(n);
    else spoken = cardinal(n);
    return unitWord ? `${spoken} ${unitWord}` : spoken;
  });
}
