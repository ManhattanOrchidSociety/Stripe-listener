/**
 * api/stripe-webhook.js
 * Vercel Serverless Function — receives Stripe webhook events and
 * syncs confirmed Payment Link payments into Salesforce NSPS.
 *
 * Endpoint URL to register in Stripe Dashboard:
 *   https://<your-vercel-domain>/api/stripe-webhook
 *
 * Required Stripe events:
 *   - checkout.session.completed
 *   - payment_intent.succeeded  (optional, for direct PI flows)
 */

"use strict";

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getConnection } = require("../lib/salesforce");
const { syncToNSPS } = require("../lib/nspsMapper");

// ---------------------------------------------------------------------------
// Vercel requires the raw request body to verify Stripe signatures.
// Disable the default body parser so we can read raw bytes.
// ---------------------------------------------------------------------------
export const config = {
  api: {
    bodyParser: false,
  },
};

// ---------------------------------------------------------------------------
// Raw body reader (Vercel / Node.js 18 compatible)
// ---------------------------------------------------------------------------
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── 1. Verify Stripe signature ───────────────────────────────────────────
  const sig = req.headers["stripe-signature"];
  const rawBody = await getRawBody(req);
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  console.log(`[Webhook] Received event: ${event.type} (${event.id})`);

  // ── 2. Only handle confirmed payments from Payment Links ─────────────────
  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true, action: "ignored" });
  }

  const session = event.data.object;

  // Ensure payment is paid (not just authorized)
  if (session.payment_status !== "paid") {
    console.log(`[Webhook] Session ${session.id} not yet paid. Skipping.`);
    return res.status(200).json({ received: true, action: "not_paid_yet" });
  }

  // Optionally filter to only Payment Link sessions (not custom Checkout sessions)
  // Uncomment the next block if you want to restrict to payment link sessions only:
  /*
  if (!session.payment_link) {
    console.log(`[Webhook] Session ${session.id} not from a Payment Link. Skipping.`);
    return res.status(200).json({ received: true, action: "not_payment_link" });
  }
  */

  // ── 3. Sync to Salesforce NSPS ───────────────────────────────────────────
  try {
    const conn = await getConnection();
    const result = await syncToNSPS(conn, session);

    console.log("[Webhook] Sync complete:", result);
    return res.status(200).json({
      received: true,
      action: "synced",
      salesforce: result,
    });
  } catch (err) {
    console.error("[Webhook] Salesforce sync failed:", err);
    // Return 500 so Stripe retries the webhook
    return res.status(500).json({ error: "Salesforce sync failed", details: err.message });
  }
}
