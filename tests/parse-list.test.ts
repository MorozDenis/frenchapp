import { describe, expect, it } from "vitest";
import { normalizeForDedupe, parseRawList } from "@/lib/parse-list";

describe("parseRawList", () => {
  it("takes one expression per line", () => {
    const r = parseRawList("néanmoins\nen revanche\ntoutefois");
    expect(r.map((x) => x.text)).toEqual(["néanmoins", "en revanche", "toutefois"]);
  });

  it("splits on commas only when there are no line breaks", () => {
    expect(parseRawList("néanmoins, en revanche, toutefois").map((x) => x.text)).toEqual([
      "néanmoins",
      "en revanche",
      "toutefois",
    ]);
    // With line breaks present, an internal comma stays part of the chunk.
    const r = parseRawList("force est de constater que\nd'une part, d'autre part");
    expect(r.map((x) => x.text)).toEqual([
      "force est de constater que",
      "d'une part, d'autre part",
    ]);
  });

  it("peels off a translation and keeps it as a hint", () => {
    const r = parseRawList("néanmoins - nevertheless\ns'agir de : to be about");
    expect(r[0]).toEqual({ text: "néanmoins", userGloss: "nevertheless" });
    expect(r[1]).toEqual({ text: "s'agir de", userGloss: "to be about" });
  });

  it("keeps hyphenated words intact", () => {
    expect(parseRawList("peut-être\nc'est-à-dire").map((x) => x.text)).toEqual([
      "peut-être",
      "c'est-à-dire",
    ]);
  });

  it("strips bullets, numbering, quotes and parentheticals", () => {
    const r = parseRawList('- "néanmoins"\n2. prendre une décision (to make a decision)\n• le réchauffement climatique');
    expect(r.map((x) => x.text)).toEqual([
      "néanmoins",
      "prendre une décision",
      "le réchauffement climatique",
    ]);
    expect(r[1].userGloss).toBe("to make a decision");
  });

  it("drops blank and letterless lines and deduplicates the paste itself", () => {
    const r = parseRawList("néanmoins\n\n   \n---\n42\nNÉANMOINS");
    expect(r.map((x) => x.text)).toEqual(["néanmoins"]);
  });
});

describe("normalizeForDedupe", () => {
  it("matches the database uniqueness rule", () => {
    expect(normalizeForDedupe("  Prendre   une DÉCISION ")).toBe("prendre une décision");
  });
});
