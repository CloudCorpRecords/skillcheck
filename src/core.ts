/**
 * skillcheck core: validate a SKILL.md document.
 *
 * Checks frontmatter presence and shape, that the frontmatter name
 * matches the containing directory, that the description is present
 * and long enough, that markdown links and image references resolve
 * to files that exist, that backticked file references exist, and
 * that the body carries at least one heading.
 *
 * The frontmatter parser is a small subset of YAML by design: the
 * file must start with a --- line, a closing --- line, and simple
 * key: value lines in between. No YAML dependency is used, and no
 * code or content from the checked skill is ever executed.
 * Static analysis only, Node standard library only.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { Finding, Report, Severity } from "./types.js";

export const VERSION = "0.1.0";
export const CLEAN_VERDICT = "VALID";

const SEVERITY_ORDER: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

/** Directory names that never carry the skill name, so the match check is skipped. */
const GENERIC_DIR_NAMES = new Set(["skills", "skill"]);

/** Extensions that make a bare backticked token look like a file name. */
const FILE_EXTENSIONS = new Set([
  "md",
  "markdown",
  "txt",
  "json",
  "jsonc",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "sh",
  "bash",
  "zsh",
  "html",
  "htm",
  "css",
  "scss",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "csv",
  "tsv",
  "xml",
  "sql",
  "lock",
]);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isAbsoluteUrl(target: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target);
}

function stripFragmentAndQuery(target: string): string {
  return target.split("#")[0].split("?")[0];
}

function decodePath(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function cleanLinkTarget(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("<")) {
    const end = t.indexOf(">");
    if (end > 0) return t.slice(1, end);
  }
  return t.split(/\s+/)[0] ?? "";
}

/**
 * Decide whether a backticked token looks like a relative file path.
 * A token qualifies when it has no spaces, is not an absolute path,
 * a home path, a URL, or a glob, and either contains a slash or ends
 * with a known file extension. Bare dotted names such as tool names
 * (for example artifact.list) do not qualify, because their suffix
 * is not a known file extension.
 */
function looksLikeFileRef(candidate: string): boolean {
  const t = candidate.trim();
  if (t.length < 3) return false;
  if (/\s/.test(t)) return false;
  if (t.startsWith("/") || t.startsWith("~/")) return false;
  if (t.startsWith("#") || t.startsWith("$") || t.startsWith("{")) return false;
  if (isAbsoluteUrl(t)) return false;
  if (/[*<>{}()[\]'"=,;!@$%^&|\\]/.test(t)) return false;
  if (t.includes(":")) return false;
  const cleaned = stripFragmentAndQuery(t).replace(/[,;:]$/, "");
  if (cleaned.length < 3) return false;
  if (cleaned.includes("/")) {
    return /^[\w\-./]+$/.test(cleaned);
  }
  const m = /^[\w-]+\.([A-Za-z0-9]{1,10})$/.exec(cleaned);
  if (!m) return false;
  if (/^\d+$/.test(m[1])) return false;
  return FILE_EXTENSIONS.has(m[1].toLowerCase());
}

interface FrontmatterEntry {
  value: string;
  line: number;
}

function parseFrontmatter(lines: string[]): {
  present: boolean;
  entries: Map<string, FrontmatterEntry>;
  bodyStart: number;
} {
  const entries = new Map<string, FrontmatterEntry>();
  if (lines.length === 0 || lines[0].trim() !== "---") {
    return { present: false, entries, bodyStart: 0 };
  }
  let closing = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closing = i;
      break;
    }
  }
  if (closing === -1) {
    return { present: false, entries, bodyStart: 0 };
  }
  for (let i = 1; i < closing; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    if (key === "" || entries.has(key)) continue;
    let value = trimmed.slice(colon + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1).trim();
    }
    entries.set(key, { value, line: i + 1 });
  }
  return { present: true, entries, bodyStart: closing + 1 };
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      (a.file ?? "").localeCompare(b.file ?? "") ||
      (a.line ?? 0) - (b.line ?? 0) ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0) ||
      (a.evidence ?? "").localeCompare(b.evidence ?? "") ||
      a.message.localeCompare(b.message),
  );
}

function buildReport(
  target: string,
  rawFindings: Finding[],
  extra: { linksChecked: number; refsChecked: number; externalLinks: number },
): Report {
  const findings = sortFindings(rawFindings);
  const counts: Record<string, number> = {
    findings: findings.length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length,
    linksChecked: extra.linksChecked,
    refsChecked: extra.refsChecked,
    externalLinks: extra.externalLinks,
  };
  const verdict =
    counts.high > 0 || counts.medium > 0 ? "INVALID" : CLEAN_VERDICT;
  const summary =
    verdict === CLEAN_VERDICT
      ? `VALID: no high or medium findings (${counts.findings} finding(s) total, ${counts.low} low, ${counts.info} info).`
      : `INVALID: ${counts.findings} finding(s) (${counts.high} high, ${counts.medium} medium, ${counts.low} low, ${counts.info} info).`;
  return {
    tool: "skillcheck",
    version: VERSION,
    target,
    verdict,
    counts,
    findings,
    summary,
  };
}

function missingFileReport(target: string): Report {
  const finding: Finding = {
    rule: "NO-SKILL-FILE",
    severity: "high",
    file: "SKILL.md",
    message: "No SKILL.md found at the target path.",
    evidence: target,
  };
  return buildReport(target, [finding], {
    linksChecked: 0,
    refsChecked: 0,
    externalLinks: 0,
  });
}

/* ------------------------------------------------------------------ */
/* Main check                                                          */
/* ------------------------------------------------------------------ */

export function runCheck(target: string): Report {
  const resolved = resolve(target);

  let skillFile: string;
  let skillDir: string;
  let isFileTarget = false;
  let st: ReturnType<typeof statSync> | undefined;
  try {
    st = statSync(resolved);
  } catch {
    st = undefined;
  }
  if (!st) {
    return missingFileReport(target);
  }
  if (st.isFile()) {
    skillFile = resolved;
    skillDir = dirname(resolved);
    isFileTarget = true;
  } else if (st.isDirectory()) {
    skillFile = join(resolved, "SKILL.md");
    skillDir = resolved;
    if (!existsSync(skillFile)) {
      return missingFileReport(target);
    }
  } else {
    return missingFileReport(target);
  }
  void isFileTarget;

  let content: string;
  try {
    content = readFileSync(skillFile, "utf8");
  } catch {
    return missingFileReport(target);
  }
  if (content.startsWith("\uFEFF")) content = content.slice(1);
  const allLines = content.split(/\r?\n/);
  const findings: Finding[] = [];
  const fileLabel = "SKILL.md";

  const { present, entries, bodyStart } = parseFrontmatter(allLines);

  let skillName: string | undefined;
  let nameLine = 1;

  if (!present) {
    findings.push({
      rule: "FRONTMATTER-MISSING",
      severity: "high",
      file: fileLabel,
      line: 1,
      message:
        "SKILL.md must start with a frontmatter block: a --- line, simple key: value lines, and a closing --- line.",
    });
  } else {
    const nameEntry = entries.get("name");
    if (!nameEntry || nameEntry.value === "") {
      findings.push({
        rule: "NAME-MISSING",
        severity: "high",
        file: fileLabel,
        line: 1,
        message: "Frontmatter has no name key, or the name value is empty.",
      });
    } else {
      skillName = nameEntry.value;
      nameLine = nameEntry.line;
    }

    const descEntry = entries.get("description");
    if (!descEntry || descEntry.value === "") {
      findings.push({
        rule: "DESCRIPTION-MISSING",
        severity: "high",
        file: fileLabel,
        line: 1,
        message: "Frontmatter has no description key, or the description value is empty.",
      });
    } else if (descEntry.value.length < 20) {
      findings.push({
        rule: "DESCRIPTION-SHORT",
        severity: "low",
        file: fileLabel,
        line: descEntry.line,
        message: `Frontmatter description is ${descEntry.value.length} character(s); at least 20 are required.`,
        evidence: descEntry.value,
      });
    }

    if (skillName !== undefined) {
      const dirName = basename(skillDir);
      const rawTarget = target.trim();
      const isDotTarget = rawTarget === "." || rawTarget === "./";
      if (isDotTarget || GENERIC_DIR_NAMES.has(dirName) || dirName === "") {
        findings.push({
          rule: "NAME-DIR-SKIPPED",
          severity: "info",
          file: fileLabel,
          line: nameLine,
          message:
            "Name and directory match check skipped: the target directory name is generic and does not carry the skill name.",
          evidence: dirName,
        });
      } else if (skillName !== dirName) {
        findings.push({
          rule: "NAME-DIR-MISMATCH",
          severity: "medium",
          file: fileLabel,
          line: nameLine,
          message: `Frontmatter name "${skillName}" does not match the containing directory name "${dirName}".`,
          evidence: `${skillName} != ${dirName}`,
        });
      }
    }
  }

  /* Body checks. The body is everything after the frontmatter block,
   * or the whole file when there is no frontmatter. Fenced code
   * blocks are skipped for headings, links, and references. */
  let linksChecked = 0;
  let refsChecked = 0;
  let externalLinks = 0;
  let headingCount = 0;
  let inFence = false;

  const linkRe = /!?\[[^\]]*\]\(([^)]+)\)/g;
  const codeRe = /`([^`\n]+)`/g;

  for (let idx = bodyStart; idx < allLines.length; idx++) {
    const lineText = allLines[idx];
    const lineNo = idx + 1;
    const trimmed = lineText.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (/^#{1,2}\s+\S/.test(lineText)) headingCount += 1;

    linkRe.lastIndex = 0;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRe.exec(lineText)) !== null) {
      const rawTarget = cleanLinkTarget(linkMatch[1]);
      if (rawTarget === "") continue;
      if (rawTarget.startsWith("#")) continue;
      if (isAbsoluteUrl(rawTarget)) {
        externalLinks += 1;
        continue;
      }
      if (rawTarget.startsWith("/")) {
        externalLinks += 1;
        continue;
      }
      const rel = stripFragmentAndQuery(rawTarget);
      if (rel === "") continue;
      linksChecked += 1;
      const dest = resolve(join(skillDir, decodePath(rel)));
      if (!existsSync(dest)) {
        findings.push({
          rule: "LINK-DEAD",
          severity: "medium",
          file: fileLabel,
          line: lineNo,
          message: `Markdown link target "${rel}" does not exist relative to the skill directory.`,
          evidence: rel,
        });
      }
    }

    codeRe.lastIndex = 0;
    let codeMatch: RegExpExecArray | null;
    while ((codeMatch = codeRe.exec(lineText)) !== null) {
      const candidate = codeMatch[1].trim();
      if (!looksLikeFileRef(candidate)) continue;
      const rel = stripFragmentAndQuery(candidate).replace(/[,;:]$/, "");
      refsChecked += 1;
      const dest = resolve(join(skillDir, decodePath(rel)));
      if (!existsSync(dest)) {
        findings.push({
          rule: "REF-MISSING",
          severity: "medium",
          file: fileLabel,
          line: lineNo,
          message: `Referenced file "${rel}" does not exist relative to the skill directory.`,
          evidence: rel,
        });
      }
    }
  }

  if (headingCount === 0) {
    findings.push({
      rule: "NO-HEADINGS",
      severity: "low",
      file: fileLabel,
      line: bodyStart + 1,
      message: "Body has no # or ## heading.",
    });
  }

  return buildReport(target, findings, {
    linksChecked,
    refsChecked,
    externalLinks,
  });
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

export function renderReport(report: Report): string {
  const out: string[] = [];
  out.push(`skillcheck check ${report.target}: ${report.verdict}`);
  out.push(
    `  findings: ${report.counts.findings} (high: ${report.counts.high}, medium: ${report.counts.medium}, low: ${report.counts.low}, info: ${report.counts.info}), links checked: ${report.counts.linksChecked}, refs checked: ${report.counts.refsChecked}, external links skipped: ${report.counts.externalLinks}`,
  );
  for (const f of report.findings) {
    const loc = f.line ? `${f.file ?? "SKILL.md"}:${f.line}` : (f.file ?? "SKILL.md");
    out.push(`  [${f.severity.toUpperCase()}] ${loc} ${f.rule} ${f.message}`);
  }
  out.push(report.summary);
  return out.join("\n");
}
