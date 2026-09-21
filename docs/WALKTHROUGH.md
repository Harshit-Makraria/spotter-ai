# Understanding This Project

Read this before recording the Loom. Every section gives you the **plain-English**
version first, then the **technical** version underneath.

---

## Part 1 — What is this, really?

### Plain English

American truck drivers are legally not allowed to drive as long as they want. Federal
law caps how many hours they can drive per day and per week, and forces them to take
breaks. Every driver must keep a **daily log** — a paper grid showing, hour by hour,
whether they were driving, working but not driving, resting, or asleep in the bunk.
Police check these at roadside inspections.

Spotter AI asked: build an app where a dispatcher types in **four things**, and gets
back **a route with all the legally-required stops marked** and **the daily logs already
filled in**.

The four inputs:
1. Where the driver is right now
2. Where they pick up the load
3. Where they drop it off
4. How many hours they've already worked this week

### Technical

An HOS (Hours of Service) trip planner implementing **49 CFR Part 395**. It geocodes
three locations, requests a truck route, runs a deterministic duty-clock simulation
over the route distance, and renders the resulting record of duty status onto the
DOT graph grid, split per calendar day.

---

## Part 2 — The rules the app enforces

### Plain English

Think of the driver having **four separate timers** running at once. Every one of them
has to stay legal.

| Timer | What it means | What happens when it runs out |
|---|---|---|
| **11 hours** | Total *driving* time in one shift | Must stop and rest 10 hours |
| **14 hours** | Total *elapsed* time since starting work | Can't drive again until 10 hours off |
| **8 hours** | Driving time since the last break | Must take 30 minutes not driving |
| **70 hours** | Total *working* time over the last 8 days | Must take 34 hours off to reset |

The trickiest one is the **14-hour timer**. It is a *wall clock*. Once you start work at
6 a.m., your driving deadline is 8 p.m. — full stop. If you take a 2-hour nap at lunch,
the deadline is still 8 p.m. You just lost 2 hours. That's the single thing most people
get wrong when they build this.

### Technical

| Rule | CFR | Implementation |
|---|---|---|
| 11-hour driving limit | 395.3(a)(3) | `drive_in_window` counter, reset by a 10-hour rest |
| 14-hour window | 395.3(a)(2) | `window_start` timestamp; remaining = `window_start + 14h − clock`. Never extended by off-duty time |
| 30-minute break | 395.3(a)(3)(ii) | `drive_since_break` counter; any **consecutive** non-driving period ≥ 30 min resets it |
| 70-hour / 8-day cycle | 395.3(b) | `daily_on_duty: dict[date, int]` summed over a rolling 8-day window |
| 34-hour restart | 395.3(c) | Zeroes the ledger for all days up to the restart date |
| 10-hour reset | 395.3(a)(1) | Clears `drive_in_window`, `drive_since_break`, `window_start` |

---

## Part 3 — The four things most candidates get wrong

These are your talking points. Each one has a test proving we handle it.

### 1. A break eats your 14-hour window

**Plain:** Taking a 30-minute break doesn't give you 30 extra minutes at the end of the
day. You still have to stop driving 14 hours after you started.

**Technical:** `_window_remaining()` is computed from wall-clock elapsed time since
`window_start`, never from accumulated duty minutes. After inserting a break,
`_make_drivable()` loops and re-checks — because the break may itself have closed the
window, which then requires a 10-hour reset instead.

→ Test: `test_off_duty_time_does_not_extend_the_window`

### 2. The 70-hour cycle counts *working*, not *driving*

**Plain:** Loading the truck, fuelling it, doing paperwork — it all burns your weekly
hours, even though you're not moving.

**Technical:** `_charge_cycle()` is called for both `DRIVING` and `ON_DUTY` statuses and
attributes minutes to the calendar days they fall on, splitting at midnight.

### 3. The 1-hour pickup **is** the 30-minute break ⭐

**Plain:** The driver spends an hour loading. They weren't driving for that hour, so
that already counts as their required break. A badly-built app would make them stop
again 30 minutes later for no reason.

**Technical:** `_add()` accumulates `consecutive_off` across *any* non-driving segments
and zeroes `drive_since_break` once it reaches 30 minutes — regardless of whether the
status is `OFF_DUTY`, `ON_DUTY` or `SLEEPER`. This is FMCSA guide p.10 verbatim:
*"These interruptions can be used to satisfy the 30-minute break from driving, if
consecutive."*

→ Test: `test_one_hour_pickup_satisfies_the_break` — asserts **zero** `BREAK_30`
segments on a 5 h drive → 1 h load → 6 h drive trip.

**This is the single best thing to point at in the Loom.** It proves you read the
regulation rather than guessing.

### 4. A log sheet can show more than 11 driving hours

**Plain:** If a reviewer sees "13.5 hours driving" on one sheet they might think it's a
bug. It isn't. A *calendar day* runs midnight to midnight, but a *shift* doesn't. One
page can hold the end of last night's shift plus all of today's.

**Technical:** The 11-hour cap is per duty period, not per calendar day. `build_log_days()`
slices the continuous timeline at midnight; the compliance audit evaluates limits per
duty window, not per sheet.

**Be ready to say this out loud in the Loom** — it pre-empts the one "bug" they might
think they've found.

---

## Part 4 — How the code is organised

### Plain English

Three layers, each doing one job:

```
   You type 3 places  ──►  turn them into map coordinates  (geo.py)
                      ──►  ask a map service for the road route
                      ──►  simulate the driver's clocks     (hos.py)  ← the brain
                      ──►  cut the result into calendar days (logsheets.py)
                      ──►  draw it                          (LogSheet.tsx)
```

The important design decision: **the brain knows nothing about maps or the internet.**
It takes "drive 250 miles, load, drive 1,800 miles" and returns a timeline. That's why
we can test the law itself, separately from everything else.

### Technical

| File | Lines | Responsibility |
|---|---|---|
| `backend/trips/services/hos.py` | 680 | The simulator. **Zero Django or network imports.** Pure function. |
| `backend/trips/services/logsheets.py` | 260 | Timeline → balanced per-day sheets |
| `backend/trips/services/geo.py` | 394 | Geocoding + routing, ORS primary / OSRM fallback, cached |
| `backend/trips/services/planner.py` | 331 | Stitches geo + hos, labels stops, serialises |
| `backend/trips/views.py` | 117 | Three DRF endpoints |
| `backend/trips/tests/test_hos.py` | 455 | 27 tests |
| `frontend/src/components/LogSheet.tsx` | 430 | The DOT grid as SVG |
| `frontend/src/components/RouteMap.tsx` | 127 | Leaflet map, route + pins |
| `frontend/src/App.tsx` | 283 | Shell, tabs, state |

---

## Part 5 — How the simulator actually works

### Plain English

It's a loop. At every moment it asks: *"how far can I legally drive before something
stops me?"* It takes the **smallest** of all the limits, drives exactly that far, then
handles whatever stopped it.

Things that can stop you:
- hit 11 hours driving → sleep 10 hours
- hit the 14-hour deadline → sleep 10 hours
- hit 8 hours since your last break → take 30 minutes
- hit 1,000 miles since fuelling → fuel for 30 minutes
- ran out of weekly hours → take a 34-hour restart
- arrived at the pickup or drop-off → 1 hour of work

Then it loops again. Keep going until the load is delivered.

### Technical

```python
while miles_remaining > 0:
    _make_drivable()              # insert whatever rest the law requires
    minutes = min(
        11h − drive_in_window,        # 395.3(a)(3)
        window_start + 14h − clock,   # 395.3(a)(2)
        8h  − drive_since_break,      # 395.3(a)(3)(ii)
        70h − cycle_used,             # 395.3(b)
    )
    chunk = min(miles_remaining, minutes × speed, miles_to_fuel)
    _add(DRIVING, chunk)
    if fuel_due: _fuel_stop()
```

`_make_drivable()` **loops** rather than running once, because fixing one constraint can
expose another: a 30-minute break consumes 30 minutes of the 14-hour window, which may
itself end the duty period.

All arithmetic is in **whole integer minutes**, not floats. That is what guarantees the
four row totals on every sheet sum to exactly 24:00 with no rounding drift.

---

## Part 6 — The part that proves accuracy

### Plain English

We didn't just write the code and hope. FMCSA's own guide contains **worked examples** —
including a fully filled-in sample log for a driver called John Doe going from Richmond,
Virginia to Newark, New Jersey. The printed page shows his totals: 10 hours off duty,
1.75 in the bunk, 7.75 driving, 4.5 working — adding to 24.

Our test feeds his exact day into our code and checks we produce those same four
numbers. If our log-drawing logic were wrong, that test would fail.

There's also a test that generates **192 different trips** — different distances,
different starting hours, different amounts of weekly hours already used — and asserts
that not one of them produces a rule violation, and every single sheet balances to 24:00.

### Technical

```bash
cd backend && python -m unittest discover -s trips/tests -t .
# 27 tests, all passing
```

| Test | Source |
|---|---|
| `test_no_driving_after_the_fourteenth_hour` | guide p.6 |
| `test_guide_example_seven_hours_break_then_four_more` | guide p.7 |
| `test_rolling_eight_day_total_matches_the_guide_table` | guide p.11 (67 / 73 / 63 h) |
| `test_john_doe_completed_log_from_page_18` | guide pp.18–19 |
| `test_no_violations_across_many_trips` | 192 generated trips |

**The self-audit.** After planning, `_audit()` walks the finished segment list and
re-derives every clock **from scratch**, without looking at the simulator's internal
state. If the simulator had a bug, the audit would catch it rather than repeat it. Any
violation it finds is returned in the API response and shown red in the UI.

---

## Part 7 — The map

### Plain English

Free, no paid services. Routing comes from **OpenRouteService**, which has a specific
mode for heavy trucks rather than cars — trucks aren't allowed on some roads and have
different speeds. If that service is unavailable, it silently falls back to **OSRM**, a
free public routing server that needs no key at all. So the app works either way.

Map tiles are Esri's dark basemap — free and no key needed.

### Technical

- Routing: `POST /v2/directions/driving-hgv/geojson` (ORS) → OSRM `/route/v1/driving`
- Geocoding: ORS Pelias → Nominatim → bundled `us_cities.py` gazetteer
- Every call cached by hashed key; route geometry thinned from ~12,500 points to 1,800
  before it crosses the wire
- Stop coordinates are interpolated along the route with `Route.point_at_mile()`

---

## Part 8 — Honest limitations

Say these out loud in the Loom. Naming your own limitations reads as senior.

1. **Prior cycle hours are spread evenly** over the days before departure. The brief
   gives one number, not a day-by-day history, so the hours age out of the rolling
   window realistically. The engine accepts a real `previous_days` array where one exists.
2. **Split sleeper-berth pairing (395.1(g)) is not used.** It's legal and would sometimes
   buy more driving time, but a single 10-hour reset is the more conservative reading and
   the brief doesn't ask for it.
3. **Flat 55 mph** rather than terrain or traffic modelling, so arrival times are planning
   estimates. It's adjustable in the UI.
4. **Fuel stops mark the point on the highway** where fuel is due, not a specific named
   truck stop — there's no free API for truck stop locations.
5. **Pre/post-trip inspections are off by default** so the numbers match the brief's
   stated assumptions exactly. There's a toggle to turn them on.
