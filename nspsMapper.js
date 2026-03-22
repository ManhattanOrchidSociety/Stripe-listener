/**
 * lib/nspsMapper.js
 * Maps a Stripe checkout.session (from a Payment Link) to Salesforce NSPS objects:
 *   - Contact  (looked up or created by email)
 *   - Opportunity  (the donation / payment record)
 *   - npe01__OppPayment__c  (the NSPS payment child record)
 */

"use strict";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert Stripe amount (cents) → dollars */
function centsToDollars(amount) {
  return amount / 100;
}

/** Format a Unix timestamp → YYYY-MM-DD */
function unixToDate(ts) {
  return new Date(ts * 1000).toISOString().split("T")[0];
}

/** Safely pull a metadata key from the Stripe session */
function meta(session, key, fallback = null) {
  return (session.metadata && session.metadata[key]) || fallback;
}

// ---------------------------------------------------------------------------
// Salesforce record builders
// ---------------------------------------------------------------------------

/**
 * Look up an existing Contact by email, or build a new one.
 * Returns the Contact Id (existing) or creates one and returns the new Id.
 */
async function upsertContact(conn, session) {
  const email =
    (session.customer_details && session.customer_details.email) ||
    meta(session, "email");

  if (!email) {
    console.warn("[NSPS] No customer email on session, skipping Contact upsert.");
    return null;
  }

  const nameParts = ((session.customer_details && session.customer_details.name) || "Unknown Unknown").split(" ");
  const firstName = nameParts.slice(0, -1).join(" ") || "Unknown";
  const lastName = nameParts.slice(-1)[0] || "Unknown";

  // Use Salesforce External ID upsert on Email (standard field)
  const result = await conn.sobject("Contact").upsert(
    {
      Email: email,
      FirstName: firstName,
      LastName: lastName,
      // Map phone if present
      ...(session.customer_details?.phone && { Phone: session.customer_details.phone }),
    },
    "Email" // external ID field
  );

  const contactId = result.id;
  console.log(`[NSPS] Contact upserted: ${contactId} (${email})`);
  return contactId;
}

/**
 * Build the Opportunity record for NSPS.
 * Closes immediately as "Closed Won" since payment is confirmed.
 */
function buildOpportunity(session, contactId) {
  const amount = centsToDollars(session.amount_total);
  const currency = (session.currency || "usd").toUpperCase();
  const paymentDate = unixToDate(session.created);

  // Pull optional metadata fields you can set on your Stripe Payment Link
  const campaignId = meta(session, "sf_campaign_id");       // Salesforce Campaign Id
  const recordTypeName = meta(session, "sf_record_type");   // e.g. "Donation"
  const description = meta(session, "description") || `Stripe Payment Link — ${session.id}`;

  const opp = {
    Name: `Stripe Donation — ${amount} ${currency} — ${paymentDate}`,
    StageName: "Closed Won",
    CloseDate: paymentDate,
    Amount: amount,
    CurrencyIsoCode: currency,
    Description: description,

    // NSPS-specific fields
    npe01__Payment_Method__c: mapPaymentMethod(session),
    npe01__Is_Opp_From_Individual__c: true,

    // Stripe reference IDs — store in standard or custom fields
    // Replace field API names if you have custom ones:
    npe03__Recurring_Web_Service_Paid_Until__c: null, // not a recurring gift
  };

  // Link to Contact as Primary Affiliation (NSPS household model)
  if (contactId) {
    opp["Primary_Contact__c"] = contactId; // adjust to your NSPS contact role setup
  }

  // Optionally associate to a Campaign
  if (campaignId) {
    opp.CampaignId = campaignId;
  }

  return opp;
}

/**
 * Build the npe01__OppPayment__c child record.
 * NSPS creates one automatically on Opportunity insert, but we explicitly
 * update / create a confirmed record with the Stripe charge details.
 */
function buildPaymentRecord(session, opportunityId) {
  const amount = centsToDollars(session.amount_total);
  const paymentDate = unixToDate(session.created);

  return {
    npe01__Opportunity__c: opportunityId,
    npe01__Payment_Amount__c: amount,
    npe01__Payment_Date__c: paymentDate,
    npe01__Paid__c: true,
    npe01__Payment_Method__c: mapPaymentMethod(session),

    // Store Stripe IDs for reconciliation
    // Map these to custom fields on npe01__OppPayment__c if you have them:
    // Stripe_Session_Id__c: session.id,
    // Stripe_Payment_Intent__c: session.payment_intent,
  };
}

/** Map Stripe payment method types → NSPS picklist values */
function mapPaymentMethod(session) {
  const types = session.payment_method_types || [];
  if (types.includes("card")) return "Credit Card";
  if (types.includes("us_bank_account") || types.includes("ach_debit")) return "Check";
  if (types.includes("paypal")) return "Other";
  return "Other";
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Given a confirmed Stripe checkout session, create/update records in NSPS.
 * Returns { contactId, opportunityId, paymentId }
 */
async function syncToNSPS(conn, session) {
  // 1. Upsert Contact
  const contactId = await upsertContact(conn, session);

  // 2. Create Opportunity
  const oppData = buildOpportunity(session, contactId);
  const oppResult = await conn.sobject("Opportunity").create(oppData);
  if (!oppResult.success) {
    throw new Error(`Opportunity create failed: ${JSON.stringify(oppResult.errors)}`);
  }
  const opportunityId = oppResult.id;
  console.log(`[NSPS] Opportunity created: ${opportunityId}`);

  // 3. Create OppPayment (explicit record with Stripe details)
  // NSPS auto-creates a payment on Opp insert; we create an additional
  // confirmed record. If you want to UPDATE the auto-created one instead,
  // query npe01__OppPayment__c WHERE npe01__Opportunity__c = opportunityId first.
  const paymentData = buildPaymentRecord(session, opportunityId);
  const pmtResult = await conn.sobject("npe01__OppPayment__c").create(paymentData);
  if (!pmtResult.success) {
    throw new Error(`OppPayment create failed: ${JSON.stringify(pmtResult.errors)}`);
  }
  const paymentId = pmtResult.id;
  console.log(`[NSPS] OppPayment created: ${paymentId}`);

  return { contactId, opportunityId, paymentId };
}

module.exports = { syncToNSPS };
