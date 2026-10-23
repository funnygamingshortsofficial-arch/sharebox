
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  const token = process.env.SHAREBOX_CONNECTOR_TOKEN;

  if (!token || req.headers.authorization !== `Bearer ${token}`) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: "Server configuration missing"
    });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const server = new McpServer({
      name: "sharebox",
      version: "1.0.0"
    });

    server.tool(
      "list_files",
      "List recent files uploaded to ShareBox",
      {
        limit: z.number().int().min(1).max(50).optional()
      },
      async ({ limit = 20 }) => {
        const { data, error } = await supabase.storage
          .from("shared-files")
          .list("", {
            limit,
            sortBy: {
              column: "name",
              order: "desc"
            }
          });

        if (error) {
          throw new Error(error.message);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                (data || []).map((file) => ({
                  name: file.name,
                  updated_at: file.updated_at,
                  size: file.metadata?.size,
                  url:
                    `${supabaseUrl}/storage/v1/object/public/shared-files/` +
                    encodeURIComponent(file.name)
                })),
                null,
                2
              )
            }
          ]
        };
      }
    );

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("ShareBox MCP error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: "Internal server error"
      });
    }
  }
}
