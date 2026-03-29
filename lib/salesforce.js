"use strict";

const jsforce = require("jsforce");

let _conn = null;

async function getConnection() {
  if (_conn && _conn.accessToken) {
    return _conn;
  }

  const oauth2 = new jsforce.OAuth2({
    loginUrl: process.env.SF_LOGIN_URL || "https://login.salesforce.com",
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET,
  });

  _conn = new jsforce.Connection({
    oauth2,
    instanceUrl: process.env.SF_INSTANCE_URL,
    accessToken: process.env.SF_ACCESS_TOKEN,
    refreshToken: process.env.SF_REFRESH_TOKEN,
  });

  // Refresh the access token using the refresh token
  _conn.on("refresh", (accessToken) => {
    console.log("[Salesforce] Access token refreshed.");
    // In production, persist the new accessToken to your KV store here
    // so it survives cold starts without needing another refresh
    process.env.SF_ACCESS_TOKEN = accessToken;
  });

  // Force a refresh to validate the connection on startup
  await _conn.identity();

  console.log("[Salesforce] Connected. Instance:", _conn.instanceUrl);
  return _conn;
}

module.exports = { getConnection };
