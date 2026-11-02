# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `validate_skill` MCP tool and `validate` CLI
  command validating a SKILL.md document supplied as text.
- Frontmatter checks: NO_FRONTMATTER, UNCLOSED_FRONTMATTER,
  MISSING_NAME, MISSING_DESCRIPTION, BAD_NAME_FORMAT (kebab-case
  slug), and EMPTY_BODY.
- Relative markdown links checked against a caller-supplied
  file list (MISSING_FILE); required heading sections checked
  case-insensitively (MISSING_SECTION).
