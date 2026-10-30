# skillcheck

**A SKILL.md can point at files that are not there. Nothing notices until the skill runs.**

Skills are Markdown documents with YAML frontmatter: a name, a description, and a body that links to guides, scripts, and reference files the agent is told to read or run. When a link or a referenced file is missing, the failure shows up mid-task, inside someone else's workflow. skillcheck validates a SKILL.md before that happens: it checks the frontmatter shape, that the name matches its directory, and that every relative link and referenced file in the body actually exists on disk.

## What it does

skillcheck takes a SKILL.md file or a directory containing one and returns a single verdict with evidence per finding: rule, severity, file, and line. It is deterministic, runs offline, uses only the Node standard library, and never executes anything in the checked skill.

## Install

```bash
npx @reneturcios/skillcheck check
```

Or install it globally:

```bash
npm install -g @reneturcios/skillcheck
skillcheck check path/to/skill
```

## CLI

```bash
# Check the current directory (expects ./SKILL.md)
skillcheck check

# Check a skill directory
skillcheck check path/to/skill

# Check a SKILL.md file directly
skillcheck check path/to/skill/SKILL.md

# Machine readable output
skillcheck check path/to/skill --json

# Run as an MCP server (stdio)
skillcheck mcp

# Print the version
skillcheck --version
```

Exit codes: 0 when the verdict is VALID, 1 for INVALID, 2 for a usage error. A reader that closes the output pipe early makes the process exit 141, never 0.

Example output:

```text
skillcheck check path/to/skill: INVALID
  findings: 2 (high: 0, medium: 2, low: 0, info: 0), links checked: 1, refs checked: 1, external links skipped: 0
  [MEDIUM] SKILL.md:8 LINK-DEAD Markdown link target "missing-guide.md" does not exist relative to the skill directory.
  [MEDIUM] SKILL.md:10 REF-MISSING Referenced file "scripts/missing-helper.py" does not exist relative to the skill directory.
INVALID: 2 finding(s) (0 high, 2 medium, 0 low, 0 info).
```

## MCP server

Add to your MCP client config:

```json
{
  "mcpServers": {
    "skillcheck": {
      "command": "npx",
      "args": ["-y", "@reneturcios/skillcheck", "mcp"]
    }
  }
}
```

Tool: `check_skill` takes a `path` argument (a SKILL.md file or a directory containing one) and returns the full report as JSON, with the same verdict, counts, and findings as the CLI.

## What it checks

| rule | severity | what it means |
| --- | --- | --- |
| `NO-SKILL-FILE` | high | No SKILL.md found at the target path. This is the only finding for a missing target. |
| `FRONTMATTER-MISSING` | high | The file does not start with a --- line and a closing --- line. |
| `NAME-MISSING` | high | The frontmatter has no name key, or the name value is empty. |
| `DESCRIPTION-MISSING` | high | The frontmatter has no description key, or the description value is empty. |
| `DESCRIPTION-SHORT` | low | The description is present but shorter than 20 characters. |
| `NAME-DIR-MISMATCH` | medium | The frontmatter name does not match the containing directory name. |
| `NAME-DIR-SKIPPED` | info | The name and directory match check was skipped because the target directory name is generic and does not carry the skill name, for example when the target is the current directory. |
| `LINK-DEAD` | medium | A relative markdown link or image reference does not exist relative to the skill directory. The finding carries the line number. |
| `REF-MISSING` | medium | A backticked relative path that looks like a file (it contains a slash, or ends with a known file extension) does not exist relative to the skill directory. |
| `NO-HEADINGS` | low | The body has no # or ## heading. |

Absolute URLs in links (for example https:// links) are skipped: they are counted in the report under `externalLinks` and never produce a finding. Anchor-only links are skipped as well. Links and references inside fenced code blocks are not checked.

The report counts are `findings`, `high`, `medium`, `low`, `info`, `linksChecked`, `refsChecked`, and `externalLinks`.

## Verdict rules

- **VALID**: no high and no medium findings. Low and info findings may be present. Exit code 0.
- **INVALID**: at least one high or medium finding. Exit code 1.

## Limits, stated plainly

- The frontmatter parser is a simple subset of YAML, by design. It reads a file that starts with a --- line, a closing --- line, and simple key: value lines in between. It does not support multi-line values, folded or block scalars, nested maps, lists, anchors, or comments inside values. A SKILL.md that needs those features will be reported as missing keys it may in fact carry in a richer form.
- Only simple key: value frontmatter is understood, so name and description must be plain single-line values, quoted or unquoted.
- Link checking is literal. A relative link target, stripped of any fragment or query string, must exist as written relative to the skill directory. Redirects, generated files, and links that a build step would create are not predicted.
- Backticked references are a heuristic. A token only counts as a file reference when it has no spaces, is not an absolute or home path, and either contains a slash or ends with a known file extension. Tool names, commands, and identifiers with dots are not treated as files.
- The semantic quality of the skill text is out of scope. skillcheck does not judge whether the instructions are correct, clear, safe, or useful, whether linked content says what the link text claims, or whether a referenced script does what the skill says it does. It checks presence and shape only.
- Frontmatter values beyond name and description are not validated, and extra keys are ignored.
