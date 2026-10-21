# GPEC Website Runbook

How to set up, deploy, roll back, and respond to problems with the live site. Written for the
project owner, who is the only person who deploys. Engineering rules behind these steps are in
[`CLAUDE.md`](../CLAUDE.md), Section 7.

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

---

## 2. Deploying

1. Check that GitHub Actions CI is green for the `main` commit you are shipping.
2. In Coolify, deploy the **API first**, then the **website** (a new site may call a new API route).
3. On the first deploy, and whenever `MONGODB_URI` is edited: confirm it ends in **`/gpec?`**. The
   API refuses to start on any other database and the deployment log says so:
   `Refusing to start: production must use the "gpec" database ...`
4. Right after deploying, check:
   - `https://<api-domain>/api/health` returns `{"status":"ok"}`. This only proves the API process
     is running, not that the database is reachable — so also:
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
| Forms say they cannot reach GPEC | API down, or the site was built with the wrong API address | Check `/api/health`. If it is fine, check `VITE_API_BASE_URL` on the website resource and rebuild. The browser console will show a Content-Security-Policy or CORS error if the addresses do not match `CLIENT_ORIGIN`. |
| Forms say "Too many requests" for everyone | Proxy trust broken, so all visitors share one limit | Confirm `NODE_ENV=production` on the API. Report it to the developer. |
| Site shows old content after a deploy | Browser cache | `index.html` is never cached, so a normal reload fixes it. Photos and videos are cached for up to a day. |
| A secret leaked (connection string, future Paystack key) | — | Rotate it at the source first (Atlas: change the `gpec-prod` password; Paystack: regenerate the key), update it in Coolify, redeploy, then tell the developer so the git history can be checked. |

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
- Domain and DNS registrar:
