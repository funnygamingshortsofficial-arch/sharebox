
import { createClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.SHAREBOX_CONNECTOR_TOKEN;
  const auth = req.headers.authorization || "";

  if (!token || auth !== `Bearer ${token}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const server = new McpServer({
      name: "sharebox",
      version: "1.0.0"
    });

    server.tool(
      "list_files",
      "List files stored in ShareBox",
      { limit: z.number().int().min(1).max(100).optional() },
      async ({ limit = 10 }) => {
        const { data, error } = await supabase.storage
          .from("shared-files")
          .list("", {
            limit,
            sortBy: { column: "name", order: "desc" }
          });

        if (error) {
          return {
            isError: true,
            content: [{ type: "text", text: error.message }]
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(data, null, 2)
          }]
        };
      }
    );

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("ShareBox MCP error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "MCP server error" });
    }
  }
}
