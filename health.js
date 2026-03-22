/**
 * api/health.js
 * Quick health check — confirms the service is up and Salesforce is reachable.
 */

"use strict";

const { getConnection } = require("../lib/salesforce");

export default async function handler(req, res) {
  try {
    const conn = await getConnection();
    const identity = await conn.identity();
    return res.status(200).json({
      status: "ok",
      salesforce: {
        user: identity.username,
        org: identity.organization_id,
        instance: conn.instanceUrl,
      },
    });
  } catch (err) {
    return res.status(500).json({ status: "error", error: err.message });
  }
}
