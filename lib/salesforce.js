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

  // Explicitly refresh the access token before connecting
  const tokenRes = await new Promise((resolve, reject) => {
    oauth2.refreshToken(process.env.SF_REFRESH_TOKEN, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });

  _conn = new jsforce.Connection({
    oauth2,
    instanceUrl: tokenRes.instance_url || process.env.SF_INSTANCE_URL,
    accessToken: tokenRes.access_token,
  });

  console.log("[Salesforce] Connected. Instance:", _conn.instanceUrl);
  return _conn;
}

module.exports = { getConnection };
