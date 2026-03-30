"use strict";

export default function handler(req, res) {
  const loginUrl = process.env.SF_LOGIN_URL || "https://login.salesforce.com";

  const redirectUri = `${process.env.APP_URL}/api/sf-oauth-callback`;
  console.log("[OAuth] Using redirect URI:", redirectUri);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SF_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "api refresh_token offline_access",
  });

  res.redirect(`${loginUrl}/services/oauth2/authorize?${params}`);
}
