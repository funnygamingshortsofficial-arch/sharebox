
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "invalid_request",
      error_description: "POST required"
    });
  }

  return res.status(501).json({
    error: "unsupported_grant_type",
    error_description:
      "OAuth token exchange is not implemented yet."
  });
}
