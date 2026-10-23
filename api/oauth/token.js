
import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT } from "jose";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "invalid_request" });
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

  try {
    let body = req.body;

    if (typeof body === "string") {
      body = new URLSearchParams(body);
    }

    if (body instanceof URLSearchParams) {
      body = Object.fromEntries(body.entries());
    }

    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "invalid_request" });
    }

    const {
      grant_type,
      code,
      redirect_uri,
      client_id,
      code_verifier
    } = body;

    if (
      grant_type !== "authorization_code" ||
      !code || !redirect_uri || !client_id ||
      typeof code_verifier !== "string" ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(code_verifier)
    ) {
      return res.status(400).json({ error: "invalid_request" });
    }

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: client, error: clientError } = await supabase
      .from("oauth_clients")
      .select("client_id, redirect_uris")
      .eq("client_id", client_id)
      .maybeSingle();

    if (clientError) throw clientError;

    if (!client || !Array.isArray(client.redirect_uris) ||
        !client.redirect_uris.includes(redirect_uri)) {
      return res.status(400).json({ error: "invalid_grant" });
    }

    const codeHash = createHash("sha256")
      .update(code)
      .digest("hex");

    const { data: authCode, error: codeError } = await supabase
      .from("oauth_authorization_codes")
      .select("id, client_id, redirect_uri, code_challenge, scope, expires_at, used_at")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (codeError) throw codeError;

    if (
      !authCode ||
      authCode.client_id !== client_id ||
      authCode.redirect_uri !== redirect_uri ||
      authCode.used_at ||
      new Date(authCode.expires_at).getTime() <= Date.now()
    ) {
      return res.status(400).json({ error: "invalid_grant" });
    }

    const verifierHash = createHash("sha256")
      .update(code_verifier)
      .digest("base64url");

    const expected = Buffer.from(authCode.code_challenge);
    const actual = Buffer.from(verifierHash);

    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return res.status(400).json({ error: "invalid_grant" });
    }

    const { data: consumed, error: consumeError } = await supabase
      .from("oauth_authorization_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", authCode.id)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id");

    if (consumeError) throw consumeError;

    if (!consumed || consumed.length !== 1) {
      return res.status(400).json({ error: "invalid_grant" });
    }

    const secret = new TextEncoder().encode(ACCESS_TOKEN_SECRET);

    const accessToken = await new SignJWT({
      client_id,
      scope: authCode.scope || ""
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://sharebox-woad.vercel.app")
      .setAudience("sharebox-mcp")
      .setSubject(client_id)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);

    return res.status(200).json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: authCode.scope || ""
    });
  } catch (error) {
    console.error("OAuth token exchange failed:", error.message);
    return res.status(500).json({ error: "server_error" });
  }
}
