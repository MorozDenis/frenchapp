import { describe, expect, it } from "vitest";
import { nextAccent } from "@/lib/accents";

describe("nextAccent", () => {
  it("inserts the first accented form when nothing relevant precedes", () => {
    expect(nextAccent("e", " ")).toEqual({ insert: "é", replaceLength: 0 });
  });

  it("upgrades the plain letter typed just before it", () => {
    expect(nextAccent("e", "e")).toEqual({ insert: "é", replaceLength: 1 });
  });

  it("cycles through the accented forms and wraps around", () => {
    expect(nextAccent("e", "é")).toEqual({ insert: "è", replaceLength: 1 });
    expect(nextAccent("e", "è")).toEqual({ insert: "ê", replaceLength: 1 });
    expect(nextAccent("e", "ë")).toEqual({ insert: "é", replaceLength: 1 });
  });

  it("keeps capitals capital", () => {
    expect(nextAccent("E", "E")).toEqual({ insert: "É", replaceLength: 1 });
    expect(nextAccent("E", "É")).toEqual({ insert: "È", replaceLength: 1 });
  });

  it("covers the single-form letters", () => {
    expect(nextAccent("c", "c")).toEqual({ insert: "ç", replaceLength: 1 });
    expect(nextAccent("c", "ç")).toEqual({ insert: "ç", replaceLength: 1 });
  });

  it("ignores letters with no accented form", () => {
    expect(nextAccent("z", "z")).toBeNull();
    expect(nextAccent("1", "")).toBeNull();
  });
});
