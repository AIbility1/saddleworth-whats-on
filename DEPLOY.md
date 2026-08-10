# Deploying to Azure Static Web Apps

Same shape as the galactic-map / Pool League / AIbility deployments — a fully
static site with **no build step and no API**. Everything in the repo is already
configured (`.github/workflows/azure-static-web-apps.yml`,
`staticwebapp.config.json`).

Build configuration (needed in Step 2):

| Setting          | Value                |
| ---------------- | -------------------- |
| Build presets    | Custom               |
| App location     | `/`                  |
| Api location     | *(leave empty)*      |
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

## 3. Custom domain (optional)

Static Web App → **Custom domains** → add e.g. `whatson.aibility.co.uk` (or a
standalone domain like `saddleworthwhatson.co.uk`) and create the CNAME it asks
for in your DNS.

## 4. Add it to the Labs page

`AIbility/src/pages/labs.astro` has a ready-made (commented-out) project entry
for this app — uncomment it, paste the live URL into `url`, and deploy the main
site. The screenshot it references is already at
`AIbility/public/labs/saddleworth-whats-on.png`.

## Notes

- Total payload is tiny (~60 KB + the data file) — the whole map is generated
  SVG, no tiles, no map library, no external requests at all.
- Updating listings later: edit `data/events.json`, commit, push — the workflow
  redeploys automatically (see `DATA.md`).
