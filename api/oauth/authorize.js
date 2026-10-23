
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const clientId = req.query.client_id;
  const redirectUri = req.query.redirect_uri;

  if (!clientId || !redirectUri) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "Missing client_id or redirect_uri"
    });
  }

  return res.status(501).json({
    error: "not_implemented",
    message: "OAuth authorization flow still needs to be implemented."
  });
}
