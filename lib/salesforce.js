"use strict";

const jsforce = require("jsforce");
const fetch = require("node-fetch");

let _conn = null;

async function getConnection() {
  if (_conn && _conn.accessToken) {
    return _conn;
  }

  const loginUrl = process.env.SF_LOGIN_URL;
  // || "https://test.salesforce.com";

  console.log("[Salesforce] Token URL:", `${loginUrl}/services/oauth2/token`);

  const tokenRes = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SF_CLIENT_ID,
      client_secret: process.env.SF_CLIENT_SECRET,
    }),
  });

  const token = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`Client Credentials auth failed: ${JSON.stringify(token)}`);

  console.log("[Salesforce] Token obtained. Instance:", token.instance_url);

  // Pass token directly — no jsforce OAuth2 object so jsforce
  // never attempts its own refresh flow
  _conn = new jsforce.Connection({
    serverUrl: token.instance_url,
    sessionId: token.access_token,
  });

  console.log("[Salesforce] Connected. Instance:", _conn.instanceUrl);
  return _conn;
}

module.exports = { getConnection };
