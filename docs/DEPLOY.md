# Deployment

Roughly 30 minutes end to end. Everything below is free — no card required for any of it.

**Order matters:** GitHub → Render (API) → Vercel (frontend) → connect the two.
Vercel needs the API's URL, and the API needs Vercel's URL, so there is one deliberate
back-and-forth at the end.

---

## Step 0 — Optional: an OpenRouteService key (2 min)

Without a key the app still works, falling back to the keyless OSRM demo server. With a
key you get ORS's **heavy-goods-vehicle** profile, which is genuine truck routing and a
better thing to say in the Loom.

1. Sign up at **https://openrouteservice.org/dev/#/signup** — email only, no card
2. Dashboard → request a token → **Standard** plan (2,000 requests/day)
3. Copy the key somewhere; you'll paste it into Render in Step 2

---

## Step 1 — Push to GitHub (5 min)

Create an empty repo at **https://github.com/new** — name it `eld-trip-planner`, no
README, no .gitignore (you already have both).

Then:

```bash
cd /c/Work/spotter_ai
git remote add origin https://github.com/YOUR_USERNAME/eld-trip-planner.git
git branch -M main
git push -u origin main
```

Confirm on GitHub that `node_modules`, `.venv` and `db.sqlite3` are **not** there. They
shouldn't be — `.gitignore` covers them.

---

## Step 2 — Deploy the API to Render (12 min)

The repo contains `render.yaml`, which provisions the web service **and** a free Postgres
database in one go.

1. Sign up at **https://render.com** with your GitHub account
2. **New → Blueprint**
3. Pick your `eld-trip-planner` repo. Render reads `render.yaml` and shows you a web
   service plus a database.
4. It will prompt for the two values marked `sync: false`:

   | Key | Value |
   |---|---|
   | `CORS_ALLOWED_ORIGINS` | Leave blank for now — you'll fill it in Step 4 |
   | `ORS_API_KEY` | Your key from Step 0, or leave blank |

5. **Apply.** First build takes ~5 minutes (installs deps, collects static, migrates).

When it's green, copy the URL. It'll look like
`https://eld-trip-planner-api.onrender.com`.

**Test it:**

```bash
curl https://eld-trip-planner-api.onrender.com/api/health/
```

You want `{"status":"ok"}`. If the first call takes 50 seconds, that's the free tier
waking up — normal, and the frontend handles it with a "waking the planning service"
state.

---

## Step 3 — Deploy the frontend to Vercel (8 min)

1. Sign up at **https://vercel.com** with GitHub
2. **Add New → Project** → import `eld-trip-planner`
3. **Critical:** set **Root Directory** to `frontend`. Click *Edit* next to Root
   Directory and pick the folder. Vercel will then auto-detect Vite.
4. Expand **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `VITE_API_BASE` | `https://eld-trip-planner-api.onrender.com` |

   No trailing slash.

5. **Deploy.** Takes about a minute.

Copy your URL — something like `https://eld-trip-planner.vercel.app`.

---

## Step 4 — Connect them (3 min)

The API currently rejects the browser because it doesn't know Vercel's origin.

1. Render → your service → **Environment**
2. Set `CORS_ALLOWED_ORIGINS` to your exact Vercel URL:
   ```
   https://eld-trip-planner.vercel.app
   ```
   No trailing slash. No quotes.
3. **Save changes** — Render redeploys automatically (~2 min)

> The backend also allows any `*.vercel.app` origin by regex, so preview deployments work
> too. Setting this explicitly is still correct for the production origin.

---

## Step 5 — Verify the live app

Open your Vercel URL and check each of these:

- [ ] Page loads, no console errors (F12 → Console)
- [ ] Click **Short haul** → map draws, one log sheet
- [ ] Click **Coast to coast** → 5 sheets, fuel stop pins visible
- [ ] Click **Cycle exhausted** → a 34-hour restart appears with an explanation
- [ ] Every sheet shows the green **"Totals 24:00 ✓"** badge
- [ ] **Copy link**, paste in a new tab → the same trip reloads
- [ ] **Print / PDF** → print preview shows only the log sheets, landscape
- [ ] Resize the window narrow → layout stacks, no horizontal scrolling

If the first request fails but the second works, that's the cold start. Move to Step 6.

---

## Step 6 — Keep it warm (3 min) — *do not skip this*

Render's free tier sleeps after 15 minutes idle. If the reviewer opens your link cold,
they wait ~50 seconds before anything happens. That is a bad first impression on an
assessment being graded partly on UX.

1. Go to **https://cron-job.org** and sign up (free)
2. **Create cronjob**
   - URL: `https://eld-trip-planner-api.onrender.com/api/health/`
   - Schedule: **every 10 minutes**
3. Save and enable

The app *also* pings `/api/health/` on page load and shows a graceful waking state, so
you're covered twice.

---

## Step 7 — Put the links in the README

Edit the top of `README.md`:

```markdown
**Live app:** https://eld-trip-planner.vercel.app
**API:** https://eld-trip-planner-api.onrender.com
**Walkthrough:** https://loom.com/share/YOUR_ID
```

```bash
git add README.md && git commit -m "Add deployed URLs" && git push
```

Do this **before** recording the Loom, so the repo you show on camera is the finished one.

---

## Troubleshooting

**CORS error in the browser console**
`CORS_ALLOWED_ORIGINS` doesn't exactly match. Check for a trailing slash, `http` vs
`https`, and that Render finished redeploying after you saved.

**Vercel builds but the page is blank**
Root Directory isn't set to `frontend`. Settings → General → Root Directory → `frontend`
→ redeploy.

**`/t/<id>` permalink 404s on Vercel**
`frontend/vercel.json` handles this rewrite. Confirm the file made it into the repo and
that Root Directory is `frontend`.

**Render build fails on `./build.sh`**
The file needs its executable bit in git:
```bash
git update-index --chmod=+x backend/build.sh
git commit -m "Make build.sh executable" && git push
```

**"Could not find <location>"**
Geocoding needs a state, e.g. `Dallas, TX` rather than `Dallas`. That message is already
what the UI shows.

**Everything works locally but not deployed**
Check Render → Logs. `DJANGO_DEBUG` is `false` in production, so errors go to the log
rather than the response body.
