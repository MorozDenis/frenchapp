import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-redirect";

describe("safeNext", () => {
  it("keeps ordinary in-app paths", () => {
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/bank")).toBe("/bank");
    expect(safeNext("/progress?tab=errors")).toBe("/progress?tab=errors");
  });

  it("falls back to the drill when nothing is given", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });

  it("refuses absolute URLs to other hosts", () => {
    expect(safeNext("https://evil.example.com")).toBe("/");
    expect(safeNext("http://evil.example.com/steal")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });

  it("refuses protocol-relative URLs, which browsers treat as another host", () => {
    expect(safeNext("//evil.example.com")).toBe("/");
    expect(safeNext("//evil.example.com/path")).toBe("/");
    expect(safeNext("/\\evil.example.com")).toBe("/");
  });

  it("refuses paths carrying backslashes or control characters", () => {
    expect(safeNext("/bank\\@evil.example.com")).toBe("/");
    expect(safeNext("/bank\nLocation: https://evil.example.com")).toBe("/");
    expect(safeNext("/bank\r\n")).toBe("/");
  });
});
