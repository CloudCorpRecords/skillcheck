/**
 * skillcheck MCP server. Tool: check_skill.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runCheck, VERSION } from "./core.js";

const server = new McpServer({ name: "skillcheck", version: VERSION });

server.tool(
  "check_skill",
  "Validate a SKILL.md file or a skill directory: YAML frontmatter exists with name and description, the name matches the directory, links in the body resolve to files that exist, and files the skill references are present. Verdict VALID or INVALID with file and line evidence.",
  {
    path: z.string().describe("Target path to check"),
  },
  async ({ path }) => {
    const report = runCheck(path);
    return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }] };
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
