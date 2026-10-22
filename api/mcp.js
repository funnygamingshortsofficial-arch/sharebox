import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "list_files",
      "List recent files in ShareBox storage",
      {
        limit: z.number().int().min(1).max(50).optional(),
      },
      async ({ limit = 20 }) => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!url || !key) {
          throw new Error("Supabase server configuration is missing");
        }

        const supabase = createClient(url, key);

        const { data, error } = await supabase.storage
          .from("shared-files")
          .list("", {
            limit,
            sortBy: { column: "name", order: "desc" },
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
                })),
                null,
                2
              ),
            },
          ],
        };
      }
    );
  },
  {},
  { basePath: "/api" }
);

export { handler as GET, handler as POST };
