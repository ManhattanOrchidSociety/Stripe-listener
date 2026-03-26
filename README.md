# Stripe Payment Link → Salesforce NSPS Integration

Vercel serverless integration that listens for Stripe Payment Link completions and creates corresponding records in Salesforce using the **Nonprofit Success Pack (NSPS/NPSP)**.

---

## Architecture

```
Stripe Payment Link (customer pays)
        │
        ▼ checkout.session.completed event
Vercel Serverless Function (/api/stripe-webhook)
        │
        ├── Verify Stripe webhook signature
        ├── Authenticate to Salesforce (OAuth 2.0)
        └── Create in NSPS:
              ├── Contact  (upserted by email)
              ├── Opportunity  (Closed Won)
              └── npe01__OppPayment__c  (confirmed payment)
```
