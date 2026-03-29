"use strict";

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getConnection } = require("../lib/salesforce");
const { syncToNSPS } = require("../lib/nspsMapper");

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const sig = req.headers["stripe-signature"];
  const rawBody = await getRawBody(req);
  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  console.log(`[Webhook] Received: ${event.type} (${event.id})`);

  if (event.type !== "checkout.session.completed")
    return res.status(200).json({ received: true, action: "ignored" });

  const session = event.data.object;

  if (session.payment_status !== "paid")
    return res.status(200).json({ received: true, action: "not_paid_yet" });

  try {
    const conn = await getConnection();
    const result = await syncToNSPS(conn, session);
    console.log("[Webhook] Sync complete:", result);
    return res.status(200).json({ received: true, action: "synced", salesforce: result });
  } catch (err) {
    console.error("[Webhook] Salesforce sync failed:", err);
    return res.status(500).json({
      error: "Salesforce sync failed",
      details: err.message,
      stack: err.stack,
      sfErrors: err.errorCode || null,
      sfFields: err.fields || null,
    });
  }
}
