import { test, expect } from "bun:test";
import { parseCommand, type ParsedCommand } from "../src/ui/command-parser";

// Test parseCommand - goto command
test("parseCommand - goto with location", () => {
  const result = parseCommand("goto Austin");
  expect(result).toEqual({ type: "goto", args: "Austin" });
});

test("parseCommand - goto preserves original case in args", () => {
  const result = parseCommand("goto New York City");
  expect(result).toEqual({ type: "goto", args: "New York City" });
});

test("parseCommand - goto with coordinates", () => {
  const result = parseCommand("goto 30.2672, -97.7431");
  expect(result).toEqual({ type: "goto", args: "30.2672, -97.7431" });
});

test("parseCommand - goto uppercase command", () => {
  const result = parseCommand("GOTO Tokyo");
  expect(result).toEqual({ type: "goto", args: "Tokyo" });
});

test("parseCommand - goto mixed case", () => {
  const result = parseCommand("GoTo Paris");
  expect(result).toEqual({ type: "goto", args: "Paris" });
});

test("parseCommand - goto with extra whitespace", () => {
  const result = parseCommand("  goto   Austin  ");
  expect(result).toEqual({ type: "goto", args: "Austin" });
});

// Test parseCommand - go (short form)
test("parseCommand - go with location", () => {
  const result = parseCommand("go London");
  expect(result).toEqual({ type: "goto", args: "London" });
});

test("parseCommand - go uppercase", () => {
  const result = parseCommand("GO Berlin");
  expect(result).toEqual({ type: "goto", args: "Berlin" });
});

// Test parseCommand - home command
test("parseCommand - home command", () => {
  const result = parseCommand("home");
  expect(result).toEqual({ type: "home" });
});

test("parseCommand - home uppercase", () => {
  const result = parseCommand("HOME");
  expect(result).toEqual({ type: "home" });
});

test("parseCommand - home with whitespace", () => {
  const result = parseCommand("  home  ");
  expect(result).toEqual({ type: "home" });
});

// Test parseCommand - help command
test("parseCommand - help command", () => {
  const result = parseCommand("help");
  expect(result).toEqual({ type: "help" });
});

test("parseCommand - help uppercase", () => {
  const result = parseCommand("HELP");
  expect(result).toEqual({ type: "help" });
});

test("parseCommand - ? shortcut", () => {
  const result = parseCommand("?");
  expect(result).toEqual({ type: "help" });
});

test("parseCommand - ? with whitespace", () => {
  const result = parseCommand("  ?  ");
  expect(result).toEqual({ type: "help" });
});

// Test parseCommand - unknown/invalid commands
test("parseCommand - unknown command returns null", () => {
  expect(parseCommand("fly Austin")).toBeNull();
});

test("parseCommand - random text returns null", () => {
  expect(parseCommand("some random text")).toBeNull();
});

test("parseCommand - empty string returns null", () => {
  expect(parseCommand("")).toBeNull();
});

test("parseCommand - whitespace only returns null", () => {
  expect(parseCommand("   ")).toBeNull();
});

test("parseCommand - goto without location returns goto with empty args", () => {
  // "goto" alone returns a goto command with empty args
  // The CommandBar.executeCommand() handles showing the usage error
  const result = parseCommand("goto");
  expect(result).toEqual({ type: "goto", args: "" });
});

test("parseCommand - goto with only spaces returns goto with empty args", () => {
  const result = parseCommand("goto   ");
  expect(result?.type).toBe("goto");
  expect(result?.args?.trim()).toBe("");
});

test("parseCommand - go without location returns goto with empty args", () => {
  const result = parseCommand("go");
  expect(result).toEqual({ type: "goto", args: "" });
});

test("parseCommand - partial command", () => {
  expect(parseCommand("got")).toBeNull();
});

test("parseCommand - similar but invalid", () => {
  expect(parseCommand("gotoaustin")).toBeNull(); // no space after goto
});
