export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "method_not_allowed"
    });
  }

  return res.status(200).json({
    issuer: "https://sharebox-woad.vercel.app",
    authorization_endpoint:
      "https://sharebox-woad.vercel.app/api/oauth/authorize",
    token_endpoint:
      "https://sharebox-woad.vercel.app/api/oauth/token",
    registration_endpoint:
      "https://sharebox-woad.vercel.app/api/oauth/register",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"]
  });
}
