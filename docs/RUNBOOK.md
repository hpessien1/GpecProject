# GPEC Website Runbook

How to set up, deploy, roll back, and respond to problems with the live site. Written for whoever
deploys: the project owner, or the developer with the owner's go-ahead. An AI assistant never
deploys. Engineering rules behind these steps are in
[`CLAUDE.md`](../CLAUDE.md), Section 7. All commands in one place: [`COMMANDS.md`](COMMANDS.md).

- **Last updated:** 2026-10-23
- **Live since 2026-10-22, not announced:** the site still shows mock About text, mock footer
  contacts, and no products. Do not share the address until GPEC's real content is in.

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
| Amazon Web Services | An AWS Settings project; region **eu-central-1 (Frankfurt)**, the nearest to the server |

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
   | `FRONTEND_URL` | `https://gpecengineering.com`: used for links in emails (and later Paystack). |
   | Email and photo settings | Leave out until Amazon SES and S3 are ready (Sections 1.6, 1.7). |

   **Untick "Available at Buildtime" on every API variable** (*Normal View*). Coolify passes
   build-time variables into the image build: `NODE_ENV=production` there makes `npm ci` skip the
   TypeScript compiler, so the build fails, and the connection string would end up in the build.
5. Leave Coolify's own *Healthcheck* off: the image's health check (`/api/health`) is used. If it is
   ever switched on, set path `/api/health` and port `5001` first.
6. Replicas: **1**. Do not enable autoscaling or a second instance — the rate limiter keeps its
   counts in memory.

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

The site emails GPEC staff about each new contact message (with a link to it in the admin
panel) and sends the customer a confirmation with their reference. **Until this is set up, email is
simply off**: everything else works, and the API log says `Email notifications are off`.

1. **AWS account.** The project owner created an AWS Settings project and invited the developer
   (each person signs in with their own AWS Builder ID; members cannot change billing or the spend
   limit). It is on AWS's **free plan**, whose access ends on 2027-04-22 or when the credits run
   out: the owner must **upgrade it to a paid plan and set a spend limit before launch**, or email
   and photos stop. Two-factor on the owner's login.
2. **Region.** **eu-central-1 (Frankfurt)**, the nearest to the server in Nuremberg. Choose it in the
   console's region menu before every step below.
3. **Verify GPEC's domain.** SES → *Identities* → *Create identity* → *Domain* →
   `gpecengineering.com` with *Easy DKIM* on. SES shows three CNAME records: add them in Cloudflare
   with Proxy status **DNS only** (proxied records fail verification; Cloudflare adds the domain to
   the name itself). The identity turns *Verified* once they are seen (minutes to a few hours). Also
   add a TXT record `_dmarc` with `v=DMARC1; p=none;`, which helps emails avoid spam folders.
4. **Leave the sandbox.** A new SES account can only email addresses verified in SES, about 200 a
   day. For a first test, verify the staff addresses (*Identities* → *Email address*). Then request
   production access (SES → *Account dashboard* → *Request production access*): use case
   *Transactional*, describing "confirmations and staff notifications for messages submitted on our
   website". Approval usually takes about a day. (Not yet known: whether a member, not only the
   owner, can send this request from an AWS Settings project.) Customer confirmations to unverified addresses
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
8. **Privacy notice.** Fill in the email service region in the privacy notice (`#privacy`).

### 1.7 Product photos (Amazon S3)

Staff upload product photos from their laptop, phone, or tablet in the admin product form. The
API checks and resizes each photo and keeps it in a **private** S3 bucket; visitors get photos
from the API, never from the bucket. **Until this is set up, uploads are simply off**: the form asks
for an image already on the site, and the API log says `Product photo uploads are off`.

1. **AWS account and region.** The AWS project from Section 1.6 (step 1), region eu-central-1.
2. **Bucket.** S3 → *Create bucket* → a name such as `gpec-product-images` (bucket names are
   unique across AWS), in that region. Keep **Block all public access on** (the default) and
   default encryption on. No bucket policy is needed.
3. **An upload-and-read-only key.** IAM → *Users* → create `gpec-product-images` (no console access)
   with this policy (use the real bucket name), then create an access key for it:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:GetObject"],
       "Resource": "arn:aws:s3:::gpec-product-images/product-images/*"
     }]
   }
   ```

   It can only add and read product photos in that one bucket; a leaked key cannot delete anything,
   list the bucket, or touch other AWS services.
4. **Coolify.** On the API resource, set all four (a partial set stops the API at startup with a
   list of what is missing), then redeploy the API:

   | Variable | Value |
   |---|---|
   | `S3_REGION` | The bucket's region (`eu-central-1`) |
   | `S3_BUCKET` | The bucket name from step 2 |
   | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | The key from step 3 (secret; Coolify only) |

5. **Test.** The API log no longer says uploads are off. In the admin panel, edit a sample
   product, choose a photo from your device (try a phone too), check the preview, and save. The
   shop should show the new photo.
6. **Cost.** At GPEC's size, well under a dollar a month: storage is tiny, and photos sent to
   visitors fall inside AWS's monthly free data-transfer allowance. Check the S3 pricing page for
   the chosen region.

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
| An admin cannot log in | Wrong password, account deactivated, or too many failed attempts | Wait 15 minutes after "Too many failed login attempts". Otherwise reset the password (Section 1.4). |
| `the breached-password check could not be made` in the API log | The API cannot reach `api.pwnedpasswords.com` (outage, or outgoing HTTPS blocked on the server) | Password changes still work; only the breach check was skipped. If it keeps happening, check that the server allows outgoing HTTPS. |
| Admin cannot set prices ("currency is configured") | `CURRENCY` is unset on the API | Expected until GPEC confirms the currency. Then set `CURRENCY` in Coolify and redeploy the API. |
| Forms say "Too many requests" for everyone | Proxy trust broken, so all visitors share one limit | Confirm `NODE_ENV=production` on the API. Report it to the developer. |
| Site shows old content after a deploy | Browser cache | `index.html` is never cached, so a normal reload fixes it. Photos and videos are cached for up to a day. |
| `Email for GPEC-… could not be sent: MessageRejected` in the API log | SES sandbox (recipient not verified) or sender not verified | Check Section 1.6 steps 3–4. The customer's request is saved either way. |
| `… could not be sent: AccessDenied` or `InvalidClientTokenId` | Wrong or limited SES key, or `EMAIL_FROM` differs from the policy's address | Check the IAM policy and the Coolify values (Section 1.6, steps 5–6). |
| No emails, and the log says `Email notifications are off` | Email settings not set in Coolify | Expected until SES is set up (Section 1.6). |
| Admin product form says "Photo uploads are not set up yet", or offers no photo upload | `S3_*` settings not set in Coolify | Expected until S3 is set up (Section 1.7). |
| Photo upload fails with "Something went wrong" and the API log shows `AccessDenied` or `NoSuchBucket` | Wrong key, bucket name, or region; or the IAM policy names a different bucket | Check Section 1.7, steps 2–4. |
| Shop shows a broken image for an uploaded photo | The photo was never stored (bucket or key changed since), or the API cannot reach S3 | Open `https://api.gpecengineering.com/api/<the product's image value>`: 404 means it is not in the bucket (upload it again); 500 means an S3 problem (check the API log). |
| A secret leaked (connection string, SES key, future Paystack key) | — | Rotate it at the source first (Atlas: change the `gpec-prod` password; SES or S3: create a new access key for `gpec-ses-sender` or `gpec-product-images` and delete the old one; Paystack: regenerate the key), update it in Coolify, redeploy, then tell the developer so the git history can be checked. |

### Payments (from roadmap step 5)

Paystack is not connected yet. This section will cover a failing webhook, an order stuck in
`pending_payment`, and how to check a payment in the Paystack dashboard once checkout is built.

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
