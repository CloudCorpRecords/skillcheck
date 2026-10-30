/**
 * Acceptance tests for skillcheck.
 *
 * Fixtures:
 * - skill-good: a dir named fixture-skill whose SKILL.md carries the
 *   name fixture-skill, valid frontmatter, a link to an existing
 *   file, and a backticked reference to that same file.
 * - skill-bad-frontmatter: no frontmatter at all.
 * - skill-dead-links: one dead markdown link and one missing
 *   backticked file reference.
 * - skill-noname: frontmatter without a name key.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck, renderReport, CLEAN_VERDICT, VERSION } from "../src/core.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function rules(report: ReturnType<typeof runCheck>): string[] {
  return report.findings.map((f) => f.rule);
}

describe("exports", () => {
  it("exposes the contract constants", () => {
    assert.equal(VERSION, "0.1.0");
    assert.equal(CLEAN_VERDICT, "VALID");
  });
});

describe("acceptance fixtures", () => {
  it("skill-good verdicts VALID with no high or medium findings", () => {
    const dir = join(FIXTURES, "skill-good", "fixture-skill");
    const r = runCheck(dir);
    assert.equal(r.tool, "skillcheck");
    assert.equal(r.version, "0.1.0");
    assert.equal(r.target, dir);
    assert.equal(r.verdict, "VALID", JSON.stringify(r.findings, null, 2));
    assert.equal(r.counts.high, 0);
    assert.equal(r.counts.medium, 0);
    assert.equal(r.counts.findings, 0, JSON.stringify(r.findings, null, 2));
    assert.ok(r.counts.linksChecked >= 1);
    assert.ok(r.counts.refsChecked >= 1);
    assert.equal(r.counts.externalLinks, 1);
    assert.match(r.summary, /VALID/);
    assert.match(renderReport(r), /VALID/);
  });

  it("skill-good also passes when the target is the SKILL.md file itself", () => {
    const file = join(FIXTURES, "skill-good", "fixture-skill", "SKILL.md");
    const r = runCheck(file);
    assert.equal(r.verdict, "VALID", JSON.stringify(r.findings, null, 2));
    assert.equal(r.counts.findings, 0);
  });

  it("skill-bad-frontmatter verdicts INVALID with FRONTMATTER-MISSING high", () => {
    const r = runCheck(join(FIXTURES, "skill-bad-frontmatter", "no-frontmatter"));
    assert.equal(r.verdict, "INVALID");
    assert.ok(rules(r).includes("FRONTMATTER-MISSING"));
    const f = r.findings.find((x) => x.rule === "FRONTMATTER-MISSING");
    assert.equal(f?.severity, "high");
    assert.equal(r.counts.high, 1);
    assert.equal(r.counts.findings, 1, JSON.stringify(r.findings, null, 2));
  });

  it("skill-dead-links verdicts INVALID with LINK-DEAD and REF-MISSING mediums", () => {
    const r = runCheck(join(FIXTURES, "skill-dead-links", "dead-links-skill"));
    assert.equal(r.verdict, "INVALID");
    const rs = rules(r);
    assert.ok(rs.includes("LINK-DEAD"), rs.join(","));
    assert.ok(rs.includes("REF-MISSING"), rs.join(","));
    const link = r.findings.find((x) => x.rule === "LINK-DEAD");
    const ref = r.findings.find((x) => x.rule === "REF-MISSING");
    assert.equal(link?.severity, "medium");
    assert.equal(ref?.severity, "medium");
    assert.ok((link?.line ?? 0) > 1, "dead link finding must carry a line number");
    assert.ok((ref?.line ?? 0) > 1, "missing ref finding must carry a line number");
    assert.equal(link?.evidence, "missing-guide.md");
    assert.equal(ref?.evidence, "scripts/missing-helper.py");
    assert.equal(r.counts.medium, 2);
    assert.equal(r.counts.findings, 2, JSON.stringify(r.findings, null, 2));
    assert.equal(r.counts.linksChecked, 1);
    assert.equal(r.counts.refsChecked, 1);
  });

  it("skill-noname verdicts INVALID with NAME-MISSING high", () => {
    const r = runCheck(join(FIXTURES, "skill-noname", "no-name-skill"));
    assert.equal(r.verdict, "INVALID");
    assert.ok(rules(r).includes("NAME-MISSING"));
    const f = r.findings.find((x) => x.rule === "NAME-MISSING");
    assert.equal(f?.severity, "high");
    assert.equal(r.counts.high, 1);
    assert.equal(r.counts.findings, 1, JSON.stringify(r.findings, null, 2));
  });
});

describe("missing file", () => {
  it("a missing target verdicts INVALID with one NO-SKILL-FILE high finding", () => {
    const r = runCheck(join(FIXTURES, "does-not-exist"));
    assert.equal(r.verdict, "INVALID");
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].rule, "NO-SKILL-FILE");
    assert.equal(r.findings[0].severity, "high");
    assert.equal(r.counts.findings, 1);
    assert.equal(r.counts.high, 1);
  });

  it("a directory without SKILL.md verdicts INVALID with NO-SKILL-FILE", () => {
    const r = runCheck(join(FIXTURES, "skill-good"));
    assert.equal(r.verdict, "INVALID");
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].rule, "NO-SKILL-FILE");
  });
});

describe("frontmatter details", () => {
  it("a short description is a low finding and does not invalidate on its own", () => {
    const root = mkdtempSync(join(tmpdir(), "skillcheck-short-"));
    try {
      const dir = join(root, "short-skill");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: short-skill\ndescription: Too short.\n---\n\n# Short Skill\n\nBody text.\n",
        "utf8",
      );
      const r = runCheck(dir);
      const f = r.findings.find((x) => x.rule === "DESCRIPTION-SHORT");
      assert.ok(f, JSON.stringify(r.findings, null, 2));
      assert.equal(f.severity, "low");
      assert.equal(r.verdict, "VALID");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a missing description is DESCRIPTION-MISSING high", () => {
    const root = mkdtempSync(join(tmpdir(), "skillcheck-nodesc-"));
    try {
      const dir = join(root, "nodesc-skill");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: nodesc-skill\n---\n\n# No Description Skill\n\nBody text.\n",
        "utf8",
      );
      const r = runCheck(dir);
      assert.ok(rules(r).includes("DESCRIPTION-MISSING"));
      assert.equal(r.verdict, "INVALID");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a name that does not match the directory is NAME-DIR-MISMATCH medium", () => {
    const root = mkdtempSync(join(tmpdir(), "skillcheck-mismatch-"));
    try {
      const dir = join(root, "other-dir");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: some-skill\ndescription: A description that is long enough to pass the length check.\n---\n\n# Some Skill\n\nBody text.\n",
        "utf8",
      );
      const r = runCheck(dir);
      const f = r.findings.find((x) => x.rule === "NAME-DIR-MISMATCH");
      assert.ok(f, JSON.stringify(r.findings, null, 2));
      assert.equal(f.severity, "medium");
      assert.equal(r.verdict, "INVALID");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a body with no headings is NO-HEADINGS low", () => {
    const root = mkdtempSync(join(tmpdir(), "skillcheck-nohead-"));
    try {
      const dir = join(root, "nohead-skill");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: nohead-skill\ndescription: A description that is long enough to pass the length check.\n---\n\nBody text with no heading at all.\n",
        "utf8",
      );
      const r = runCheck(dir);
      const f = r.findings.find((x) => x.rule === "NO-HEADINGS");
      assert.ok(f, JSON.stringify(r.findings, null, 2));
      assert.equal(f.severity, "low");
      assert.equal(r.verdict, "VALID");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("output is deterministic across repeated runs", () => {
    const dir = join(FIXTURES, "skill-dead-links", "dead-links-skill");
    const a = runCheck(dir);
    const b = runCheck(dir);
    assert.deepEqual(a, b);
    assert.equal(renderReport(a), renderReport(b));
  });
});
