# skillcheck — Build Report

MCP Rebuild 1000, Batch 12. **Original build** from the
program's own packages-100 plan
(`~/workspace/packages-100/100-packages-plan.md`, cluster C
#32: "skillcheck — Validates a SKILL.md: structure,
frontmatter, links, referenced files exist."), NOT a rebuild
of an external server. The tool surface is the program's
defined spec in `specs-batch12/skillcheck.md`, recorded in
`harness/fixtures/skillcheck-tools-original.json` with its
`_source` labelled "program spec". Local build only —
nothing pushed or published.

Identity: repo `skillcheck`, npm `@reneturcios/skillcheck`,
MCP name `io.github.CloudCorpRecords/skillcheck`, version
`0.1.0`, bin `skillcheck` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Validate a
  SKILL.md file: frontmatter, structure, links, and
  referenced files, deterministically.", 97 chars ≤100; npm
  entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/skillcheck:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/skillcheck"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`validate --skill <path>
  [--files <files.json>] [--sections <sections.json>]`,
  `mcp`, `--version`; exit 0 when the tool ran even when
  `valid` is false, 1 runtime error, 2 usage error, argument
  validation before any file is read), `src/mcp.ts`,
  `src/types.ts`, `src/skillcheck.ts` (core,
  `VERSION = "0.1.0"`)
- `test/skillcheck.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container IMAGE = `ghcr.io/cloudcorprecords/skillcheck`)

## Tools implemented (1)

- `validate_skill` — `content` (string, required),
  `available_files` (array of strings, optional),
  `required_sections` (array of strings, optional). Returns
  `{valid, issues, stats}` where each issue is
  `{code, message, line}` and stats carries
  `frontmatter_fields` (in order), `name` (or null),
  `link_count`, `relative_link_count`, `section_count`, and
  `files_checked`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with
  explicit inputSchema literals exactly matching the
  fixture, per the standing fleet rule; zod still validates
  every `tools/call`.
- Frontmatter checks fire in spec order: NO_FRONTMATTER
  (line 1), UNCLOSED_FRONTMATTER (line 1), MISSING_NAME,
  MISSING_DESCRIPTION, BAD_NAME_FORMAT (kebab-case
  `^[a-z0-9]+(-[a-z0-9]+)*$`, reported at the name field's
  line), EMPTY_BODY. Local choices where the spec is silent:
  when the frontmatter is absent or unclosed, the
  field-level checks do not fire (there is no closed block
  to inspect); MISSING_NAME / MISSING_DESCRIPTION /
  EMPTY_BODY carry line null.
- Links: `http://`, `https://`, `mailto:`, and `#` targets
  are counted but never checked. Other targets are relative:
  any `#anchor` suffix and surrounding `<>` are stripped,
  and when `available_files` is provided a target not in
  the list is a MISSING_FILE issue at the link's line. When
  `available_files` is absent no file check runs and
  `stats.files_checked` is false.
- Sections: headings are 1–6 `#` plus a space; the heading
  text is trimmed with trailing closing `#`s stripped.
  Required sections match trimmed and case-insensitively;
  a miss is a MISSING_SECTION issue with line null.
- Pure local text analysis: no filesystem, no network, no
  configuration. A missing or empty `content` is an error
  (MCP `isError`; CLI exit 1), never a fabricated report.

## Verification (foreground, this session)

- `npx tsc` exit 0 (`dist/cli.js` built)
- `npm test`: **24 tests, 24 pass, 0 fail** — every issue
  code pinned positive and negative (NO_FRONTMATTER,
  UNCLOSED_FRONTMATTER, MISSING_NAME, MISSING_DESCRIPTION,
  BAD_NAME_FORMAT, EMPTY_BODY, MISSING_FILE,
  MISSING_SECTION), the kebab-case name rule (7 bad shapes
  rejected, 5 good shapes accepted), link classes (external
  / anchor / mailto counted but unchecked, relative checked
  only when `available_files` is given, `#anchor` stripped,
  `<>` stripped), case-insensitive trimmed section matching
  at any heading level, the stats shape, and the
  `files_checked` flag both ways
- `dist/cli.js --version` → `0.1.0`; `validate` on an
  invalid sample (BAD_NAME_FORMAT + MISSING_FILE +
  MISSING_SECTION) prints the report and exits **0**;
  an unknown command exits 2 with usage
- Parity: `harness/parity.py` vs
  `harness/fixtures/skillcheck-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (program-spec
  fixture)

## Lockfile status

`package-lock.json` generated clean via Route 3 (temp copy
with only `package.json`, offline `npm install
--package-lock-only --ignore-scripts --offline`), verified:
parses, name `@reneturcios/skillcheck`, **128 package
entries**.

## Gaps / honest notes

- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- No external original exists for this program build, so
  there is no upstream behaviour to compare against; the
  spec in `specs-batch12/skillcheck.md` is the sole source
  of truth.
