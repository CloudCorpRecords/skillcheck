#!/usr/bin/env node
/**
 * skillcheck CLI.
 *
 *   skillcheck validate --skill <path> [--files <files.json>]
 *                        [--sections <sections.json>]
 *   skillcheck mcp
 *
 * files.json / sections.json are JSON arrays of strings. The
 * validation report is printed as JSON. Exit codes: 0 when the
 * tool ran (even when the report's `valid` is false — validity
 * is data, not a process failure), 1 runtime error, 2 usage
 * error. Argument validation happens before any file is read.
 */
import { readFileSync } from "node:fs";
import { formatPayload, validateSkill, VERSION } from "./skillcheck.js";

function usage(): never {
  console.error(`Usage:
  skillcheck validate --skill <path> [--files <files.json>] [--sections <sections.json>]
  skillcheck mcp
  skillcheck --version`);
  process.exit(2);
}

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

function readJsonArray(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(
      `error: cannot read or parse ${label} file '${path}': ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (cmd !== "validate") usage();

  // ---- Argument validation (before any file is read) ----
  const flags = ["--skill", "--files", "--sections"];
  if (rest.some((a) => a.startsWith("--") && !flags.includes(a))) usage();
  const skillPath = flag(rest, "--skill");
  if (skillPath === undefined) usage();
  const filesPath = flag(rest, "--files");
  if (rest.includes("--files") && filesPath === undefined) usage();
  const sectionsPath = flag(rest, "--sections");
  if (rest.includes("--sections") && sectionsPath === undefined) usage();

  let content: string;
  try {
    content = readFileSync(skillPath, "utf8");
  } catch (err) {
    console.error(
      `error: cannot read skill file '${skillPath}': ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  const availableFiles =
    filesPath === undefined ? undefined : readJsonArray(filesPath, "files");
  const requiredSections =
    sectionsPath === undefined ? undefined : readJsonArray(sectionsPath, "sections");

  try {
    const out = validateSkill(content, availableFiles, requiredSections);
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
