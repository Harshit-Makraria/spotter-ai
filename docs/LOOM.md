# Loom Recording Script

**Target: 4:00–4:30.** They asked for 3–5 minutes. Going over 5 looks like you can't edit
yourself; coming in under 3 looks thin.

---

## Before you hit record

- [ ] Both servers running, **or** use the deployed URL (better — proves it's live)
- [ ] Browser zoom at 100%, close every other tab
- [ ] Have these three things open in separate tabs, in this order:
  1. The app
  2. `backend/trips/services/hos.py` in your editor
  3. A terminal sitting in `backend/`, cleared, ready to run the tests
- [ ] Pre-run one trip so the route is **cached** — a cold geocode takes a few seconds
      and dead air on camera is painful
- [ ] Close Slack/WhatsApp/notifications
- [ ] Water nearby. You will talk for 4 minutes straight.

> **Do one full practice run without recording.** You'll find the awkward transitions.

---

## The script

### 0:00 – 0:25 · Open with the problem, not your name

> "US truck drivers are legally capped on how long they can drive, and they have to keep
> a daily log that police check at roadside. So I built an app where you type in four
> things — where the driver is, the pickup, the drop-off, and how many hours they've
> already worked this week — and it gives you back a route with every legally required
> stop, plus the daily logs already filled in."

**Show:** the app's empty state.

*Don't* spend time on "Hi, I'm Harshit, thanks for the opportunity." Lead with the
product. You can say your name at the end.

---

### 0:25 – 1:15 · Run it live

**Click "Coast to coast."** Talk while it loads.

> "Los Angeles to Phoenix to New York — about 2,800 miles. The driver already has 5 hours
> on their weekly clock."

**When the map appears, trace the route with your cursor:**

> "Green is the pickup, red the drop-off. Everything in between the app decided was
> legally required — these amber ones are fuel stops, every thousand miles. Purple is a
> 30-minute break. Blue is a full 10-hour rest."

**Hover one pin** so the popup shows.

> "Each one tells you when, for how long, and how far into the trip."

**Scroll up to the four clocks.**

> "These are the four limits a driver is under at once — 11 hours driving, a 14-hour
> window, 30 minutes of break, and 70 hours a week. And this panel re-checks every rule
> against the finished schedule, with the regulation cited next to each one."

---

### 1:15 – 2:05 · The log sheets

**Click the "Daily logs" tab.**

> "This is the actual deliverable. One sheet per calendar day — five for this trip."

**Scroll to sheet 2 or 3** (a full day, more interesting than day 1).

> "This is the DOT grid, drawn to the layout in the regulation. Four rows — off duty,
> sleeper berth, driving, on duty not driving — 24 hours across, marked in 15-minute
> increments. The line is the driver's actual day."

**Point at the totals column:**

> "Hours per row down the right, and they have to add to exactly 24. Every sheet does."

**Point at the remarks:**

> "Underneath, the remarks — the law says you name the town at every change of duty
> status, so the app reverse-geocodes each stop and writes it in."

**Point at the recap box:**

> "And the recap — rolling weekly hours, and how many they'll have available tomorrow."

---

### 2:05 – 3:10 · The code ⭐ *This is the section that gets you hired*

**Switch to `hos.py`.**

> "The interesting part is how the rules are implemented. This file is the simulator, and
> it has zero Django imports and zero network calls — it's a pure function. You give it
> distances, it gives you back a timeline. That's deliberate, because it means I can test
> the regulation itself in isolation."

**Scroll to `_drive_leg` / the `min(...)` block.**

> "The core is a loop that asks: how far can I legally drive before something stops me?
> It takes the smallest of the four limits, drives exactly that far, then handles whatever
> stopped it."

**Now scroll to `_add()` — the `consecutive_off` logic. Slow down here.**

> "Here's the detail I want to show you. The regulation says the 30-minute break can be
> satisfied by *any* consecutive non-driving time — it doesn't have to be a dedicated
> break. So when the driver spends an hour loading at the pickup, that already counts.
> A naive implementation would make them stop again 30 minutes later for nothing."

**Switch to the terminal. Run the tests.**

```bash
python -m unittest discover -s trips/tests -t .
```

> "27 tests, and they're written against the worked examples in FMCSA's own guide."

**While they scroll past, call out two by name:**

> "This one — `test_john_doe_completed_log` — FMCSA's guide has a fully filled-in sample
> log in it. Ten hours off duty, 1.75 in the sleeper, 7.75 driving, 4.5 on duty. My test
> feeds that exact day in and checks I produce the same four numbers.
>
> And this one runs 192 generated trips and asserts not one of them produces a violation,
> and every sheet balances to 24 hours."

> "The engine also audits itself — after planning, it re-derives every clock from the
> output instead of trusting its own state, so a bug shows up as a violation rather than
> hiding."

---

### 3:10 – 3:50 · Architecture and deployment

> "Django and DRF on the backend, React with TypeScript and Vite on the front.
> Three service layers — one for maps, one for the rules, one that turns the timeline
> into calendar days."

> "Routing is OpenRouteService using their heavy-goods-vehicle profile, so it's truck
> routing rather than car directions, with a free keyless fallback to OSRM if that's
> ever unavailable. Tiles are Esri. All free."

> "Trips are persisted in Postgres, so every plan gets a shareable link."

**Click "Copy link" or show the `/t/...` URL.**

> "API is on Render, frontend on Vercel."

---

### 3:50 – 4:20 · Close on limitations, not on thanks

> "Two things I'd flag. The brief gives you one number for hours already used, not a
> day-by-day history, so I spread it evenly across the prior days — the engine takes a
> real array where you have one. And I didn't implement split sleeper-berth pairing;
> it's legal and would sometimes buy more driving time, but a single 10-hour reset is
> the more conservative reading."

> "One thing that looks like a bug but isn't — a sheet can show more than 11 driving
> hours, because the 11-hour cap is per shift and a calendar day can hold the end of
> one shift and the start of the next. The compliance check handles that correctly."

> "That's it — thanks for watching."

---

## Delivery notes

**Talk 10% slower than feels natural.** Everyone rushes on camera.

**Never narrate your mouse.** Not "now I'm going to click on the logs tab." Just click
it and say what it *is*.

**Don't apologise.** No "sorry, this is loading", no "excuse the mess". If something
hangs, keep talking about what it's doing.

**If you fumble a sentence, pause for two seconds and say it again cleanly.** Loom
viewers skim — a clean retake reads fine and re-recording the whole thing costs you 20
minutes.

**Record at 1080p.** Your log sheet has small text; 720p will make it mush.

---

## What to submit

Teamtailor asks for three links in one answer:

```
GitHub:  https://github.com/<you>/eld-trip-planner
Live:    https://<your-app>.vercel.app
Loom:    https://loom.com/share/<id>
```

Add one or two lines above them — not a cover letter:

> Built with Django + DRF and React/TypeScript. The HOS engine is a pure,
> framework-free module tested against the worked examples in FMCSA's driver's guide,
> including the completed sample log on pp.18–19. README covers the rules implemented
> and the assumptions made.

---

## If they ask follow-up questions

**"How did you handle the 14-hour rule?"**
> Wall clock from the first on-duty activity. Off-duty time inside the window doesn't
> extend it — that's the part people get wrong. After inserting a break I re-check
> whether the window has closed, because the break itself may have ended the shift.

**"What happens if the driver has no hours left?"**
> The planner inserts a 34-hour restart before they can work at all, and the UI explains
> why. Try the "Cycle exhausted" example — 69 hours used.

**"Why didn't you use a paid routing API?"**
> The brief said free. ORS gives a real heavy-goods-vehicle profile on the free tier,
> which is better than car routing for this, and I fall back to keyless OSRM so it can't
> hard-fail on a quota.

**"How long did this take?"**
> Within the 16 hours. Most of it went into the rules engine and the log sheet rendering.
