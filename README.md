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

---

## Prerequisites

- Vercel account
- Stripe account with at least one Payment Link
- Salesforce org with **NSPS (NPSP) installed**
- Salesforce Connected App with OAuth enabled

---

## Step 1 — Create Salesforce Connected App

1. In Salesforce, go to **Setup → App Manager → New Connected App**
2. Fill in:
   - **Connected App Name**: Stripe Integration
   - **API Name**: Stripe_Integration
   - **Contact Email**: your email
3. Under **OAuth Settings**, check **Enable OAuth Settings**:
   - **Callback URL**: `https://your-project.vercel.app/api/sf-oauth-callback`
   - **Selected OAuth Scopes**: `api`, `refresh_token`, `offline_access`
4. Save and wait ~10 minutes for it to propagate
5. Copy the **Consumer Key** (→ `SF_CLIENT_ID`) and **Consumer Secret** (→ `SF_CLIENT_SECRET`)

---

## Step 2 — Deploy to Vercel

```bash
# Clone and install
git clone <your-repo>
cd stripe-sf-integration
npm install

# Deploy
npx vercel --prod
```

Set environment variables in **Vercel Dashboard → Project → Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (set after Step 3) |
| `SF_CLIENT_ID` | Consumer Key from Connected App |
| `SF_CLIENT_SECRET` | Consumer Secret from Connected App |
| `SF_LOGIN_URL` | `https://login.salesforce.com` (or `test.salesforce.com`) |
| `SF_USERNAME` | Your Salesforce admin username |
| `SF_PASSWORD` | Password + Security Token (no spaces) |
| `APP_URL` | `https://your-project.vercel.app` |

> **Password + Security Token**: Go to *Setup → My Personal Information → Reset My Security Token*. Append the token directly to your password: `mypasswordABC123TOKEN`.

---

## Step 3 — Register Stripe Webhook

1. Go to **Stripe Dashboard → Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://your-project.vercel.app/api/stripe-webhook`
3. Select events: `checkout.session.completed`
4. Copy the **Signing secret** → set as `STRIPE_WEBHOOK_SECRET` in Vercel
5. Redeploy: `npx vercel --prod`

---

## Step 4 — Verify

Visit `https://your-project.vercel.app/api/health` — you should see:

```json
{
  "status": "ok",
  "salesforce": {
    "user": "admin@yourorg.org",
    "org": "00D...",
    "instance": "https://yourorg.my.salesforce.com"
  }
}
```

---

## NSPS Records Created Per Payment

| Object | Description |
|---|---|
| `Contact` | Upserted by email from Stripe customer details |
| `Opportunity` | `Closed Won`, amount = Stripe amount, date = payment date |
| `npe01__OppPayment__c` | Child payment record, `npe01__Paid__c = true` |

---

## Passing Metadata from Stripe Payment Links

You can add metadata to your Stripe Payment Link (via API or Dashboard) to enrich Salesforce records:

| Metadata Key | Salesforce Effect |
|---|---|
| `sf_campaign_id` | Links Opportunity to a Campaign (`18-char Id`) |
| `sf_record_type` | Opportunity Record Type name |
| `description` | Opportunity Description field |
| `email` | Fallback email if customer_details.email is absent |

---

## Switching to JWT Bearer Flow (Recommended for Production)

The default setup uses **Username-Password flow** (simplest). For production orgs that restrict this flow:

1. Generate an RSA key pair: `openssl genrsa -out private.pem 2048 && openssl req -new -x509 -key private.pem -out server.crt -days 365`
2. Upload `server.crt` to your Connected App under **Use Digital Signatures**
3. Set `SF_PRIVATE_KEY` env var to the contents of `private.pem` (with `\n` for newlines)
4. Uncomment the JWT section in `lib/salesforce.js` and swap out `getConnection()`

---

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/stripe-webhook` | Stripe webhook receiver |
| `GET /api/sf-oauth-start` | Start browser-based OAuth (one-time setup) |
| `GET /api/sf-oauth-callback` | OAuth callback (registered in Connected App) |
| `GET /api/health` | Connection health check |

---

## Local Development

```bash
# Install Stripe CLI for local webhook forwarding
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Start Vercel dev server
npx vercel dev

# In another terminal, forward webhooks to localhost
stripe listen --forward-to localhost:3000/api/stripe-webhook

# Trigger a test event
stripe trigger checkout.session.completed
```
