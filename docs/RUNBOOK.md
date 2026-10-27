# GPEC Website Runbook

How to set up, deploy, roll back, and respond to problems with the live site. Written for whoever
deploys: the project owner, or the developer with the owner's go-ahead. An AI assistant never
deploys. Engineering rules behind these steps are in
[`CLAUDE.md`](../CLAUDE.md), Section 7. All commands in one place: [`COMMANDS.md`](COMMANDS.md).

- **Last updated:** 2026-10-25
- **Live since 2026-10-22, not announced:** the site still shows sample products and demo orders
  and contact requests. Do not share the address until GPEC's real content is in.

## What runs where

| Part | Where | Address | Image | Port inside the container |
|---|---|---|---|---|
| Website (static files, nginx) | Coolify resource `gpec-web` | `https://gpecengineering.com` (`www.` redirects here) | `frontend/Dockerfile` | 8080 |
| API (Node.js) | Coolify resource `gpec-api` | `https://api.gpecengineering.com` | `backend/Dockerfile` | 5001 |
| Coolify dashboard | Same server | `https://coolify.gpecengineering.com` | — | — |
| Database | MongoDB Atlas cluster `gpeccluster`, database `gpec` | — | — | — |

| Service | Details |
|---|---|
| Server | Hetzner Cloud, project "Gpec Engineering", server `gpec-coolify`: CX23 (2 x86 vCPU, 4 GB, 40 GB), Nuremberg, Ubuntu 24.04, IP `2.31.87.31` |
| Domain and DNS | Cloudflare: `gpecengineering.com` registered there (auto-renew on, expires 2027-10-22), DNS there too |
| Coolify | v4.4.7, project `GPEC`, environment `production` |
| Amazon Web Services | An AWS Settings project (named "Idea Launchpad"); region **eu-north-1 (Stockholm)**. SES email and S3 photos set up 2026-10-23 |

HTTPS is handled by Coolify's proxy (Traefik with Let's Encrypt). Both images run as non-root users
and have a Docker health check.

---

## 1. One-time setup

### 1.0 Server, DNS, and Coolify (done 2026-10-22)

Recorded so the server can be rebuilt the same way.

1. **SSH key.** On the developer's machine, a key used only for GPEC:
   `ssh-keygen -t ed25519 -f ~/.ssh/gpec` (set a passphrase). Add `~/.ssh/gpec.pub` in Hetzner under
   *Security → SSH keys*. Never upload the private file (`~/.ssh/gpec`).
2. **Server.** Hetzner Cloud → *Add Server*:
   - **Type:** x86 (Intel/AMD), at least 2 vCPU / 4 GB: Coolify builds the images on the server, and
     2 GB is too little. Not Arm (CAX): the images are only tested on x86.
   - **Image:** Ubuntu 24.04. Use a newer release only once Coolify's install docs list it.
   - **SSH key:** tick it. *Rebuild* keeps the keys chosen at creation, so a server made without
     the key has to be deleted and created again.
   - **Firewall (incoming TCP):** 22, 80, 443, and 8000 only while installing Coolify.
   - **Backups:** on.

   A new server on the same IP makes SSH warn "REMOTE HOST IDENTIFICATION HAS CHANGED". Only if you
   recreated the server yourself, clear the old entry with `ssh-keygen -R <IP>`.
3. **DNS.** Cloudflare → the domain → *DNS → Records*: four **A** records, `@`, `www`, `api`, and
   `coolify`, all pointing to the server's IP, with Proxy status **DNS only** (grey cloud). Proxied
   records stop Coolify getting its HTTPS certificates.
4. **Coolify.** Install it over SSH with the one-line command from Coolify's docs, then open
   `http://<IP>:8000` **straight away** and register: the first account becomes the admin. Turn on
   two-factor (profile). Set up the server as **This machine** (not *Hetzner Cloud*, which buys
   another server). Start the proxy (Traefik).
5. **Dashboard on HTTPS.** Coolify → *Settings* → instance domain
   `https://coolify.gpecengineering.com`. Once it loads with a padlock, remove port 8000 from the
   Hetzner firewall.

### 1.1 MongoDB Atlas

**Status 2026-10-23: not done.** The developer has no access to the Atlas dashboard, only a
connection string. Production temporarily uses that same login (it can reach both `gpec` and
`gpec_dev`), and Atlas already lets the server in (the access list has not been checked; it may be
`0.0.0.0/0`). The Atlas owner must do steps 1 and 2 before launch, then replace `MONGODB_URI` in
Coolify with the `gpec-prod` string and redeploy the API.

1. **Database users.** Create two users under *Database Access*:
   - `gpec-dev` — role `readWrite` on database `gpec_dev` only. Put this one in the developer's
     `backend/.env`.
   - `gpec-prod` — role `readWrite` on database `gpec` only. Use this one only in Coolify.

   A developer laptop then cannot write to production data even by mistake.
2. **Network access.** Under *Network Access*, allow the Hetzner server's IP address and the
   developer's current IP. Remove `0.0.0.0/0` if it is listed.
3. **Backups.** The free M0 tier has no automated backups. Before launch, move to a tier that has
   them and test one restore into a scratch database.

### 1.2 Coolify: API

1. In the `GPEC` project: *+ New* → **Public Git Repository** →
   `https://github.com/hpessien1/GpecProject`, branch `main`. The repository is public, so no
   GitHub login is needed, and this source adds no webhooks, so nothing deploys when code is
   pushed. Do not use the *GitHub App* source: it turns automatic deploys on (CLAUDE.md, "Do not add
   auto-deploy").
2. Name **`gpec-api`**. Build pack **Dockerfile**, base directory **`/backend`**, ports exposes
   **5001** (Coolify suggests 3000; change it).
3. Domain: `https://api.gpecengineering.com` (replace the generated `sslip.io` address).
4. Environment variables (runtime):

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` (also set in the image; set it here too so it is visible) |
   | `MONGODB_URI` | The `gpec-prod` user's connection string. **The database name before `?` must be `/gpec`, never `/gpec_dev`.** |
   | `CLIENT_ORIGIN` | `https://gpecengineering.com,https://www.gpecengineering.com` |
   | `CURRENCY` | **Leave it out** until GPEC confirms the currency. Then `NGN` (or whatever GPEC confirms). While unset, admins cannot set prices. |
   | `FRONTEND_URL` | `https://gpecengineering.com`: used for links in emails and as Paystack's return address. |
   | Email and photo settings | Leave out until Amazon SES and S3 are ready (Sections 1.6, 1.7). |
   | Paystack settings | Leave out until Paystack is set up (Section 1.8). |

   **Untick "Available at Buildtime" on every API variable** (*Normal View*). Coolify passes
   build-time variables into the image build: `NODE_ENV=production` there makes `npm ci` skip the
   TypeScript compiler, so the build fails, and the connection string would end up in the build.
5. Leave Coolify's own *Healthcheck* off: the image's health check (`/api/health`) is used. If it is
   ever switched on, set path `/api/health` and port `5001` first.
6. Replicas: **1**. Do not enable autoscaling or a second instance — the rate limiter keeps its
   counts in memory.
7. **Memory limit: 1 GB** (added 2026-10-27, security audit M-04). In the resource's *Resource
   Limits* settings, set the maximum memory to `1g` (leave CPU as it is), save, and restart the
   resource. If the API ever uses more (for example during an attack with large uploads), Docker
   restarts only the API container, which comes back within about a minute, instead of the whole
   server (4 GB, shared with the website, Coolify, and its proxy) running out of memory. Normal use
   stays well under it: a few hundred MB at most while photos are being re-saved. If the API keeps
   restarting, look at *Logs* for "out of memory" before raising the limit.
8. **Check the API can only be reached through its address** (added 2026-10-27, security audit
   M-08). The API's per-visitor limits trust the visitor's address that Coolify's proxy passes on;
   anyone who could reach the API container directly could make up that address. From your own
   computer, run (with the server's IP address from Section 1.0):

   ```bash
   curl -m 5 http://<server IP>:5001/api/health
   ```

   It must fail (a timeout or "connection refused"). If it answers `{"status":"ok"}`, port 5001 is
   open to the internet: in Coolify, remove any *Ports Mappings* on `gpec-api` (the proxy reaches it
   without them), redeploy, and run the check again.

### 1.3 Coolify: website

1. *+ New* → **Public Git Repository** → same repository, branch `main`.
2. Name **`gpec-web`**. Build pack **Dockerfile**, base directory **`/frontend`**, ports exposes
   **8080**.
3. Domains: `https://gpecengineering.com,https://www.gpecengineering.com`, redirecting to the
   address without `www`.
4. Environment variable `VITE_API_BASE_URL` = `https://api.gpecengineering.com/api`, **with
   "Available at Buildtime" ticked** (the opposite of the API). The address is compiled into the
   site, so changing it later needs a rebuild. The build stops with a clear message if this is
   missing or not https.
5. Coolify's *Healthcheck* off, as for the API. HTTP redirects to HTTPS by default.

### 1.4 First admin account

There is no sign-up page. After the API is deployed, open the API resource's terminal in Coolify
and run, with the real person's details:

```sh
node dist/scripts/createAdmin.js --production --email staff@example.com --name "Full Name"
```

It prints a random password **once**. Pass it to that person privately (not by ordinary email or
chat if avoidable). They log in at `https://gpecengineering.com/#admin` and set their own password under
**Change password** straight away (at least 15 characters).

- **Forgotten password:** they click **Forgot your password?** on the login screen and get a link
  by email that works once, for 30 minutes (needs email, Section 1.6). If the email does not arrive
  (spam folder, SES sandbox, email off), run the same command with `--reset` instead of `--name`. It
  prints a new password and logs that person out everywhere.
- **Someone leaves GPEC:** set their `isActive` to `false` in the `adminusers` collection in Atlas.
  Their sessions stop working at once. (There is no screen for this yet.)
- Admin login allows 5 failed attempts per 15 minutes from one address, then asks them to wait.

### 1.5 Products

The production database starts with no products, so the shop shows "No products are listed yet"
with a link to the contact form. Until GPEC's real product list arrives, there are two choices
(GPEC's call):

- **Leave it empty.** Customers use the contact form.
- **Show the 14 sample products.** Each is labelled "Sample listing · details to be confirmed by
  GPEC". After the API is deployed, open the API resource's terminal in Coolify and run:

  ```sh
  node dist/scripts/seedProducts.js --production
  ```

  It prints `Database "gpec": added 14 sample products`. Running it again changes nothing; it
  never overwrites or removes a product. Without `--production` it refuses to touch `gpec`.

**Demo orders and contact requests** (the owner's choice, 2026-10-23, so GPEC can try the admin
screens before launch). After creating your admin account (Section 1.4), in the same terminal:

```sh
node dist/scripts/seedDemoData.js --production
```

**Before launch, remove them**, or they stay mixed with real orders and messages:

```sh
node dist/scripts/seedDemoData.js --production --remove
```

It removes exactly the demo records (references containing `DE0000`) with their history and notes,
and prints how many. Real records are never touched.

---

### 1.6 Email (Amazon SES)

The site emails GPEC staff about each new contact message (with a link to it in the admin
panel) and sends the customer a confirmation with their reference. **Until this is set up, email is
simply off**: everything else works, and the API log says `Email notifications are off`.

1. **AWS account.** The project owner created an AWS Settings project and invited the developer
   (each person signs in with their own AWS Builder ID; members cannot change billing or the spend
   limit). It is on AWS's **free plan**, whose access ends on 2027-04-22 or when the credits run
   out: the owner must **upgrade it to a paid plan and set a spend limit before launch**, or email
   and photos stop. Two-factor on the owner's login.
2. **Region.** **eu-north-1 (Stockholm)**. A free-plan project is locked to the region it was
   created in (Frankfurt, nearer the server, was refused until the owner upgrades). The distance
   makes no practical difference for email or for photos, which browsers cache for a year. The
   console home page has no region menu; it appears inside each service, or change `region=` in
   the address.
3. **Verify GPEC's domain.** SES → *Identities* → *Create identity* → *Domain* →
   `gpecengineering.com` with *Easy DKIM* on. SES shows three CNAME records: add them in Cloudflare
   with Proxy status **DNS only** (proxied records fail verification; Cloudflare adds the domain to
   the name itself). The identity turns *Verified* once they are seen (minutes to a few hours). Also
   add a TXT record `_dmarc` with `v=DMARC1; p=none;`, which helps emails avoid spam folders.
4. **Leave the sandbox.** A new SES account can only email addresses verified in SES, about 200 a
   day. For a first test, verify the staff addresses (*Identities* → *Email address*). Then request
   production access (SES → *Account dashboard* → *Request production access*): use case
   *Transactional*, describing "confirmations and staff notifications for messages submitted on our
   website". AWS says review takes up to 96 hours; customer confirmations to unverified addresses
   only work after it. A project member can send the request (done 2026-10-23; the form had no
   use-case box, so AWS may ask by email).
5. **A sending-only key.** IAM → *Users* → create `gpec-ses-sender` (no console access) with this
   policy, then create an access key for it:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": "ses:SendEmail",
       "Resource": "*",
       "Condition": { "StringEquals": { "ses:FromAddress": "notifications@gpecengineering.com" } }
     }]
   }
   ```

   It can only send email from that one address; a leaked key cannot read anything or change the
   account.
6. **Coolify.** On the API resource, set all of these (a partial set stops the API at startup with
   a list of what is missing), then redeploy the API:

   | Variable | Value |
   |---|---|
   | `SES_REGION` | The region from step 2 |
   | `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY` | The key from step 5 (secret; Coolify only) |
   | `EMAIL_FROM` | `GPEC <notifications@gpecengineering.com>` |
   | `STAFF_NOTIFICATION_EMAILS` | Staff addresses, comma-separated |
   | `FRONTEND_URL` | `https://gpecengineering.com` |

7. **Test.** The API log no longer says email is off. Send the contact form with `[TEST]` in the
   name: staff should get a notification and the address you entered a confirmation. Delete the
   test record afterwards.
8. **Privacy notice.** The notice (`#privacy`; staff edit it in the admin panel, *Site content*)
   names the email service's region (Stockholm, filled in 2026-10-23). Update it there if the region
   ever changes.
9. **Replies.** Emails to customers carry a reply-to address that staff set in the admin panel
   (*Emails*; GPEC's published Gmail address until they change it), so pressing Reply reaches GPEC.
   **Optional, not set up** (2026-10-24, the user's decision: the reply-to is enough). Only someone
   who writes to `notifications@gpecengineering.com` directly misses GPEC, and their email comes
   back undelivered. If that ever matters, forward the address with Cloudflare's free **Email
   Routing**:
   Cloudflare → the `gpecengineering.com` zone → *Email* → *Email Routing* → *Get started* (or
   *Enable*). Let Cloudflare add the records it proposes (three MX records and one SPF TXT record on
   the root domain); they only affect mail **coming in**, and SES's sending (its DKIM CNAMEs, the
   `_dmarc` record) is untouched. If a TXT record starting `v=spf1` already exists on the root,
   merge the two into one instead of adding a second (a domain may have only one SPF record). Then
   *Destination addresses* → add the inbox (e.g. `gpecengineeringcompanylimited@gmail.com`): Cloudflare
   emails it a link that someone with that inbox must click. Then *Routing rules* → *Create address*
   → custom address `notifications` → action *Send to an email* → that destination. Test by sending
   an email to `notifications@gpecengineering.com` from another account. Forwarded mail may land in
   Gmail's spam folder at first; marking it "Not spam" teaches Gmail.

### 1.7 Product photos and contact-form files (Amazon S3)

Staff upload product photos from their laptop, phone, or tablet in the admin product form. The
API checks and resizes each photo and keeps it in a **private** S3 bucket; visitors get photos
from the API, never from the bucket. Customers may also attach photos and PDFs to the contact form
(optional); those go in the same bucket under `request-files/`, and only logged-in staff can open
them, through the admin panel. **Until this is set up, both are simply off**: the product form asks
for an image already on the site, the contact form offers no attachments, and the API log says
`Product photo uploads and contact-form attachments are off`.

> **Before deploying the contact-form attachments (2026-10-24) to a bucket set up earlier:** add
> the second line to the policy's `Resource` in step 3 (IAM → *Users* → `gpec-product-images` →
> its policy → *Edit*). Without it, a customer who attaches a file gets "Something went wrong" and
> the API log shows `AccessDenied` for `request-files/…`; requests without files still work. The
> same applies to the development key, if `backend/.env` has the `S3_*` settings.

1. **AWS account and region.** The AWS project from Section 1.6 (step 1), region eu-north-1.
2. **Bucket.** S3 → *Create bucket* → `gpec-product-images` (bucket names are unique across AWS),
   in that region, type *General purpose*, namespace **Global** (the newer account-regional
   namespace changes bucket naming; not tried). Keep **Block all public access on** (the default) and
   default encryption on. No bucket policy is needed.
3. **An upload-and-read-only key.** IAM → *Users* → create `gpec-product-images` (no console access)
   with this policy (use the real bucket name), then create an access key for it:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject"],
         "Resource": [
           "arn:aws:s3:::gpec-product-images/product-images/*",
           "arn:aws:s3:::gpec-product-images/request-files/*"
         ]
       },
       {
         "Effect": "Allow",
         "Action": "s3:ListBucket",
         "Resource": "arn:aws:s3:::gpec-product-images"
       }
     ]
   }
   ```

   It can only add, read, and list product photos and contact-form files in that one bucket; a
   leaked key cannot delete anything or touch other AWS services. **The list permission is needed:**
   without it, S3 answers a request for a missing photo with `AccessDenied` instead of "not found",
   and the API returns 500 instead of 404 (found on the live site, 2026-10-23). The list only shows
   file names: product photos are public on the site anyway, and contact-form files are named by a
   random code that says nothing about the file or the customer. Files are never deleted (the key
   cannot), so removed demo data leaves its few sample files behind, unlisted.
4. **Coolify.** On the API resource, set all four (a partial set stops the API at startup with a
   list of what is missing), then redeploy the API:

   | Variable | Value |
   |---|---|
   | `S3_REGION` | The bucket's region (`eu-north-1`) |
   | `S3_BUCKET` | The bucket name from step 2 |
   | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | The key from step 3 (secret; Coolify only) |

5. **Test.** The API log no longer says uploads are off. In the admin panel, edit a sample
   product, choose a photo from your device (try a phone too), check the preview, and save. The
   shop should show the new photo. Then send a `[TEST]` contact request with a photo and a PDF
   attached: in the admin panel the request shows both, the photo opens, and the PDF downloads.
6. **Cost.** At GPEC's size, well under a dollar a month: storage is tiny, and photos sent to
   visitors fall inside AWS's monthly free data-transfer allowance. Check the S3 pricing page for
   the chosen region.

### 1.8 Payments (Paystack and bank transfer)

**Bank transfer** works without Paystack. In the admin panel, *Bank details*: replace the sample
details (they are fake, and customers are told not to send money while they show) with GPEC's bank, the account name exactly as the bank has it, and the 10-digit account number; choose the days customers
have to pay; tick *Offer bank transfer at checkout*; save. Every admin gets an email about the
change: if one ever arrives that nobody expected, check the details at once and change the admin
passwords. Bank transfer is offered only while `CURRENCY=NGN`. For each transfer order, staff look
in GPEC's bank account for the amount with the order reference as the narration, then press
*Confirm transfer received* on the order (or *Payment not received* if it never comes).

**Paystack:**

Until these are set, checkout shows the order and says online payment is not available yet.

1. **Fee rate.** In GPEC's Paystack dashboard, read the transaction fee on GPEC's plan (Paystack
   publishes 1.5% + ₦100 for local payments, the ₦100 waived under ₦2,500, capped at ₦2,000) and
   confirm with Paystack that GPEC may pass the fee on to customers. The site adds it to each order
   as "Payment processing fee".
2. **Test keys.** Dashboard → *Settings* → *API Keys & Webhooks*, **Test** mode: copy the **test
   secret key** (`sk_test_…`). Never the public key, never a live key without GPEC's approval.
3. **Webhook.** On the same page, set the test **Webhook URL** to
   `https://api.gpecengineering.com/api/paystack/webhook`. Leave the callback URL empty: the site
   sends its own with each payment.
4. **Coolify, `gpec-api`** (runtime only, "Available at Buildtime" unticked), amounts in kobo:

   | Variable | Value |
   |---|---|
   | `PAYSTACK_SECRET_KEY` | the `sk_test_…` key |
   | `PAYSTACK_FEE_PERCENT` | e.g. `1.5` |
   | `PAYSTACK_FEE_FLAT` | e.g. `10000` (₦100) |
   | `PAYSTACK_FEE_FLAT_WAIVED_BELOW` | e.g. `250000` (₦2,500); `0` if the flat fee is never waived |
   | `PAYSTACK_FEE_CAP` | e.g. `200000` (₦2,000) |

   `CURRENCY=NGN` and `FRONTEND_URL` must also be set. All five or none: a partial set stops the API
   at startup with a list of what is missing. Redeploy the API; its log says
   `Paystack is in test mode: no real money moves.`
5. **Delivery areas.** In the admin panel, *Delivery*: add the areas GPEC delivers to, each with its
   fee. With none, customers can only choose pickup. Untick *Delivery available* on any product GPEC
   will not deliver.
6. **Test.** Price a sample product, add it to the cart, check out (the page shows "Test mode"), and
   pay with one of Paystack's test cards (listed in Paystack's documentation, "Test Payments"). You
   should come back to "Your order is paid", the order should show in *Orders* as New, and the
   emails should arrive. Try a failing test card too: the site says the payment did not go through
   and keeps the cart. **Keep test orders small:** Paystack's success test card (ending 4081)
   refused a ₦1,962,000 order as "Insufficient Funds" while a ₦27,000 one went through
   (2026-10-26). The limit is in Paystack's test system and is not documented; live customers'
   own banks decide what they can pay.
7. **Going live** needs GPEC's approval and a verified Paystack business: switch the dashboard to
   *Live*, set the live webhook URL to the same address, replace `PAYSTACK_SECRET_KEY` with the
   `sk_live_…` key, and redeploy. The "Test mode" notice disappears.

### 1.9 Two-step login

Admins can turn on two-step login for their own account (admin panel, **Two-step login** in the
header): a code from an authenticator app, or an emailed code (needs email, Section 1.6).

1. **Authenticator apps need a key** (done on the live site: set in Coolify, confirmed 2026-10-25). On your own computer run `openssl rand -base64 32` and copy the
   result. In Coolify, open `gpec-api`, **Environment Variables**, add `TWO_FACTOR_ENCRYPTION_KEY`
   with that value (runtime only: *Available at Buildtime* unticked), save, and redeploy. Use a
   different value from the one in your local `backend/.env`. The API's log no longer says
   "Authenticator apps for two-step login are off".
2. **Never change or delete this key** while admins use an authenticator app: their codes would stop
   working (they could still log in with a recovery code, then set the app up again). If it ever
   leaks, ask every admin to turn two-step login off and on again after you replace it.
3. **Someone lost their phone and their recovery codes:** check it really is them (in person or by
   phone), then in the `gpec-api` terminal run
   `node dist/scripts/createAdmin.js --production --email person@example.com --disable-2fa`. They log
   in with their password and turn it on again.

## 2. Deploying

1. Check that GitHub Actions CI is green for the `main` commit you are shipping.
2. In Coolify, press **Deploy** on the **API first**, then on the **website** (a new site may call a
   new API route). Nothing deploys by itself.
3. On the first deploy, and whenever `MONGODB_URI` is edited: confirm it ends in **`/gpec?`**. The
   API refuses to start on any other database and the deployment log says so:
   `Refusing to start: production must use the "gpec" database ...`
4. Right after deploying, check:
   - `https://api.gpecengineering.com/api/health` returns `{"status":"ok"}`, which means the API is running and
     the database answers. (`503` with `"status":"unavailable"` means MongoDB cannot be reached: see
     Section 4.) Then also:
   - Submit the contact form on the live site with `[TEST]` in the name and confirm a reference is
     shown. Delete the test record from the `gpec` database afterwards.
   - The home page and the shop (`/#shop`) load on a phone and a desktop.
   - The API deployment log contains `(database: gpec)`.

## 3. Rolling back

Coolify keeps previous deployments. Open the resource → *Deployments* → redeploy the last good one.
Roll back the website and API separately as needed.

This restores **code only**. If a bad release wrote wrong data, it has to be repaired in the
database separately (or restored from an Atlas backup).

---

## 4. When something goes wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| API deployment exits straight away | Configuration problem | Read the deployment log: it lists every invalid variable (`Invalid configuration: ...`) or the wrong database name. Fix the variable in Coolify and redeploy. |
| `MongoDB connection failed` in the API log | Atlas network access, wrong password, or Atlas outage | Check the Hetzner IP is allowed in Atlas, the `gpec-prod` password, and [status.mongodb.com](https://status.mongodb.com). |
| Coolify shows the API as unhealthy | `/api/health` returns `503`: the database does not answer | As for `MongoDB connection failed` above. The health check turns healthy again by itself once the database answers. |
| Forms say they cannot reach GPEC | API down, database unreachable, or the site was built with the wrong API address | Check `/api/health` (`503` means the database cannot be reached: see the row above). If it is fine, check `VITE_API_BASE_URL` on the website resource and rebuild. The browser console will show a Content-Security-Policy or CORS error if the addresses do not match `CLIENT_ORIGIN`. |
| A login, password change, or opened record looks wrong (an unknown address, many failed attempts, records opened at odd times) | Possibly a misused or guessed admin login | Open **Security log** in the admin panel: filter by the account, note the times and addresses. If an account may be misused, reset its password by command (Section 1.4; it ends every session), make sure two-step login is on, and tell the developer. Customers' data opened by someone else may need reporting: GPEC decides, with its legal adviser. |
| An admin cannot log in | Wrong password, account deactivated, or too many failed attempts | Wait 15 minutes after "Too many failed login attempts". Otherwise use **Forgot your password?**, or reset the password by command (Section 1.4). |
| "Forgot your password?" email never arrives | Unknown or deactivated address (the screen answers the same on purpose), SES sandbox (address not verified), spam folder, or 3 links already sent to that address this hour | Check the address is an active admin and look in spam. `Email for an admin password reset could not be sent` in the API log means an SES problem (rows below). Otherwise reset by command (Section 1.4). |
| `the breached-password check could not be made` in the API log | The API cannot reach `api.pwnedpasswords.com` (outage, or outgoing HTTPS blocked on the server) | Password changes still work; only the breach check was skipped. If it keeps happening, check that the server allows outgoing HTTPS. |
| Admin cannot set prices ("currency is configured") | `CURRENCY` is unset on the API | Expected until GPEC confirms the currency. Then set `CURRENCY` in Coolify and redeploy the API. |
| Forms say "Too many requests" for everyone | Proxy trust broken, so all visitors share one limit | Confirm `NODE_ENV=production` on the API. Report it to the developer. |
| Site shows old content after a deploy | Browser cache | `index.html` is never cached, so a normal reload fixes it. Photos and videos are cached for up to a day. |
| `Email for GPEC-… could not be sent: MessageRejected` in the API log | SES sandbox (recipient not verified) or sender not verified | Check Section 1.6 steps 3–4. The customer's request is saved either way. |
| `… could not be sent: AccessDenied` or `InvalidClientTokenId` | Wrong or limited SES key, or `EMAIL_FROM` differs from the policy's address | Check the IAM policy and the Coolify values (Section 1.6, steps 5–6). |
| No emails, and the log says `Email notifications are off` | Email settings not set in Coolify | Expected until SES is set up (Section 1.6). |
| Admin product form says "Photo uploads are not set up yet", or offers no photo upload | `S3_*` settings not set in Coolify | Expected until S3 is set up (Section 1.7). |
| Photo upload fails with "Something went wrong" and the API log shows `AccessDenied` or `NoSuchBucket` | Wrong key, bucket name, or region; or the IAM policy names a different bucket | Check Section 1.7, steps 2–4. |
| Contact form with an attached file fails with "Something went wrong" (without files it works), and the API log shows `AccessDenied` for `request-files/…` | The key's policy lacks the `request-files/*` line (keys set up before 2026-10-24) | Add it (Section 1.7, step 3). |
| Shop shows a broken image for an uploaded photo | The photo was never stored (bucket or key changed since), or the API cannot reach S3 | Open `https://api.gpecengineering.com/api/<the product's image value>`: 404 means it is not in the bucket (upload it again); 500 means an S3 problem (check the API log; `AccessDenied` naming `s3:ListBucket` means the key's policy lacks the list permission from Section 1.7, step 3). |
| A secret leaked (connection string, SES key, Paystack key) | — | Rotate it at the source first (Atlas: change the `gpec-prod` password; SES or S3: create a new access key for `gpec-ses-sender` or `gpec-product-images` and delete the old one; Paystack: regenerate the key), update it in Coolify, redeploy, then tell the developer so the git history can be checked. |

### Payments

| Symptom | Likely cause | What to do |
|---|---|---|
| Checkout says "Online payment is not available yet" | Paystack settings not set (or `CURRENCY` missing) | Expected until Section 1.8 is done. |
| A customer paid but the order says "Awaiting payment" | Webhook not reaching the API, and the customer closed the page before coming back | In Paystack's dashboard, find the transaction by its reference (the order's *Paystack reference* in the admin panel) and check it succeeded. Check the webhook URL (Section 1.8, step 3) and Paystack's webhook log. Opening `https://gpecengineering.com/#shop/payment/<Paystack reference>` makes the site check the payment again. |
| `Payment for GPEC-O-… does not match the order (amount or currency differ)` in the API log | A payment for a different amount or currency than the order: possible tampering | The order was **not** marked paid. Check the transaction in Paystack's dashboard and refund it there if needed. Tell the developer. |
| `Payment for GPEC-O-… could not be started` | Paystack refused or could not be reached; often a wrong or revoked key | The customer saw "Nothing was charged" and no order was kept. Check the key in Coolify and [status.paystack.com](https://status.paystack.com). |
| A customer says they paid by transfer, but the order is still "Awaiting transfer" or "Transfer reported" | Staff have not confirmed it yet, or the narration did not match | Look in GPEC's bank account for the amount and the customer's name; confirm it on the order once found. Only staff can mark a transfer paid. |
| An email says the bank details changed, and nobody expected it | Someone with an admin login changed where customers' money goes | Check *Bank details* and its change history at once, correct them, change every admin password, and tell the developer. |
| Many "Awaiting payment" orders | Customers who left Paystack's page without paying | Normal. Each attempt is its own order; nothing was charged. Staff can follow up or ignore them. |
| Webhook requests answered `400` in Paystack's log | Wrong secret key (signatures do not match) | Make sure `PAYSTACK_SECRET_KEY` is the key of the same mode (test or live) as the webhook. |

---

## 5. Contacts and access

Each person logs in with their own account; nobody shares a password. As of 2026-10-23 every
account below is held by the **project owner** (GitHub `hpessien1`) in their own name, with the
**developer** (`kworlanyo`) invited as a member. Whether they should move to accounts in GPEC's
company name is the owner's decision. **Still needed from GPEC:** who at GPEC owns each one, and
who handles each kind of incident (leaked secret, payment problems, database restore).

| Service | Owner | Developer's access |
|---|---|---|
| Hetzner Cloud (server) | Project owner (individual account) | Project member; SSH key `gpec` |
| Cloudflare (domain and DNS) | Project owner | Account member |
| Coolify dashboard | — | Admin (the first account, created at install). Add the owner. |
| MongoDB Atlas | Project owner | Connection string only, no dashboard access |
| GitHub repository | Project owner (`hpessien1/GpecProject`, public) | Collaborator |
| Amazon Web Services (SES, S3) | Project owner (AWS Settings project) | Invited member |
| Paystack (test mode) | Project owner | Invited member |
