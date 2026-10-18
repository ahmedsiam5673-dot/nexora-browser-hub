import { describe, expect, it } from "vitest";
import { isClearPeriod, isInternalMethod, parseChromeAction } from "../src/shared/ipc";

describe("parseChromeAction", () => {
  it("accepts well-formed actions", () => {
    expect(parseChromeAction({ type: "go", input: "example.com" })).toEqual({ type: "go", input: "example.com" });
    expect(parseChromeAction({ type: "moveTab", id: 3, to: 1 })).toEqual({ type: "moveTab", id: 3, to: 1 });
    expect(parseChromeAction({ type: "mainMenu", x: 10, y: 20.5 })).toEqual({ type: "mainMenu", x: 10, y: 20.5 });
  });
  it("rejects malformed, hostile or unknown input", () => {
    for (const bad of [null, undefined, 5, "go", [], {}, { type: "evil" }, { type: "closeTab" }, { type: "closeTab", id: -1 }, { type: "closeTab", id: 1.5 },
      { type: "closeTab", id: "1" }, { type: "go", input: 5 }, { type: "go", input: "x".repeat(9000) }, { type: "moveTab", id: 1 },
      { type: "mainMenu", x: NaN, y: 0 }, { type: "mainMenu", x: Infinity, y: 0 }, { type: "__proto__" }, { type: "openBookmark", id: {} }]) {
      expect(parseChromeAction(bad)).toBeNull();
    }
  });
  it("drops unexpected extra fields", () => {
    expect(parseChromeAction({ type: "closeTab", id: 2, extra: "x" })).toEqual({ type: "closeTab", id: 2 });
  });
});

describe("internal methods", () => {
  it("allowlists by exact name", () => {
    expect(isInternalMethod("history:list")).toBe(true);
    for (const bad of ["history:list ", "shell:openExternal", "fs:read", "constructor", "__proto__", 5, null]) expect(isInternalMethod(bad)).toBe(false);
  });
  it("validates clear periods", () => {
    expect(isClearPeriod("day")).toBe(true);
    expect(isClearPeriod("year")).toBe(false);
  });
});
