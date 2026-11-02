import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateSkill } from "../src/skillcheck.js";

/**
 * All tests are pure local text analysis over inline documents:
 * no filesystem, no network. Each issue code is pinned by a
 * positive case (the code fires) and a negative case (it does
 * not).
 */

const VALID = `---
name: my-skill
description: Does a useful thing.
---

# Usage

See the [guide](references/guide.md) and the [site](https://example.com/docs).
`;

function codes(out: ReturnType<typeof validateSkill>): string[] {
  return out.issues.map((i) => i.code);
}

describe("validateSkill — frontmatter codes", () => {
  it("accepts a well-formed document and reports the stats shape", () => {
    const out = validateSkill(VALID, ["references/guide.md"], ["Usage"]);
    assert.equal(out.valid, true);
    assert.deepEqual(out.issues, []);
    assert.deepEqual(Object.keys(out.stats), [
      "frontmatter_fields",
      "name",
      "link_count",
      "relative_link_count",
      "section_count",
      "files_checked",
    ]);
    assert.deepEqual(out.stats.frontmatter_fields, ["name", "description"]);
    assert.equal(out.stats.name, "my-skill");
    assert.equal(out.stats.section_count, 1);
  });

  it("fires NO_FRONTMATTER at line 1 when the document does not start with ---", () => {
    const out = validateSkill("# Just a heading\n\nBody text.\n");
    assert.equal(out.valid, false);
    assert.deepEqual(codes(out), ["NO_FRONTMATTER"]);
    assert.equal(out.issues[0].line, 1);
    assert.deepEqual(out.stats.frontmatter_fields, []);
    assert.equal(out.stats.name, null);
  });

  it("does not fire NO_FRONTMATTER for a document starting with ---", () => {
    assert.ok(!codes(validateSkill(VALID)).includes("NO_FRONTMATTER"));
  });

  it("fires UNCLOSED_FRONTMATTER when there is no closing ---", () => {
    const out = validateSkill("---\nname: my-skill\ndescription: Never closed.\n\n# Body\n");
    assert.deepEqual(codes(out), ["UNCLOSED_FRONTMATTER"]);
    assert.equal(out.issues[0].line, 1);
    assert.equal(out.valid, false);
  });

  it("does not fire UNCLOSED_FRONTMATTER for a closed block", () => {
    assert.ok(!codes(validateSkill(VALID)).includes("UNCLOSED_FRONTMATTER"));
  });

  it("fires MISSING_NAME when the frontmatter has no name field", () => {
    const out = validateSkill("---\ndescription: No name here.\n---\n\nBody.\n");
    assert.deepEqual(codes(out), ["MISSING_NAME"]);
    assert.equal(out.stats.name, null);
  });

  it("fires MISSING_DESCRIPTION when the frontmatter has no description field", () => {
    const out = validateSkill("---\nname: my-skill\n---\n\nBody.\n");
    assert.deepEqual(codes(out), ["MISSING_DESCRIPTION"]);
  });

  it("does not fire MISSING_NAME or MISSING_DESCRIPTION when both fields exist", () => {
    const found = codes(validateSkill(VALID));
    assert.ok(!found.includes("MISSING_NAME"));
    assert.ok(!found.includes("MISSING_DESCRIPTION"));
  });

  it("fires BAD_NAME_FORMAT for non-kebab names at the name field's line", () => {
    for (const bad of ["My Skill", "UPPER", "-leading", "trailing-", "double--dash", "under_score", ""]) {
      const doc = `---\nname: ${bad}\ndescription: x.\n---\n\nBody.\n`;
      const out = validateSkill(doc);
      assert.ok(codes(out).includes("BAD_NAME_FORMAT"), `expected BAD_NAME_FORMAT for '${bad}'`);
      assert.equal(out.issues.find((i) => i.code === "BAD_NAME_FORMAT")?.line, 2);
    }
  });

  it("accepts kebab-case names without BAD_NAME_FORMAT", () => {
    for (const good of ["a", "a1", "my-skill", "my-skill-2", "abc123"]) {
      const doc = `---\nname: ${good}\ndescription: x.\n---\n\nBody.\n`;
      assert.ok(!codes(validateSkill(doc)).includes("BAD_NAME_FORMAT"), `unexpected BAD_NAME_FORMAT for '${good}'`);
    }
  });

  it("fires EMPTY_BODY when nothing but whitespace follows the frontmatter", () => {
    const out = validateSkill("---\nname: my-skill\ndescription: x.\n---\n\n   \n");
    assert.deepEqual(codes(out), ["EMPTY_BODY"]);
    assert.equal(out.valid, false);
  });

  it("does not fire EMPTY_BODY when the body has content", () => {
    assert.ok(!codes(validateSkill(VALID)).includes("EMPTY_BODY"));
  });
});

describe("validateSkill — links", () => {
  it("counts external, anchor, and mailto links but never checks them", () => {
    const doc = `---
name: my-skill
description: x.
---

[web](https://example.com) [plain](http://example.com/a) [mail](mailto:a@example.com) [jump](#usage)
`;
    const out = validateSkill(doc, []);
    assert.equal(out.valid, true);
    assert.equal(out.stats.link_count, 4);
    assert.equal(out.stats.relative_link_count, 0);
    assert.equal(out.stats.files_checked, true);
  });

  it("fires MISSING_FILE at the link's line for a relative target not in available_files", () => {
    const out = validateSkill(VALID, ["references/other.md"]);
    const issue = out.issues.find((i) => i.code === "MISSING_FILE");
    assert.ok(issue);
    assert.equal(issue.line, 8);
    assert.equal(out.valid, false);
  });

  it("does not fire MISSING_FILE when the relative target is listed", () => {
    const out = validateSkill(VALID, ["references/guide.md"]);
    assert.ok(!codes(out).includes("MISSING_FILE"));
  });

  it("does not check relative links when available_files is absent (files_checked false)", () => {
    const out = validateSkill(VALID);
    assert.equal(out.stats.files_checked, false);
    assert.equal(out.stats.relative_link_count, 1);
    assert.ok(!codes(out).includes("MISSING_FILE"));
    assert.equal(out.valid, true);
  });

  it("reports files_checked true when available_files is provided, even empty", () => {
    assert.equal(validateSkill(VALID, []).stats.files_checked, true);
  });

  it("strips a #anchor suffix before checking a relative target", () => {
    const doc = `---
name: my-skill
description: x.
---

See [deep](references/guide.md#install) and [gone](references/gone.md#top).
`;
    const out = validateSkill(doc, ["references/guide.md"]);
    const missing = out.issues.filter((i) => i.code === "MISSING_FILE");
    assert.equal(missing.length, 1);
    assert.match(missing[0].message, /references\/gone\.md/);
  });

  it("strips surrounding <> from a relative target before checking it", () => {
    const doc = `---
name: my-skill
description: x.
---

See [guide](<references/guide.md>).
`;
    const out = validateSkill(doc, ["references/guide.md"]);
    assert.equal(out.valid, true);
    assert.equal(out.stats.relative_link_count, 1);
  });
});

describe("validateSkill — required sections", () => {
  it("fires MISSING_SECTION with line null for a required heading that is absent", () => {
    const out = validateSkill(VALID, undefined, ["Usage", "Troubleshooting"]);
    const issue = out.issues.find((i) => i.code === "MISSING_SECTION");
    assert.ok(issue);
    assert.equal(issue.line, null);
    assert.match(issue.message, /Troubleshooting/);
    assert.equal(out.valid, false);
  });

  it("matches required sections case-insensitively, trimmed, at any heading level", () => {
    const doc = `---
name: my-skill
description: x.
---

##   Getting Started ##

Body.

###### Deep Detail

More.
`;
    const out = validateSkill(doc, undefined, ["getting started", "  DEEP DETAIL  "]);
    assert.equal(out.valid, true);
    assert.equal(out.stats.section_count, 2);
  });

  it("does not fire MISSING_SECTION when no sections are required", () => {
    assert.ok(!codes(validateSkill(VALID)).includes("MISSING_SECTION"));
  });
});

describe("validateSkill — input validation", () => {
  it("rejects a missing or empty content", () => {
    assert.throws(() => validateSkill(""), /content is required/);
    assert.throws(() => validateSkill(undefined), /content is required/);
    assert.throws(() => validateSkill(42), /content is required/);
  });

  it("rejects non-string entries in available_files and required_sections", () => {
    assert.throws(() => validateSkill(VALID, ["ok.md", 7]), /available_files must be an array of strings/);
    assert.throws(() => validateSkill(VALID, undefined, "Usage"), /required_sections must be an array of strings/);
  });
});
