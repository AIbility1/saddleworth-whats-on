# Deploying to Azure Static Web Apps

Same shape as the Pool League deployment — a static site with **no app build
step** plus a small managed-functions **API** (`api/`, Node 20) for the
community features: venue self-service events, business submissions,
moderation and ratings. Everything in the repo is already configured
(`.github/workflows/azure-static-web-apps.yml`, `staticwebapp.config.json`).

Build configuration (needed in Step 2):

| Setting          | Value                |
| ---------------- | -------------------- |
| Build presets    | Custom               |
| App location     | `/`                  |
| Api location     | `api`                |
| Output location  | *(leave empty)*      |

## 1. Push to GitHub

```bash
cd D:/GitHub/AIbility/saddleworth-whats-on
# Create an empty repo on github.com (e.g. "saddleworth-whats-on"), then:
git remote add origin https://github.com/AIbility1/saddleworth-whats-on.git
git push -u origin main
```

## 2. Create the Static Web App (Azure Portal)

1. Portal → **Create a resource** → **Static Web App**.
2. Plan type: **Free**.
3. Deployment source: **GitHub** → authorise → pick the repo + `main` branch.
4. Build presets: **Custom**, values from the table above.
5. **Create**. Azure either uses the committed workflow or writes its own with
   the same values; the site is live at a `*.azurestaticapps.net` URL in
   minutes. If Azure commits its own workflow file, delete the duplicate and
   keep whichever has `skip_app_build: true`.

## 3. Wire up the community API

The API needs a database and two secrets. Without them the map still works —
the API returns a polite 503 and the site runs on the editorial data alone.

1. Portal → **Create a resource** → **Azure Cosmos DB** → *NoSQL* →
   **Free tier** (1000 RU/s + 25 GB free, one per subscription — the Pool
   League already uses its own account? then pick serverless, it's pennies at
   this scale). The database (`whatson`) and containers (`events`, `venues`,
   `ratings`) are created automatically on first use.
2. Cosmos account → **Keys** → copy the **primary connection string**.
3. Static Web App → **Environment variables** (Configuration) → add:

   | Name                | Value                                             |
   | ------------------- | ------------------------------------------------- |
   | `COSMOS_CONNECTION` | the Cosmos connection string                      |
   | `VENUE_CODE_SECRET` | a long random string — venue codes derive from it |
   | `ADMIN_CODE`        | your moderation password                          |

4. Moderation lives in the **admin portal at `/admin`** — see the next section.
   (The lightweight `#admin` overlay on the map still works with `ADMIN_CODE`
   as a fallback.) Venue codes can also be printed locally:
   `VENUE_CODE_SECRET=<the same secret> node scripts/venue-codes.js <venue-id>`

## 3b. The admin portal — /admin, signed in with GitHub

`admin.html` is a full moderation console: a **community-events review queue**
(newest first, NEW badges, edit categories/wording in place, remove anything
dodgy), a **venue facts editor** (override hours, blurbs, tags, links on any
venue — applied live, no code change or deploy), the **business submissions
queue**, and **verify/un-verify** with codes.

Access is GitHub sign-in via Static Web Apps' built-in auth — no passwords in
our code. One-time setup per admin:

1. Portal → your Static Web App → **Role management** → **Invite**.
2. Provider **GitHub**, the person's GitHub username, role **`admin`**
   (type it — it's a custom role), generate the link.
3. Send them the invite link; they open it and sign in with GitHub. Done —
   `/admin` now lets them in, and the API honours their identity
   (SWA injects a tamper-proof `x-ms-client-principal` header).

Notes: invitations are capped at 25 per app (plenty); revoking a role in Role
management locks the person out immediately; `ADMIN_CODE` keeps working as the
dev-server / break-glass fallback, and changing it in Environment variables
rotates that path. Locally, `node scripts/dev-server.js` serves `/admin` with
the code fallback (no GitHub auth offline).

> Events are open — anyone can post, authors manage their own, `#admin` is the
> backstop. Changing `VENUE_CODE_SECRET` later invalidates every venue code at
> once. That's the kill switch if codes leak.

## 4. Custom domain — saddleworthlive.co.uk

Static Web App → **Custom domains** → add `www.saddleworthlive.co.uk` and
create the CNAME it asks for at the domain registrar; then add the apex
`saddleworthlive.co.uk` (Azure validates it with a TXT record and serves it
via an alias/ANAME or their apex support). Free SSL is automatic.

## 5. Add it to the Labs page

`AIbility/src/pages/labs.astro` has a ready-made (commented-out) project entry
for this app — uncomment it, paste the live URL into `url`, and deploy the main
site. The screenshot it references is already at
`AIbility/public/labs/saddleworth-whats-on.png`.

## Notes

- The whole map is generated SVG — no tiles, no map library; the only runtime
  requests are the site's own data files and its own API.
- Local development: `serve.cmd` (or `node scripts/dev-server.js`) runs the
  site *and* the API on http://localhost:8130 with file-backed storage in
  `.local-data/` — the full self-service flow works offline. Dev venue codes:
  `node scripts/venue-codes.js`.
- Editorial updates (walks, sights, blurbs, curated events): edit
  `data/events.json`, commit, push — the workflow redeploys (see `DATA.md`).
