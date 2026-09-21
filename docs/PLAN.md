# Spotter AI — Full Stack Assessment: Build Plan

**Deliverables:** GitHub repo · live hosted URL · 3–5 min Loom · (budget: 4 days / 16 hrs)

---

## 1. What the brief actually asks for

**Inputs**

| Field | Notes |
|---|---|
| Current location | free text → geocode |
| Pickup location | free text → geocode |
| Dropoff location | free text → geocode |
| Current Cycle Used (Hrs) | seeds the 70 hr / 8 day clock |

**Outputs**

1. **Map** with route + all stops and rests (must use a *free* map API)
2. **Daily Log Sheets**, actually *drawn* on the DOT grid — **multiple sheets for longer trips**

**Stated assumptions (given to us — do not re-invent)**

- Property-carrying driver, **70 hrs / 8 days**, **no adverse driving conditions**
- Fueling **at least once every 1,000 miles**
- **1 hour** for pickup and **1 hour** for drop-off

**Grading signals from the email**

- "We will test the hosted version for accuracy and the accuracy must be up to standards"
- "UI and UX must be good… good design and aesthetics can compensate for some inaccuracies"

> Read: **accuracy is the primary gate, design is the multiplier.** Both must be strong.

---

## 2. The HOS rules the engine must implement

Extracted from *Interstate Truck Driver's Guide to Hours of Service* (FMCSA, 2022) — 49 CFR Part 395.

| Rule | CFR | Behaviour |
|---|---|---|
| **11-hour driving limit** | 395.3(a)(3) | Max 11 hrs driving per duty window, then 10 consecutive hrs off. |
| **14-hour driving window** | 395.3(a)(2) | No driving after the 14th consecutive hour from the start of *any* work. **Wall-clock** — off-duty breaks do *not* extend it. |
| **30-minute rest break** | 395.3(a)(3)(ii) | Required after **8 cumulative** (not consecutive) driving hours. Must be 30 **consecutive** min of non-driving. May be off-duty, on-duty, or sleeper. |
| **70 hr / 8 day cycle** | 395.3(b) | Total **on-duty** time (driving + on-duty-not-driving). Once hit, no driving. |
| **34-hour restart** | 395.3(c) | 34 consecutive hrs off duty resets the cycle to zero. Optional, but essential on long trips. |
| **10-hour reset** | 395.3(a)(1) | 10 consecutive hrs off/sleeper resets both the 11 and 14 hr clocks. |

### Accuracy details most candidates get wrong — we will get right

1. **Off-duty breaks burn the 14-hour window.** A 30-min break costs 30 min of window. After a break we must re-check whether any window remains.
2. **On-duty-not-driving counts against the 70-hour cycle.** Fuel, pickup, dropoff and inspections all accrue.
3. **Other stops can satisfy the 30-min break.** The guide is explicit: a fuel stop or the 1-hour pickup *is* the break, if consecutive. A naive engine inserts a redundant 30-min break right after a 1-hour pickup — we won't.
4. **Short non-consecutive stops cannot be combined** to reach 30 minutes.
5. **Cycle must be checked before driving**, not after — if cycle ≥ 70 the driver cannot start at all.
6. **Logs are per calendar day, midnight→midnight, in the home-terminal time zone.** A status spanning midnight splits across two sheets, and each sheet's four row totals must sum to exactly 24.

### Verification against the guide's own worked examples

The test suite asserts these exact scenarios from the PDF:

- **p.6** — on duty 06:00 → must not drive after 20:00
- **p.7** — 06:00 start, drive 07:00–14:00 (7 h), 30-min break, drive 4 more h to 18:30; total 11 h, inside window
- **p.11** — rolling 8-day table totalling 67 / 73 / 63 hrs
- **p.18** — John Doe Richmond→Newark log: off 10, sleeper 1.75, driving 7.75, on-duty 4.5, **= 24**

---

## 3. The algorithm

A pure, deterministic, event-driven simulator. **No Django imports** — so it is unit-testable and provable.

```
state = { clock, driveSinceBreak, driveInWindow, windowStart,
          cycleUsed, milesSinceFuel, positionOnRoute }

loop until trip complete:
    # how far can we drive before something binds?
    limit = min(
        11 - driveInWindow,                    # 11-hour rule
        (windowStart + 14h) - clock,           # 14-hour window
        8  - driveSinceBreak,                  # 30-min break rule
        70 - cycleUsed,                        # cycle
        milesToNextFuel  / speed,              # 1,000-mile fuel
        milesToNextEvent / speed,              # pickup / dropoff / finish
    )
    drive(limit)
    handle the binding constraint:
        break needed   -> 30-min OFF_DUTY      (resets driveSinceBreak)
        11h or 14h hit -> 10-hour OFF_DUTY     (resets 11h, 14h and break)
        fuel           -> 30-min ON_DUTY       (also satisfies the break)
        pickup/dropoff -> 60-min ON_DUTY       (also satisfies the break)
        cycle spent    -> 34-hour RESTART      (resets cycle to 0)
```

Output: an ordered list of `DutySegment { status, start, end, location, note }`
→ sliced at midnight into `LogDay` objects → rendered onto the DOT grid.

**Speed model:** default **55 mph** average (the standard truck planning figure), surfaced in the UI as an editable assumption. Route distance comes from the routing API; duration is derived from it, so every number on screen is self-consistent and explainable.

---

## 4. Feature list

### Core — directly graded

1. Trip form: three locations with autocomplete, cycle-used, start date/time
2. **Map** — route polyline, markers for start / pickup / dropoff **and every fuel stop, 30-min break, 10-hr rest and 34-hr restart**, each with its own icon and a popup (what, when, how long)
3. **ELD log sheets** — faithful DOT grid in SVG: four status rows, 15-min ticks, drawn duty line with vertical connectors, per-row TOTAL HOURS and `=24`, REMARKS ruler with angled city/state labels, filled header, and the 70 hr/8 day recap box
4. Trip summary — distance, duration, ETA, driving hrs, on-duty hrs, stop count, cycle remaining
5. Stop-by-stop itinerary timeline

### Differentiators — what turns "passed" into "hired"

6. **HOS compliance panel** — live gauges for the 11 / 14 / 8 / 70 hour clocks, plus an explicit checklist of the rules satisfied. *This is how we demonstrate accuracy to the grader on screen.*
7. **Infeasibility explained** — cycle already at 70? Show why, and show the 34-hr restart that resolves it
8. **PDF export** of all log sheets, plus JSON/CSV itinerary
9. **Shareable permalink** `/trip/:id` — persisted in Postgres, proves the Django layer does real work
10. **Map ↔ log sync** — hover a stop and the matching span highlights on the log sheet, and vice versa
11. **One-click example trips** — a short one (single sheet) and a long one (4+ sheets, including a 34-hr restart) so a reviewer never has to type
12. Responsive, dark/light, keyboard accessible
13. **Django test suite** covering the FMCSA examples above

---

## 5. Stack & hosting

| Layer | Choice | Why |
|---|---|---|
| Backend | **Django + DRF** | required |
| DB | **Postgres** (Neon / Render free) | permalinks, saved trips |
| Frontend | **React + Vite + TypeScript** | required; TS for correctness |
| Map render | **Leaflet + CARTO basemap** | free, no key, looks premium |
| Routing | **OpenRouteService** (free key) → **OSRM demo** fallback | free, resilient |
| Geocoding | **Nominatim / ORS**, server-side + cached | free, keeps keys off the client |
| Log sheet | **hand-built SVG** | pixel control, prints clean, exports to PDF |

**Deploy: Django API on Render (free) + React on Vercel.** Both free, no serverless quirks. A 10-minute keep-warm ping avoids Render's cold start, and the UI shows a graceful "waking server" state meanwhile.

---

## 6. Schedule (16 hrs)

| Hrs | Work |
|---|---|
| 0–1 | Scaffold repo, **deploy the skeleton to Render + Vercel on day one** (never leave deploy to the last hour) |
| 1–4 | **HOS engine + tests** — the hardest and most valuable piece |
| 4–6 | Geocoding, routing, planner, log-day builder, REST API |
| 6–10 | React: form, map, itinerary |
| 10–13 | **Log-sheet SVG** (the showpiece) + PDF export |
| 13–15 | Polish: HOS clocks, examples, responsive, dark mode, error states |
| 15–16 | Loom + README |

---

## 7. Loom script (3–5 min)

1. **0:00–0:30** — the problem, then run the long-trip example live
2. **0:30–1:30** — the outputs: map with every stop, HOS clock panel, multi-day log sheets
3. **1:30–3:00** — the code: the pure HOS engine, then **run the tests against the FMCSA examples on camera**
4. **3:00–4:00** — architecture, API shape, deployment
5. **4:00–4:30** — edge cases handled, and what I'd build next
