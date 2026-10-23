import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

const BASE_URL = "https://sharebox-woad.vercel.app";

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).send("Server configuration missing.");
  }

  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  if (req.method === "GET") {
    const q = req.query || {};
    const clientId = String(q.client_id || "");
    const redirectUri = String(q.redirect_uri || "");
    const challenge = String(q.code_challenge || "");
    const state = String(q.state || "");

    if (
      q.response_type !== "code" ||
      q.code_challenge_method !== "S256" ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(challenge) ||
      clientId.length > 200 ||
      redirectUri.length > 2048 ||
      state.length > 1024
    ) {
      return res.status(400).send("Invalid OAuth request.");
    }

    const { data: client, error } = await supabase
      .from("oauth_clients")
      .select("client_id, client_name, redirect_uris")
      .eq("client_id", clientId)
      .maybeSingle();

    if (error) return res.status(500).send("Database error.");
    if (!client || !Array.isArray(client.redirect_uris) ||
        !client.redirect_uris.includes(redirectUri)) {
      return res.status(400).send("Unknown client or redirect URI.");
    }

    const csrf = randomBytes(24).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      state,
      csrf,
      exp: Date.now() + 5 * 60 * 1000
    })).toString("base64url");

    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (!secret || secret.length < 32) {
      return res.status(500).send("ACCESS_TOKEN_SECRET is not configured.");
    }

    const signature = createHash("sha256")
      .update(secret + "." + payload)
      .digest("base64url");

    const ticket = payload + "." + signature;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect ShareBox</title></head>
<body style="font:16px system-ui;max-width:560px;margin:40px auto;padding:20px">
<h2>Connect to ShareBox?</h2>
<p><b>${esc(client.client_name || "MCP client")}</b> is requesting access to list files in your public ShareBox bucket.</p>
<p>Only continue if you trust this client.</p>
<form method="POST" action="/api/oauth/authorize">
<input type="hidden" name="ticket" value="${esc(ticket)}">
<input type="hidden" name="csrf" value="${esc(csrf)}">
<button name="decision" value="deny" type="submit">Cancel</button>
<button name="decision" value="approve" type="submit">Approve</button>
</form></body></html>`);
  }

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") body = new URLSearchParams(body);
    if (body instanceof URLSearchParams) body = Object.fromEntries(body.entries());

    const ticket = String(body?.ticket || "");
    const csrf = String(body?.csrf || "");
    const decision = String(body?.decision || "");
    const secret = process.env.ACCESS_TOKEN_SECRET;

    if (!secret || secret.length < 32 || !ticket || !csrf) {
      return res.status(400).send("Invalid authorization form.");
    }

    const parts = ticket.split(".");
    if (parts.length !== 2) return res.status(400).send("Invalid ticket.");

    const [payload, signature] = parts;
    const expected = createHash("sha256")
      .update(secret + "." + payload)
      .digest("base64url");

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !a.length ||
        !requireTimingSafeEqual(a, b)) {
      return res.status(400).send("Invalid ticket signature.");
    }

    let data;
    try {
      data = JSON.parse(Buffer.from(payload, "base64url").toString());
    } catch {
      return res.status(400).send("Invalid ticket data.");
    }

    if (data.exp < Date.now() || data.csrf !== csrf) {
      return res.status(400).send("Expired form. Please restart connection.");
    }

    if (decision !== "approve") {
      const denied = new URL(data.redirect_uri);
      denied.searchParams.set("error", "access_denied");
      if (data.state) denied.searchParams.set("state", data.state);
      res.setHeader("Location", denied.toString());
      return res.status(302).end();
    }

    const { data: client, error } = await supabase
      .from("oauth_clients")
      .select("redirect_uris")
      .eq("client_id", data.client_id)
      .maybeSingle();

    if (error) return res.status(500).send("Database error.");
    if (!client || !client.redirect_uris?.includes(data.redirect_uri)) {
      return res.status(400).send("Client or redirect URI is no longer valid.");
    }

    const rawCode = randomBytes(32).toString("base64url");
    const codeHash = createHash("sha256").update(rawCode).digest("hex");

    const { error: insertError } = await supabase
      .from("oauth_authorization_codes")
      .insert({
        code_hash: codeHash,
        client_id: data.client_id,
        redirect_uri: data.redirect_uri,
        code_challenge: data.code_challenge,
        scope: "files:read",
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      });

    if (insertError) {
      console.error("Authorization code save failed:", insertError.message);
      return res.status(500).send("Could not create authorization code.");
    }

    const destination = new URL(data.redirect_uri);
    destination.searchParams.set("code", rawCode);
    if (data.state) destination.searchParams.set("state", data.state);

    res.setHeader("Location", destination.toString());
    return res.status(302).end();
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).send("Method not allowed.");
}

function requireTimingSafeEqual(a, b) {
  return a.length === b.length &&
    a.every((byte, index) => byte === b[index]);
}
