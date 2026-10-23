export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "method_not_allowed"
    });
  }

  const {
    client_id,
    redirect_uri,
    response_type,
    code_challenge,
    code_challenge_method
  } = req.query;

  if (
    !client_id ||
    !redirect_uri ||
    response_type !== "code" ||
    !code_challenge ||
    code_challenge_method !== "S256"
  ) {
    return res.status(400).json({
      error: "invalid_request",
      error_description:
        "Required OAuth and PKCE parameters are missing."
    });
  }

  return res.status(501).json({
    error: "oauth_setup_incomplete",
    error_description:
      "Client registration, redirect validation, user consent and secure code issuance must be implemented."
  });
}
