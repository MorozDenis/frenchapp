import { describe, expect, it } from "vitest";
import { wordDiff } from "@/lib/diff";

const render = (ops: ReturnType<typeof wordDiff>) =>
  ops
    .map((op) =>
      op.type === "same" ? op.text : `${op.type === "added" ? "+" : "-"}[${op.text}]`,
    )
    .join("");

describe("wordDiff", () => {
  it("reports nothing when the text is unchanged", () => {
    expect(wordDiff("Il faut agir.", "Il faut agir.")).toEqual([
      { type: "same", text: "Il faut agir." },
    ]);
  });

  it("marks a substituted word as a removal plus an addition", () => {
    expect(render(wordDiff("il faut que je peux", "il faut que je puisse"))).toBe(
      "il faut que je -[peux]+[puisse]",
    );
  });

  it("highlights an accent fix, since a missing accent is the correction", () => {
    expect(render(wordDiff("le rechauffement climatique", "le réchauffement climatique"))).toBe(
      "le -[rechauffement]+[réchauffement] climatique",
    );
  });

  it("does not flag capitalisation on its own", () => {
    const ops = wordDiff("il faut agir", "Il faut agir");
    expect(ops).toEqual([{ type: "same", text: "Il faut agir" }]);
  });

  it("handles inserted and deleted words", () => {
    expect(render(wordDiff("je suis allé", "je suis déjà allé"))).toContain("+[déjà ]");
    expect(render(wordDiff("il ne sait pas", "il ne sait"))).toContain("-[ pas]");
  });

  it("survives empty input on either side", () => {
    expect(wordDiff("", "néanmoins")).toEqual([{ type: "added", text: "néanmoins" }]);
    expect(wordDiff("néanmoins", "")).toEqual([{ type: "removed", text: "néanmoins" }]);
    expect(wordDiff("", "")).toEqual([]);
  });
});
