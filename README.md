# skillcheck

Is this SKILL.md well-formed? skillcheck answers from the text
itself: it parses the frontmatter block, checks the body, walks
the markdown links, and compares the headings against the
sections a skill is supposed to have — then reports every
finding as a coded issue, plus the statistics it collected:

- `NO_FRONTMATTER` — the document does not start with a `---`
  line
- `UNCLOSED_FRONTMATTER` — the frontmatter block never closes
- `MISSING_NAME` / `MISSING_DESCRIPTION` — a required
  frontmatter field is absent
- `BAD_NAME_FORMAT` — the `name` value is not a kebab-case slug
  (`^[a-z0-9]+(-[a-z0-9]+)*$`)
- `EMPTY_BODY` — nothing but whitespace after the frontmatter
- `MISSING_FILE` — a relative link target is not in the
  caller-supplied list of files that exist next to the skill
- `MISSING_SECTION` — a required heading has no matching
  markdown heading (compared trimmed, case-insensitively, at
  any heading level)

Links to `http://`, `https://`, `mailto:`, and `#anchor`
targets are counted but never checked. Relative targets have
any `#anchor` suffix and surrounding `<>` stripped before the
file check. Nothing is read from disk and nothing is fetched:
the caller supplies the document text and the file list, so
the same input always gives the same report.

## CLI

```bash
npx @reneturcios/skillcheck validate --skill SKILL.md --files files.json --sections sections.json
npx @reneturcios/skillcheck --version
```

`files.json` and `sections.json` are each a JSON array of
strings, and both flags are optional. Omitting `--files`
skips the file check entirely (the report's
`stats.files_checked` is then `false`).

Exit codes: `0` whenever the tool ran — a document that fails
validation is a result, not a process failure — `1` on a
runtime error, `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/skillcheck mcp
```

MCP client config:

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

### Tools

- `validate_skill` — Validate a SKILL.md document and report
  `{valid, issues, stats}`.
  - `content` (string, required) — the SKILL.md text
  - `available_files` (array of strings, optional) — relative
    paths that exist next to the skill; relative links are
    checked against it
  - `required_sections` (array of strings, optional) — heading
    texts that must appear as markdown headings

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/skillcheck
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/skillcheck validate --skill /w/SKILL.md
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
