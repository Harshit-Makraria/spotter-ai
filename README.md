# ELD Trip Planner

Plan an hours-of-service compliant truck trip and get back a routed map with every
required stop, plus a filled-in DOT driver's daily log for each calendar day.

**Live app:** _add your Vercel URL_ · **API:** _add your Render URL_ · **Walkthrough:** _add your Loom URL_

---

## What it does

Give it four things — where the driver is now, where they pick up, where they drop
off, and how many hours of their 70-hour cycle are already used — and it returns:

- **A route** with the pickup and drop-off, and a marker for every fuel stop,
  30-minute break, 10-hour reset and 34-hour restart the regulations require.
- **One log sheet per calendar day**, drawn on the 24-hour DOT graph grid, with the
  duty line, quarter-hour ticks, the totals column, the remarks ruler naming the
  place of every duty-status change, and the rolling cycle recap.
- **A compliance panel** that re-checks the finished schedule rule by rule and shows
  where each of the four HOS clocks stands.

---

## Hours-of-service rules implemented

Taken from FMCSA's *Interstate Truck Driver's Guide to Hours of Service* (2022),
which documents 49 CFR Part 395.

| Rule | CFR | Behaviour |
|---|---|---|
| 11-hour driving limit | 395.3(a)(3) | At most 11 h driving per duty window, then 10 h off. |
| 14-hour driving window | 395.3(a)(2) | No driving after the 14th consecutive hour from the first work of the day. Measured on the wall clock — off-duty time inside the window does **not** extend it. |
| 30-minute break | 395.3(a)(3)(ii) | Required before exceeding 8 **cumulative** driving hours. Must be 30 *consecutive* minutes of non-driving; may be off duty, on duty, or in the sleeper berth. |
| 70-hour / 8-day cycle | 395.3(b) | Total **on-duty** time, not just driving, on a rolling window of days. |
| 34-hour restart | 395.3(c) | 34 consecutive hours off duty resets the cycle to zero. |
| 10-hour reset | 395.3(a)(1) | 10 consecutive hours off duty or sleeper resets the 11 and 14 hour clocks. |

### Details that are easy to get wrong

These are the cases the engine handles explicitly, and each has a test:

1. **A 30-minute break consumes 14-hour window time.** It does not push the deadline
   back, so after a break the planner re-checks whether any window is left.
2. **On-duty-not-driving counts against the 70-hour cycle.** Fuel stops, loading and
   unloading all accrue, not just driving.
3. **The 1-hour pickup already *is* the 30-minute break.** The guide says any
   qualifying consecutive non-driving period satisfies the rule, so the planner does
   not insert a redundant break right after loading.
4. **Short non-consecutive stops cannot be combined** to reach 30 minutes.
5. **Log days split at midnight**, so a status spanning midnight appears on both
   sheets and every sheet's four row totals add up to exactly 24:00.
6. **Driving hours on one *sheet* can exceed 11.** A calendar day can contain the tail
   of one duty period and the start of the next; the 11-hour limit applies per duty
   period, not per sheet. The compliance panel checks it correctly.

### Trip assumptions

Stated in the assessment brief, and applied as given:

- Property-carrying driver, 70 hrs / 8 days, no adverse driving conditions
- Fuel stop at least every 1,000 miles (30 min, on duty)
- 1 hour for pickup and 1 hour for drop-off (on duty)
- Average speed of 55 mph converts route miles to drive time — adjustable in the UI

Pre-/post-trip inspections are **off by default** so the output matches the brief's
assumptions exactly. They can be switched on under *planning assumptions*.

---

## Accuracy: how it is verified

The HOS engine (`backend/trips/services/hos.py`) is a pure function — no Django, no
network — so the rules are directly testable. The suite asserts against the guide's
own worked examples:

```bash
cd backend && python -m unittest discover -s trips/tests -t .
```

| Test | Source |
|---|---|
| On duty at 06:00 → no driving after 20:00 | guide p.6 |
| 11 h driving with a 30-minute break, inside the window | guide p.7 |
| Rolling 8-day totals of 67 / 73 / 63 hours | guide p.11 table |
| John Doe's completed log: off 10, sleeper 1.75, driving 7.75, on duty 4.5, **= 24** | guide pp.18–19 |
| 192 generated trips produce zero violations and balanced sheets | — |

The engine also **audits its own output**: after planning, it re-derives every clock
from the emitted segments rather than trusting its internal state, so a bug in the
simulator surfaces as a violation instead of hiding.

---

## Architecture

```
backend/                      Django + DRF
  config/                     settings, urls, wsgi
  trips/
    models.py                 Trip — persisted for shareable permalinks
    serializers.py            request validation
    views.py                  POST /api/trips/, GET /api/trips/<id>/
    services/
      hos.py                  the HOS simulator (pure, no framework imports)
      logsheets.py            duty timeline → balanced per-day log sheets
      geo.py                  geocoding + routing, ORS primary / OSRM fallback
      us_cities.py            offline gazetteer for remark labels
      planner.py              stitches geo + hos together
    tests/test_hos.py         FMCSA-derived test suite

frontend/                     React + Vite + TypeScript
  src/components/
    LogSheet.tsx              the DOT grid, drawn as SVG
    RouteMap.tsx              Leaflet map, route and stop markers
    TripForm.tsx              inputs and one-click examples
    Summary.tsx               stats, HOS clocks, compliance checklist
    Itinerary.tsx             stop-by-stop timeline
```

The split matters: `hos.py` knows nothing about HTTP or maps, which is what makes the
regulatory logic provable in isolation.

### API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/trips/` | Plan a trip; returns route, stops, log days and compliance |
| `GET` | `/api/trips/<share_id>/` | Reload a previously planned trip |
| `GET` | `/api/trips/recent/` | Most recent plans |
| `GET` | `/api/health/` | Liveness probe / keep-warm ping |

```bash
curl -X POST http://127.0.0.1:8000/api/trips/ \
  -H "Content-Type: application/json" \
  -d '{"current_location":"Dallas, TX",
       "pickup_location":"Oklahoma City, OK",
       "dropoff_location":"Chicago, IL",
       "cycle_hours_used":12}'
```

### Map services

All free. Routing prefers **OpenRouteService**'s `driving-hgv` profile — a genuine
heavy-goods-vehicle profile rather than car directions — and falls back to the
keyless **OSRM** demo server if there is no key or the quota is spent. Geocoding uses
ORS or Nominatim; a bundled gazetteer of US cities names stops when neither is
reachable, so the remarks column is never blank. Every outbound call is cached.

Tiles are Esri's dark canvas: free, keyless, and muted enough that the route reads
clearly.

---

## Running locally

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to Django, so no CORS setup is needed
for local work. An `ORS_API_KEY` is optional — without one the app uses OSRM.

---

## Deployment

**API on Render** — `render.yaml` is a blueprint that provisions the web service and a
free Postgres database. After the first deploy, set `CORS_ALLOWED_ORIGINS` to the
Vercel URL and, optionally, `ORS_API_KEY`.

**Frontend on Vercel** — root directory `frontend`, with `VITE_API_BASE` set to the
Render URL. `vercel.json` rewrites deep links so `/t/<share_id>` permalinks resolve.

Render's free tier sleeps after 15 minutes idle. The app pings `/api/health/` on load
and shows a "waking the planning service" state so a cold start never looks broken.

---

## Notes and limitations

- **Prior cycle hours are distributed evenly** across the days before departure, since
  the brief supplies a single total rather than a day-by-day history. This makes hours
  age out of the rolling window realistically. The engine accepts a real
  `previous_days` array where one is available.
- **Split sleeper-berth pairing** (395.1(g)) is not used. It is legal and would
  sometimes buy more driving time, but the brief does not call for it and a single
  10-hour reset is the more conservative reading.
- Average speed is a flat 55 mph rather than per-segment terrain or traffic modelling,
  so arrival times are planning estimates.
- Stop locations are placed by interpolating along the route geometry, so a fuel stop
  marks the point on the highway where fuel is due, not a specific named truck stop.
