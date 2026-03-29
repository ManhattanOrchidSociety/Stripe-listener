/**
 * lib/salesforce.js
 * Salesforce OAuth 2.0 Web Server Flow + jsforce connection manager.
 * Tokens are stored in memory per serverless invocation; use a KV store
 * (e.g., Vercel KV / Upstash) in production to persist across cold starts.
 */

"use strict";

const jsforce = require("jsforce");

// ---------------------------------------------------------------------------
// Environment variables (set in Vercel dashboard or .env.local for dev)
// ---------------------------------------------------------------------------
// SF_CLIENT_ID          – Connected App consumer key
// SF_CLIENT_SECRET      – Connected App consumer secret
// SF_USERNAME           – Salesforce username (used for Username-Password flow fallback)
// SF_PASSWORD           – Salesforce password + security token concatenated
// SF_LOGIN_URL          – https://login.salesforce.com  (or test.salesforce.com for sandbox)
// SF_INSTANCE_URL       – (optional) cached instance URL
// SF_ACCESS_TOKEN       – (optional) cached access token
// ---------------------------------------------------------------------------

let _conn = null;

/**
 * Returns an authenticated jsforce Connection.
 * Uses OAuth 2.0 Username-Password flow (server-to-server, no browser redirect).
 * This is the recommended approach for backend/serverless integrations.
 *
 * For orgs that restrict Username-Password flow, switch to JWT Bearer flow —
 * see the JWT section below.
 */
async function getConnection() {
  if (_conn && _conn.accessToken) {
    return _conn;
  }

  const oauth2 = new jsforce.OAuth2({
    loginUrl: process.env.SF_LOGIN_URL || "https://login.salesforce.com",
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET,
  });

  _conn = new jsforce.Connection({ oauth2 });

  await _conn.login(process.env.SF_USERNAME, process.env.SF_PASSWORD);

  console.log("[Salesforce] Connected. Instance:", _conn.instanceUrl);
  return _conn;
}

// ---------------------------------------------------------------------------
// JWT Bearer Flow (alternative — uncomment and swap getConnection() body)
// Requires: SF_PRIVATE_KEY (PEM), SF_CLIENT_ID, SF_USERNAME, SF_LOGIN_URL
// ---------------------------------------------------------------------------
/*
const crypto = require("crypto");
const fetch = require("node-fetch");

async function getConnectionJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: process.env.SF_CLIENT_ID,
    sub: process.env.SF_USERNAME,
    aud: process.env.SF_LOGIN_URL || "https://login.salesforce.com",
    exp: now + 300,
  })).toString("base64url");

  const signingInput = `${header}.${payload}`;
  const privateKey = process.env.SF_PRIVATE_KEY.replace(/\\n/g, "\n");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(privateKey, "base64url");
  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch(
    `${process.env.SF_LOGIN_URL || "https://login.salesforce.com"}/services/oauth2/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    }
  );

  const token = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`JWT auth failed: ${JSON.stringify(token)}`);

  _conn = new jsforce.Connection({
    instanceUrl: token.instance_url,
    accessToken: token.access_token,
  });
  return _conn;
}
*/

module.exports = { getConnection };
