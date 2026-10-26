# Hosting Ridgefield Academy on Cloudflare Pages & Custom Domain

This guide details how to connect the Ridgefield Academy website to **Cloudflare Pages** and configure the custom domain **`ridgefieldacademy.co.za`**, fully connected to the live Supabase BaaS backend.

---

## Architecture Overview

```
                                      +---------------------------------------------+
                                      |             Cloudflare Edge                 |
                                      |  Domain: https://ridgefieldacademy.co.za   |
                                      |  Fallback: https://*.pages.dev              |
                                      +---------------------------------------------+
                                                             |
                                      +---------------------------------------------+
                                      |             Static Frontend                 |
                                      |  - 118 Vetted Files (deploy-manifest.json) |
                                      |  - _headers (CSP + Security + Cache)        |
                                      |  - _redirects (Clean URLs + Fallbacks)      |
                                      +---------------------------------------------+
                                                             |
                                           HTTPS REST API Calls & Auth JWTs
                                                             v
                                      +---------------------------------------------+
                                      |             Supabase Cloud BaaS             |
                                      |  Project: cgknuthrxnyfxncvmelo (eu-west-1)  |
                                      |  - Edge API: /functions/v1/ridgefield-api   |
                                      |  - Database: Permanent numbers, RLS         |
                                      |  - Storage: Private ridgefield-documents    |
                                      +---------------------------------------------+
```

---

## Step 1: Connect GitHub to Cloudflare Pages

1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** in the left sidebar, then click **Create application** > **Pages** > **Connect to Git**.
3. Select your GitHub repository:
   - Repository: `viviansb3-tech/Ridgefield`
   - Branch: `main`
4. Configure the Build & Deployment Settings:
   - **Framework preset**: `None`
   - **Build command**: `python3 scripts/build_dist.py`
   - **Build output directory**: `dist`
   - **Root directory**: `/` (leave empty or default)
5. Click **Save and Deploy**. Cloudflare Pages will execute the build script, assemble the 118 vetted production files, and deploy them to your project's `*.pages.dev` subdomain.

*(Alternative without build command: Set Build output directory to `.` and leave Build command empty.)*

---

## Step 2: Connect the Custom Domain (`ridgefieldacademy.co.za`)

1. In the Cloudflare Pages dashboard for your project, select the **Custom domains** tab.
2. Click **Set up a custom domain**.
3. Enter `ridgefieldacademy.co.za` and click **Continue**.
4. Repeat for `www.ridgefieldacademy.co.za`.
5. **DNS Configuration**:
   - If your domain's DNS is already managed by Cloudflare: Cloudflare will automatically create the `CNAME` records pointing to your Pages project.
   - If your DNS is hosted externally: Add the provided `CNAME` records at your DNS provider:
     - `ridgefieldacademy.co.za` -> `<your-project>.pages.dev`
     - `www` -> `<your-project>.pages.dev`
6. Cloudflare automatically issues and manages the Universal SSL certificate.

---

## Step 3: Verify the Supabase Backend Connection

The frontend is already configured to communicate directly with the live Supabase project:

1. **Client Configuration (`assets/rf-baas-config.js`)**:
   - Project URL: `https://cgknuthrxnyfxncvmelo.supabase.co`
   - Publishable Key: `sb_publishable_Ksbc_CHTpTEOg9IH5PGUYQ_oRCcyISR`
2. **Content Security Policy (`_headers`)**:
   - Allows connections: `connect-src 'self' https://cgknuthrxnyfxncvmelo.supabase.co;`
   - Cloudflare Pages automatically applies the security and caching rules defined in `_headers`.
3. **CORS & Allowed Origins (`supabase/functions/ridgefield-api/index.ts`)**:
   - Allowed origins include:
     - `https://ridgefieldacademy.co.za`
     - `https://www.ridgefieldacademy.co.za`
     - `https://*.pages.dev`
     - `http://localhost:8080` (for local development)
4. **Deploying the Edge Function Update to Supabase**:
   If deploying via Supabase CLI:
   ```sh
   supabase functions deploy ridgefield-api --no-verify-jwt
   ```
   Or update the function code in the Supabase Dashboard under **Edge Functions** > `ridgefield-api`.

---

## Step 4: Production Verification Checklist

Once deployed online, perform these checks:

- [ ] **Home & Navigation**: Visit `https://ridgefieldacademy.co.za` — all links, images, and styles load over HTTPS.
- [ ] **Application Submission (`/apply.html`)**: Submit a test application through the 6-step form. Verify that the response returns a permanent learner number (`RIDC...`) and redirects to `/application-success.html`.
- [ ] **Enquiry Form (`/contact.html`)**: Submit a contact enquiry. Verify that a server receipt (`RF-ENQ-...`) is generated.
- [ ] **Staff Administration (`/admin.html`)**: Sign in with authorized staff credentials. Verify access to applications, enquiries, student register, and document management.
- [ ] **Security Headers**: Inspect HTTP response headers using browser DevTools or `curl -I`. Verify that `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and CSP headers are present.
