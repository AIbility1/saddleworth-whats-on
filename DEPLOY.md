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

4. Print the real venue codes to hand out (run locally):
   `VENUE_CODE_SECRET=<the same secret> node scripts/venue-codes.js <venue-id>`
5. Moderation: open the live site with `#admin` on the URL, enter `ADMIN_CODE`,
   approve or remove submissions. Approving shows the venue's code and contact
   email so you can send it to them.

> Changing `VENUE_CODE_SECRET` later invalidates every venue code at once
> (events already published stay). That's the kill switch if codes leak.

## 4. Custom domain (optional)

Static Web App → **Custom domains** → add e.g. `whatson.aibility.co.uk` (or a
standalone domain like `saddleworthwhatson.co.uk`) and create the CNAME it asks
for in your DNS.

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
