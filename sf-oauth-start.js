/**
 * api/sf-oauth-start.js
 * Kicks off the Salesforce OAuth 2.0 Web Server Flow.
 * Visit this URL in a browser to authorize the Connected App.
 *
 * Usage (one-time setup):
 *   https://<your-vercel-domain>/api/sf-oauth-start
 */

"use strict";

export default function handler(req, res) {
  const loginUrl = process.env.SF_LOGIN_URL || "https://login.salesforce.com";
  const appUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.APP_URL || "http://localhost:3000";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SF_CLIENT_ID,
    redirect_uri: `${appUrl}/api/sf-oauth-callback`,
    scope: "api refresh_token offline_access",
  });

  const authUrl = `${loginUrl}/services/oauth2/authorize?${params}`;
  console.log("[OAuth] Redirecting to:", authUrl);
  res.redirect(authUrl);
}
