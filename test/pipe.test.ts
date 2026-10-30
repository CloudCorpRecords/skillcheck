/**
 * Pipe regression tests, inherited from the factory emit contract
 * (FACTORY-NOTES.md; ledger P-001, P-017, P-021 in the tranche 1 tools).
 *
 * Node stdout attached to a pipe is asynchronous: console.log followed
 * by process.exit discards whatever the pipe has not drained, truncating
 * at one 64 KiB pipe buffer while the exit code still reports success.
 * These tests spawn the real CLI with piped stdio and push a report past
 * 200 KiB through the pipe.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { runCheck, renderReport } from "../src/core.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "skillcheck-pipe-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A skill with many dead links: one LINK-DEAD finding per link. */
function writeBigSkill(root: string, linkCount = 3000): string {
  const skillDir = join(root, "pipe-skill");
  mkdirSync(skillDir, { recursive: true });
  const lines = [
    "---",
    "name: pipe-skill",
    "description: A generated skill with many dead links for pipe testing purposes.",
    "---",
    "",
    "# Pipe Skill",
    "",
  ];
  for (let i = 0; i < linkCount; i++) {
    lines.push(`- [missing ${i}](missing/file-${i}.md)`);
  }
  writeFileSync(join(skillDir, "SKILL.md"), lines.join("\n") + "\n", "utf8");
  return skillDir;
}

interface CliResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], opts: { destroyStdoutOnFirstChunk?: boolean } = {}): Promise<CliResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectPromise(new Error("CLI timed out"));
    }, 90000);
    if (opts.destroyStdoutOnFirstChunk) {
      child.stdout.destroy();
    }
    child.stdout.on("data", (c: Buffer) => {
      out += c.toString("utf8");
      if (opts.destroyStdoutOnFirstChunk) child.stdout.destroy();
    });
    child.stderr.on("data", (c: Buffer) => {
      err += c.toString("utf8");
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      rejectPromise(e);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stdout: out, stderr: err });
    });
  });
}

describe("emit contract: piped output is delivered whole", () => {
  it("piped --json check over 200 KiB parses and matches the in-process report", { timeout: 120000 }, async () => {
    const skillDir = writeBigSkill(dir, 3000);
    const direct = runCheck(skillDir);
    const directJson = JSON.stringify(direct, null, 2);
    assert.ok(directJson.length > 200_000, `fixture must exceed 200 KiB of JSON, got ${directJson.length}`);
    const res = await runCli(["check", skillDir, "--json"]);
    assert.equal(res.code, 1, `expected exit 1 (INVALID), got ${res.code} (stderr: ${res.stderr.slice(0, 200)})`);
    assert.equal(res.stdout.length, directJson.length + 1, "piped bytes must equal the full report plus the trailing newline");
    const parsed = JSON.parse(res.stdout) as { counts: { findings: number }; verdict: string };
    assert.equal(parsed.counts.findings, direct.counts.findings);
    assert.equal(parsed.counts.findings, 3000);
    assert.equal(parsed.verdict, direct.verdict);
    assert.equal(parsed.verdict, "INVALID");
  });

  it("piped human check output is byte-identical to the in-process render", { timeout: 120000 }, async () => {
    const skillDir = writeBigSkill(dir, 3000);
    const expected = renderReport(runCheck(skillDir)) + "\n";
    assert.ok(expected.length > 65_536, `human fixture must exceed one pipe buffer, got ${expected.length}`);
    const res = await runCli(["check", skillDir]);
    assert.equal(res.code, 1);
    assert.equal(res.stdout, expected);
  });

  it("a reader that closes the pipe early never sees a success exit", { timeout: 120000 }, async () => {
    const skillDir = writeBigSkill(dir, 3000);
    const res = await runCli(["check", skillDir, "--json"], { destroyStdoutOnFirstChunk: true });
    assert.notEqual(res.code, 0, "exit 0 would report success for output that was never delivered");
    assert.ok(res.signal === "SIGPIPE" || res.code === 141, `expected SIGPIPE or exit 141, got code ${res.code} signal ${res.signal}`);
  });
});
