/**
 * api/sf-oauth-callback.js
 * Salesforce OAuth 2.0 Web Server Flow — callback endpoint.
 *
 * This is only needed if you use the browser-based OAuth flow to
 * obtain tokens interactively (e.g., first-time setup). For pure
 * server-to-server flows (Username-Password or JWT), you don't need this.
 *
 * Flow:
 *   1. Visit /api/sf-oauth-start  →  redirects to Salesforce login
 *   2. User authorizes  →  Salesforce redirects to this endpoint
 *   3. Exchange code for tokens  →  display/store tokens
 *
 * Callback URL to register in your Connected App:
 *   https://<your-vercel-domain>/api/sf-oauth-callback
 */

"use strict";

const fetch = require("node-fetch");

export default async function handler(req, res) {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`OAuth error: ${error} — ${error_description}`);
  }

  if (!code) {
    return res.status(400).send("Missing authorization code.");
  }

  const loginUrl = process.env.SF_LOGIN_URL || "https://login.salesforce.com";
  const tokenUrl = `${loginUrl}/services/oauth2/token`;

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.SF_CLIENT_ID,
        client_secret: process.env.SF_CLIENT_SECRET,
        redirect_uri: `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.APP_URL}/api/sf-oauth-callback`,
      }),
    });

    const tokens = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(tokens));
    }

    // In production: store tokens in a secure KV store (Vercel KV, Upstash, etc.)
    // For initial setup, display them so you can add them to environment variables.
    console.log("[OAuth] Access token obtained for instance:", tokens.instance_url);

    return res.status(200).send(`
      <html><body style="font-family:monospace;padding:2rem">
        <h2>✅ Salesforce OAuth Complete</h2>
        <p>Copy these values to your Vercel environment variables:</p>
        <pre>
SF_INSTANCE_URL = ${tokens.instance_url}
SF_ACCESS_TOKEN = ${tokens.access_token}
SF_REFRESH_TOKEN = ${tokens.refresh_token}
        </pre>
        <p style="color:#999">Then update your getConnection() in lib/salesforce.js
        to use the refresh token flow for persistent auth.</p>
      </body></html>
    `);
  } catch (err) {
    console.error("[OAuth] Token exchange failed:", err);
    return res.status(500).send(`Token exchange failed: ${err.message}`);
  }
}
