
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(501).json({
    error: "oauth_not_configured",
    message: "ShareBox OAuth authorization is not implemented yet."
  });
}
