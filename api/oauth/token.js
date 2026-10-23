export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "method_not_allowed"
    });
  }

  return res.status(501).json({
    error: "oauth_setup_incomplete",
    error_description:
      "Secure token exchange is not configured yet."
  });
}
