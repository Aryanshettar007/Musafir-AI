import { describe, expect, it } from "vitest";
import { spellOutNumbers } from "../src/speech/englishNumbers";

describe("spellOutNumbers", () => {
  it("reads four-digit years as pairs", () => {
    expect(spellOutNumbers("Built in 1799.")).toBe("Built in seventeen ninety-nine.");
    expect(spellOutNumbers("In 1900 and 1805")).toBe("In nineteen hundred and eighteen oh five");
    expect(spellOutNumbers("Founded 2005")).toBe("Founded two thousand five");
    expect(spellOutNumbers("Founded 2014")).toBe("Founded twenty fourteen");
  });

  it("spells cardinals, thousands separators and decimals", () => {
    expect(spellOutNumbers("about 12 temples")).toBe("about twelve temples");
    expect(spellOutNumbers("142 steps")).toBe("one hundred forty-two steps");
    expect(spellOutNumbers("12,000 visitors")).toBe("twelve thousand visitors");
    expect(spellOutNumbers("3.5 hectares")).toBe("three point five hectares");
  });

  it("spells ordinals", () => {
    expect(spellOutNumbers("the 3rd century, 21st")).toBe("the third century, twenty-first");
  });

  it("writes units in full", () => {
    expect(spellOutNumbers("5 km away")).toBe("five kilometres away");
    expect(spellOutNumbers("2.5km")).toBe("two point five kilometres");
    expect(spellOutNumbers("a 1,200 m peak")).toBe("a one thousand two hundred metres peak");
    expect(spellOutNumbers("45% of it")).toBe("forty-five percent of it");
  });

  it("leaves text without numbers alone", () => {
    expect(spellOutNumbers("The fort is on the Kaveri.")).toBe("The fort is on the Kaveri.");
    expect(spellOutNumbers("Mysore Palace, Bengaluru")).toBe("Mysore Palace, Bengaluru");
  });

  it("never leaves a digit behind", () => {
    expect(spellOutNumbers("Route NH275, 3 of 4 gates, 10th, 1,234,567")).not.toMatch(/\d/);
  });
});
