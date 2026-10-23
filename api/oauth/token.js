
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(501).json({
    error: "oauth_not_configured",
    message: "ShareBox OAuth token exchange is not implemented yet."
  });
}
