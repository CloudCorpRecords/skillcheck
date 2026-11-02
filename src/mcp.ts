/**
 * skillcheck MCP server. Tools: validate_skill.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schemas as explicit literals, while zod
 * still validates every tools/call argument set.
 *
 * Validation is pure local text analysis: no network, no
 * filesystem, no configuration.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { formatPayload, validateSkill, VERSION } from "./skillcheck.js";

const ValidateArgs = z.object({
  content: z.string().min(1),
  available_files: z.array(z.string()).optional(),
  required_sections: z.array(z.string()).optional(),
});

const TOOLS = [
  {
    name: "validate_skill",
    description:
      "Validate a SKILL.md file: check frontmatter, structure, links, and referenced files.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "The SKILL.md text" },
        available_files: {
          type: "array",
          description: "Relative paths that exist next to the skill (optional)",
          items: { type: "string" },
        },
        required_sections: {
          type: "array",
          description: "Heading texts that must appear as markdown headings (optional)",
          items: { type: "string" },
        },
      },
      required: ["content"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "skillcheck", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "validate_skill") {
      const parsed = ValidateArgs.parse(args ?? {});
      out = validateSkill(parsed.content, parsed.available_files, parsed.required_sections);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
