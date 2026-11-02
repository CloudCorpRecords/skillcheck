/**
 * skillcheck core: validate a SKILL.md document.
 *
 *   validateSkill(content, availableFiles?, requiredSections?)
 *
 * Frontmatter: the document must start with a `---` line; the
 * block ends at the next `---` line. Inside, fields are
 * `key: value` lines. Checks, in firing order:
 *
 *   NO_FRONTMATTER        document does not start with `---`
 *                         (line 1)
 *   UNCLOSED_FRONTMATTER  no closing `---` (line 1)
 *   MISSING_NAME          no `name` field in the frontmatter
 *   MISSING_DESCRIPTION   no `description` field
 *   BAD_NAME_FORMAT       `name` is not a kebab-case slug
 *                         (^[a-z0-9]+(-[a-z0-9]+)*$); reported
 *                         at the name field's line
 *   EMPTY_BODY            nothing but whitespace after the
 *                         frontmatter block
 *
 * When the frontmatter is absent or unclosed, the field-level
 * checks do not fire: there is no closed block to inspect.
 *
 * Links: markdown links `[text](target)` in the body. Targets
 * starting with http://, https://, mailto:, or # are external
 * or anchors: counted, never checked. Other targets are
 * relative references (any `#anchor` suffix and surrounding
 * `<>` are stripped); when `available_files` is provided, a
 * relative target not in the list is a MISSING_FILE issue at
 * the link's line. When it is absent, no file check runs and
 * stats.files_checked is false.
 *
 * Sections: headings are lines starting with 1-6 `#` plus a
 * space; the heading text is the remainder trimmed, with any
 * trailing closing `#`s stripped. Each `required_sections`
 * entry with no matching heading (trimmed, case-insensitive)
 * is a MISSING_SECTION issue (line null).
 *
 * `valid` is true iff there are no issues. A missing or empty
 * `content` is an error, never a fabricated report.
 */
import type { SkillIssue, ValidateSkillResult } from "./types.js";

export const VERSION = "0.1.0";

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LINK_PATTERN = /\[([^\]]*)\]\(([^)]+)\)/g;
const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;

function stringList(value: unknown, label: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value as string[];
}

/** Validate a SKILL.md document supplied as text. */
export function validateSkill(
  content: unknown,
  availableFiles?: unknown,
  requiredSections?: unknown,
): ValidateSkillResult {
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("content is required");
  }
  const files = stringList(availableFiles, "available_files");
  const required = stringList(requiredSections, "required_sections") ?? [];

  const lines = content.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  const issues: SkillIssue[] = [];
  const frontmatter_fields: string[] = [];
  let name: string | null = null;
  let nameLine: number | null = null;
  let bodyStart = 0; // 0-based index of the first body line

  if (lines[0]?.trim() !== "---") {
    issues.push({
      code: "NO_FRONTMATTER",
      message: "document does not start with a frontmatter block (---)",
      line: 1,
    });
    bodyStart = 0;
  } else {
    let closing = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        closing = i;
        break;
      }
    }
    if (closing === -1) {
      issues.push({
        code: "UNCLOSED_FRONTMATTER",
        message: "frontmatter block is not closed with a --- line",
        line: 1,
      });
      bodyStart = lines.length;
    } else {
      const values = new Map<string, string>();
      for (let i = 1; i < closing; i++) {
        const m = /^([^:]+):\s*(.*)$/.exec(lines[i]);
        if (!m) continue;
        const key = m[1].trim();
        if (!key) continue;
        frontmatter_fields.push(key);
        if (!values.has(key)) {
          values.set(key, m[2].trim());
          if (key === "name") nameLine = i + 1;
        }
      }
      if (!values.has("name")) {
        issues.push({
          code: "MISSING_NAME",
          message: "frontmatter has no name field",
          line: null,
        });
      } else {
        name = values.get("name") ?? null;
        if (!NAME_PATTERN.test(name ?? "")) {
          issues.push({
            code: "BAD_NAME_FORMAT",
            message: `name '${name ?? ""}' is not a kebab-case slug`,
            line: nameLine,
          });
        }
      }
      if (!values.has("description")) {
        issues.push({
          code: "MISSING_DESCRIPTION",
          message: "frontmatter has no description field",
          line: null,
        });
      }
      bodyStart = closing + 1;
      const bodyText = lines.slice(bodyStart).join("\n");
      if (bodyText.trim() === "") {
        issues.push({
          code: "EMPTY_BODY",
          message: "nothing but whitespace after the frontmatter block",
          line: null,
        });
      }
    }
  }

  // ---- Body: links and headings ---------------------------------
  const filesChecked = files !== undefined;
  const fileSet = new Set(files ?? []);
  let link_count = 0;
  let relative_link_count = 0;
  let section_count = 0;
  const headingTexts: string[] = [];

  for (let idx = bodyStart; idx < lines.length; idx++) {
    const lineNo = idx + 1;
    const line = lines[idx];

    const heading = HEADING_PATTERN.exec(line);
    if (heading) {
      section_count++;
      headingTexts.push(heading[2].trim().replace(/\s+#+$/, "").trim());
    }

    LINK_PATTERN.lastIndex = 0;
    let link: RegExpExecArray | null;
    while ((link = LINK_PATTERN.exec(line)) !== null) {
      link_count++;
      let target = link[2].trim();
      if (target.startsWith("<") && target.endsWith(">")) {
        target = target.slice(1, -1).trim();
      }
      const lower = target.toLowerCase();
      if (
        lower.startsWith("http://") ||
        lower.startsWith("https://") ||
        lower.startsWith("mailto:") ||
        target.startsWith("#")
      ) {
        continue; // external / anchor: counted, never checked
      }
      relative_link_count++;
      let rel = target.split("#")[0].trim();
      if (rel.startsWith("<") && rel.endsWith(">")) {
        rel = rel.slice(1, -1).trim();
      }
      if (filesChecked && rel !== "" && !fileSet.has(rel)) {
        issues.push({
          code: "MISSING_FILE",
          message: `linked file '${rel}' is not in available_files`,
          line: lineNo,
        });
      }
    }
  }

  // ---- Required sections ----------------------------------------
  const headingSet = new Set(headingTexts.map((h) => h.trim().toLowerCase()));
  for (const section of required) {
    if (!headingSet.has(section.trim().toLowerCase())) {
      issues.push({
        code: "MISSING_SECTION",
        message: `required section '${section}' has no matching heading`,
        line: null,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    stats: {
      frontmatter_fields,
      name,
      link_count,
      relative_link_count,
      section_count,
      files_checked: filesChecked,
    },
  };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
