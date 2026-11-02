/**
 * skillcheck types.
 *
 * skillcheck validates a single SKILL.md document supplied as
 * text. It checks the YAML-style frontmatter block (presence,
 * closure, a kebab-case `name`, and a `description`), whether
 * the body is non-empty, whether relative markdown links point
 * at files the caller says exist, and whether required heading
 * sections are present. All checks are local and deterministic:
 * no filesystem, no network — the caller supplies the file
 * list.
 */

export type IssueCode =
  | "NO_FRONTMATTER"
  | "UNCLOSED_FRONTMATTER"
  | "MISSING_NAME"
  | "MISSING_DESCRIPTION"
  | "BAD_NAME_FORMAT"
  | "EMPTY_BODY"
  | "MISSING_FILE"
  | "MISSING_SECTION";

/** One validation finding. `line` is 1-based, or null when the
 *  finding is not tied to a single line. */
export interface SkillIssue {
  code: IssueCode;
  message: string;
  line: number | null;
}

/** Summary statistics for the validated document. */
export interface SkillStats {
  /** Frontmatter field names, in the order they appear. */
  frontmatter_fields: string[];
  /** The frontmatter `name` value, or null when absent. */
  name: string | null;
  /** All markdown links found in the body. */
  link_count: number;
  /** Body links whose target is a relative reference. */
  relative_link_count: number;
  /** Markdown headings found in the body. */
  section_count: number;
  /** True when `available_files` was provided and relative
   *  links were checked against it. */
  files_checked: boolean;
}

/** The validation report. `valid` is true iff `issues` is empty. */
export interface ValidateSkillResult {
  valid: boolean;
  issues: SkillIssue[];
  stats: SkillStats;
}
