"use strict";

function centsToDollars(amount) { return amount / 100; }
function unixToDate(ts) { return new Date(ts * 1000).toISOString().split("T")[0]; }
function meta(session, key, fallback = null) { return (session.metadata && session.metadata[key]) || fallback; }

function mapPaymentMethod(session) {
  const types = session.payment_method_types || [];
  if (types.includes("card")) return "Credit Card";
  if (types.includes("us_bank_account") || types.includes("ach_debit")) return "Check";
  return "Other";
}

async function upsertContact(conn, session) {
  const email = (session.customer_details && session.customer_details.email) || meta(session, "email");
  if (!email) { console.warn("[NSPS] No customer email, skipping Contact upsert."); return null; }

  const nameParts = ((session.customer_details && session.customer_details.name) || "Unknown Unknown").split(" ");
  const firstName = nameParts.slice(0, -1).join(" ") || "Unknown";
  const lastName = nameParts.slice(-1)[0] || "Unknown";

  const result = await conn.sobject("Contact").upsert(
    { Email: email, FirstName: firstName, LastName: lastName,
      ...(session.customer_details?.phone && { Phone: session.customer_details.phone }) },
    "Email"
  );
  console.log(`[NSPS] Contact upserted: ${result.id} (${email})`);
  return result.id;
}

function buildOpportunity(session, contactId, contactName) {
  const amount = centsToDollars(session.amount_total);
  const currency = (session.currency || "usd").toUpperCase();
  const paymentDate = unixToDate(session.created);
  const campaignId = meta(session, "sf_campaign_id");
  const description = meta(session, "description") || `Stripe Payment Link — ${session.id}`;
  const formattedAmount = `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return {
    Name: `Stripe Subscription - ${formattedAmount} - ${contactName || "Unknown"} - ${paymentDate}`,
    StageName: "Closed Won",
    CloseDate: paymentDate,
    Amount: amount,
    Description: description,
    npe01__Payment_Method__c: mapPaymentMethod(session),
    npe01__Is_Opp_From_Individual__c: true,
    ...(contactId && { Primary_Contact__c: contactId }),
    ...(campaignId && { CampaignId: campaignId }),
  };
}

function buildPaymentRecord(session, opportunityId) {
  return {
    npe01__Opportunity__c: opportunityId,
    npe01__Payment_Amount__c: centsToDollars(session.amount_total),
    npe01__Payment_Date__c: unixToDate(session.created),
    npe01__Paid__c: true,
    npe01__Payment_Method__c: mapPaymentMethod(session),
  };
}

async function syncToNSPS(conn, session) {
  const contactId = await upsertContact(conn, session);
  const contactName = (session.customer_details && session.customer_details.name) || null;

  const oppResult = await conn.sobject("Opportunity").create(buildOpportunity(session, contactId, contactName));
  if (!oppResult.success) throw new Error(`Opportunity create failed: ${JSON.stringify(oppResult.errors)}`);
  console.log(`[NSPS] Opportunity created: ${oppResult.id}`);

  const pmtResult = await conn.sobject("npe01__OppPayment__c").create(buildPaymentRecord(session, oppResult.id));
  if (!pmtResult.success) throw new Error(`OppPayment create failed: ${JSON.stringify(pmtResult.errors)}`);
  console.log(`[NSPS] OppPayment created: ${pmtResult.id}`);

  return { contactId, opportunityId: oppResult.id, paymentId: pmtResult.id };
}

module.exports = { syncToNSPS };