import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "invalid_request"
    });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return res.status(500).json({
      error: "server_error"
    });
  }

  try {
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const { redirect_uris, client_name } = body || {};

    if (
      !Array.isArray(redirect_uris) ||
      redirect_uris.length === 0 ||
      redirect_uris.length > 10
    ) {
      return res.status(400).json({
        error: "invalid_client_metadata"
      });
    }

    for (const value of redirect_uris) {
      let uri;

      try {
        uri = new URL(value);
      } catch {
        return res.status(400).json({
          error: "invalid_redirect_uri"
        });
      }

      const local =
        ["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname);

      if (
        uri.username ||
        uri.password ||
        (uri.protocol !== "https:" &&
          !(local && uri.protocol === "http:"))
      ) {
        return res.status(400).json({
          error: "invalid_redirect_uri"
        });
      }
    }

    const supabase = createClient(url, key);
    const client_id = randomUUID();

    const { error } = await supabase
      .from("oauth_clients")
      .insert({
        client_id,
        client_name: String(client_name || "MCP Client").slice(0, 100),
        redirect_uris
      });

    if (error) {
      console.error("OAuth registration failed:", error.message);
      return res.status(500).json({
        error: "registration_failed"
      });
    }

    return res.status(201).json({
      client_id,
      client_name: String(client_name || "MCP Client").slice(0, 100),
      redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"]
    });
  } catch {
    return res.status(400).json({
      error: "invalid_request"
    });
  }
}
