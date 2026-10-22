
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const token = process.env.SHAREBOX_CONNECTOR_TOKEN;

  if (!token || req.headers.authorization !== `Bearer ${token}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return res.status(500).json({ error: "Server configuration missing" });
  }

  const supabase = createClient(url, key);

  const server = new McpServer({
    name: "sharebox",
    version: "1.0.0"
  });

  server.tool(
    "list_files",
    "List recent project files in ShareBox storage",
    { limit: z.number().int().min(1).max(50).optional() },
    async ({ limit = 20 }) => {
      const { data, error } = await supabase.storage
        .from("shared-files")
        .list("", {
          limit,
          sortBy: { column: "name", order: "desc" }
        });

      if (error) {
        return {
          content: [{ type: "text", text: error.message }],
          isError: true
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            (data || []).map(file => ({
              name: file.name,
              updated_at: file.updated_at,
              size: file.metadata?.size
            })),
            null,
            2
          )
        }]
      };
    }
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
