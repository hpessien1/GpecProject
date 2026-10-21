# GPEC Website Runbook

How to set up, deploy, roll back, and respond to problems with the live site. Written for the
project owner, who is the only person who deploys. Engineering rules behind these steps are in
[`CLAUDE.md`](../CLAUDE.md), Section 7. All commands in one place: [`COMMANDS.md`](COMMANDS.md).

- **Last updated:** 2026-10-21
- **Placeholders:** `<site-domain>` and `<api-domain>` stand for the real domains (for example
  `www.example.com` and `api.example.com`). GPEC has not chosen them yet.

## What runs where

| Part | Where | Image | Port inside the container |
|---|---|---|---|
| Website (static files, nginx) | Hetzner VPS, Coolify | `frontend/Dockerfile` | 8080 |
| API (Node.js) | Hetzner VPS, Coolify | `backend/Dockerfile` | 5001 |
| Database | MongoDB Atlas, database `gpec` | — | — |

HTTPS is handled by Coolify's proxy (Traefik with Let's Encrypt). Both images run as non-root users
and have a Docker health check.

---

## 1. One-time setup

### 1.1 MongoDB Atlas

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

1. New resource → *Application* → this GitHub repository, branch `main`.
2. Build pack **Dockerfile**, base directory **`/backend`**, exposed port **5001**.
3. Domain: `https://<api-domain>`.
4. Environment variables (runtime):

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` (also set in the image; set it here too so it is visible) |
   | `MONGODB_URI` | The `gpec-prod` user's connection string. **The database name before `?` must be `/gpec`, never `/gpec_dev`.** |
   | `CLIENT_ORIGIN` | `https://<site-domain>` (comma-separate if the site has more than one domain, e.g. with and without `www`) |
   | `CURRENCY` | **Leave unset** until GPEC confirms the currency. Then `NGN` (or whatever GPEC confirms). While unset, admins cannot set prices. |
   | `FRONTEND_URL` | `https://<site-domain>`: used for links in emails (and later Paystack). |
   | Email settings | Leave unset until Amazon SES is ready (Section 1.6). |

5. Replicas: **1**. Do not enable autoscaling or a second instance — the rate limiter keeps its
   counts in memory.

### 1.3 Coolify: website

1. New resource → *Application* → same repository, branch `main`.
2. Build pack **Dockerfile**, base directory **`/frontend`**, exposed port **8080**.
3. Domain: `https://<site-domain>`.
4. Environment variable `VITE_API_BASE_URL` = `https://<api-domain>/api`, **available at build
   time** (Coolify's "build variable" option). The address is compiled into the site, so changing
   it later needs a rebuild. The build stops with a clear message if this is missing or not https.
5. Enable redirect from HTTP to HTTPS.

### 1.4 First admin account

There is no sign-up page. After the API is deployed, open the API resource's terminal in Coolify
and run, with the real person's details:

```sh
node dist/scripts/createAdmin.js --production --email staff@example.com --name "Full Name"
```

It prints a random password **once**. Pass it to that person privately (not by ordinary email or
chat if avoidable). They log in at `https://<site-domain>/#admin` and set their own password under
**Change password** straight away (at least 15 characters).

- **Forgotten password:** run the same command with `--reset` instead of `--name`. It prints a new
  password and logs that person out everywhere.
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

---

### 1.6 Email (Amazon SES)

The site emails GPEC staff about each new enquiry or contact message (with a link to it in the admin
panel) and sends the customer a confirmation with their reference. **Until this is set up, email is
simply off**: everything else works, and the API log says `Email notifications are off`.

1. **AWS account.** GPEC creates an Amazon Web Services account in its own name. Turn on
   multi-factor authentication for the root user, and do not use the root user day to day.
2. **Region.** In the AWS console, pick one region where Amazon SES is offered, ideally near
   Nigeria, and use it for every step below. Note its code (e.g. `eu-west-1`).
3. **Verify GPEC's domain.** SES → *Identities* → *Create identity* → *Domain* → `<site-domain>`
   with *Easy DKIM* on. SES shows three CNAME records: add them at the domain's DNS provider. The
   identity turns *Verified* once they are seen (minutes to a few hours). Adding a DMARC record
   (`_dmarc.<site-domain>`) helps emails avoid spam folders.
4. **Leave the sandbox.** A new SES account can only email addresses verified in SES, about 200 a
   day. For a first test, verify the staff addresses (*Identities* → *Email address*). Then request
   production access (SES → *Account dashboard* → *Request production access*): use case
   *Transactional*, describing "confirmations and staff notifications for enquiries submitted on our
   website". Approval usually takes about a day. Customer confirmations to unverified addresses
   only work after this.
5. **A sending-only key.** IAM → *Users* → create `gpec-ses-sender` (no console access) with this
   policy, then create an access key for it:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": "ses:SendEmail",
       "Resource": "*",
       "Condition": { "StringEquals": { "ses:FromAddress": "notifications@<site-domain>" } }
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
   | `EMAIL_FROM` | `GPEC <notifications@<site-domain>>` |
   | `STAFF_NOTIFICATION_EMAILS` | Staff addresses, comma-separated |
   | `FRONTEND_URL` | `https://<site-domain>` |

7. **Test.** The API log no longer says email is off. Send the contact form with `[TEST]` in the
   name: staff should get a notification and the address you entered a confirmation. Delete the
   test record afterwards.
8. **Privacy notice.** Fill in the email service region in the privacy notice (`#privacy`).

## 2. Deploying

1. Check that GitHub Actions CI is green for the `main` commit you are shipping.
2. In Coolify, deploy the **API first**, then the **website** (a new site may call a new API route).
3. On the first deploy, and whenever `MONGODB_URI` is edited: confirm it ends in **`/gpec?`**. The
   API refuses to start on any other database and the deployment log says so:
   `Refusing to start: production must use the "gpec" database ...`
4. Right after deploying, check:
   - `https://<api-domain>/api/health` returns `{"status":"ok"}`, which means the API is running and
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
| An admin cannot log in | Wrong password, account deactivated, or too many failed attempts | Wait 15 minutes after "Too many failed login attempts". Otherwise reset the password (Section 1.4). |
| Admin cannot set prices ("currency is configured") | `CURRENCY` is unset on the API | Expected until GPEC confirms the currency. Then set `CURRENCY` in Coolify and redeploy the API. |
| Forms say "Too many requests" for everyone | Proxy trust broken, so all visitors share one limit | Confirm `NODE_ENV=production` on the API. Report it to the developer. |
| Site shows old content after a deploy | Browser cache | `index.html` is never cached, so a normal reload fixes it. Photos and videos are cached for up to a day. |
| `Email for GPEC-… could not be sent: MessageRejected` in the API log | SES sandbox (recipient not verified) or sender not verified | Check Section 1.6 steps 3–4. The customer's request is saved either way. |
| `… could not be sent: AccessDenied` or `InvalidClientTokenId` | Wrong or limited SES key, or `EMAIL_FROM` differs from the policy's address | Check the IAM policy and the Coolify values (Section 1.6, steps 5–6). |
| No emails, and the log says `Email notifications are off` | Email settings not set in Coolify | Expected until SES is set up (Section 1.6). |
| A secret leaked (connection string, SES key, future Paystack key) | — | Rotate it at the source first (Atlas: change the `gpec-prod` password; SES: create a new access key for `gpec-ses-sender` and delete the old one; Paystack: regenerate the key), update it in Coolify, redeploy, then tell the developer so the git history can be checked. |

### Payments (from roadmap step 5)

Paystack is not connected yet. This section will cover a failing webhook, an order stuck in
`pending_payment`, and how to check a payment in the Paystack dashboard once checkout is built.

---

## 5. Contacts and access

**To be filled in by GPEC.** For each, a named person and confirmation that they can log in:

- Coolify dashboard:
- MongoDB Atlas:
- GitHub repository:
- Paystack dashboard (from step 5):
- Amazon Web Services (SES email):
- Domain and DNS registrar:
