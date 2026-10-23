
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";

const ISSUER = "https://sharebox-woad.vercel.app";
const AUDIENCE = "sharebox-mcp";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    ACCESS_TOKEN_SECRET
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY ||
      !ACCESS_TOKEN_SECRET || ACCESS_TOKEN_SECRET.length < 32) {
    return res.status(500).json({ error: "server_configuration_missing" });
  }

  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer ([^\s]+)$/);

  if (!match) {
    res.setHeader(
      "WWW-Authenticate",
      'Bearer resource_metadata="https://sharebox-woad.vercel.app/.well-known/oauth-protected-resource"'
    );
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const secret = new TextEncoder().encode(ACCESS_TOKEN_SECRET);
    const { payload, protectedHeader } = await jwtVerify(match[1], secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"]
    });

    if (
      protectedHeader.alg !== "HS256" ||
      typeof payload.client_id !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return res.status(401).json({ error: "invalid_token" });
    }
  } catch {
    res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
    return res.status(401).json({ error: "invalid_token" });
  }

  try {
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const server = new McpServer({
      name: "sharebox",
      version: "1.2.0"
    });

    server.tool(
      "list_files",
      "List recent files uploaded to ShareBox",
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
            isError: true,
            content: [{
              type: "text",
              text: `Could not list files: ${error.message}`
            }]
          };
        }

        const files = (data || []).map((file) => ({
          name: file.name,
          updated_at: file.updated_at,
          size: file.metadata?.size,
          url:
            `${SUPABASE_URL}/storage/v1/object/public/shared-files/` +
            encodeURIComponent(file.name)
        }));

        return {
          content: [{
            type: "text",
            text: JSON.stringify(files, null, 2)
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
  } catch (error) {
    console.error("ShareBox MCP error:", error.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: "internal_server_error" });
    }
  }
}
