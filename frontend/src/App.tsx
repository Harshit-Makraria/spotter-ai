import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, loadTrip, ping, planTrip } from "./api";
import { Itinerary } from "./components/Itinerary";
import { LogSheet } from "./components/LogSheet";
import { RouteMap } from "./components/RouteMap";
import { CompliancePanel, HosClocks, SummaryStats } from "./components/Summary";
import { TripForm } from "./components/TripForm";
import type { TripPlan, TripRequest } from "./types";

type Tab = "map" | "logs" | "itinerary";

const TABS: { id: Tab; label: string }[] = [
  { id: "map", label: "Route & stops" },
  { id: "logs", label: "Daily logs" },
  { id: "itinerary", label: "Itinerary" },
];

function shareIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/t\/([\w-]+)\/?$/);
  return match ? match[1] : null;
}

export default function App() {
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("map");
  const [highlight, setHighlight] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Nudge the free-tier API awake so the first plan is not stuck behind a cold start.
  useEffect(() => {
    ping().catch(() => undefined);
  }, []);

  // Restore a shared trip from its permalink.
  useEffect(() => {
    const shareId = shareIdFromUrl();
    if (!shareId) return;
    setLoading(true);
    loadTrip(shareId)
      .then(setPlan)
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const submit = useCallback(async (request: TripRequest) => {
    setLoading(true);
    setError(null);
    setHighlight(null);

    const slowTimer = window.setTimeout(() => setWaking(true), 3500);
    try {
      const result = await planTrip(request);
      setPlan(result);
      setTab("map");
      if (result.share_id) {
        window.history.replaceState(null, "", `/t/${result.share_id}`);
      }
      window.requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong while planning the trip.",
      );
    } finally {
      window.clearTimeout(slowTimer);
      setWaking(false);
      setLoading(false);
    }
  }, []);

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">▮▮</span>
          <div>
            <h1>ELD Trip Planner</h1>
            <p>
              Hours-of-service routing and DOT daily logs · 49 CFR Part 395
            </p>
          </div>
        </div>
        {plan && (
          <div className="masthead-actions">
            <button type="button" onClick={copyLink} className="ghost">
              {copied ? "Link copied" : "Copy link"}
            </button>
            <button type="button" onClick={() => window.print()} className="ghost">
              Print / PDF
            </button>
          </div>
        )}
      </header>

      <div className="layout">
        <aside className="sidebar">
          <TripForm onSubmit={submit} loading={loading} />
          {plan && <CompliancePanel plan={plan} />}
        </aside>

        <main className="main" ref={resultsRef}>
          {error && (
            <div className="alert" role="alert">
              <strong>Could not plan that trip</strong>
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="loading">
              <div className="spinner" aria-hidden="true" />
              <strong>{waking ? "Waking the planning service…" : "Building route…"}</strong>
              <span>
                {waking
                  ? "The free-tier API sleeps when idle. This takes a few seconds the first time."
                  : "Geocoding locations, routing, then simulating the duty clocks."}
              </span>
            </div>
          )}

          {!loading && !plan && !error && <EmptyState />}

          {plan && !loading && (
            <>
              <SummaryStats plan={plan} />
              <HosClocks plan={plan} />

              <nav className="tabs" role="tablist">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    role="tab"
                    aria-selected={tab === item.id}
                    className={tab === item.id ? "is-active" : ""}
                    onClick={() => setTab(item.id)}
                  >
                    {item.label}
                    {item.id === "logs" && (
                      <span className="tab-count">{plan.log_days.length}</span>
                    )}
                  </button>
                ))}
              </nav>

              <section className={`panel${tab === "map" ? " is-visible" : ""}`}>
                <RouteMap
                  plan={plan}
                  highlightSegment={highlight}
                  onHoverSegment={setHighlight}
                />
                <Legend />
              </section>

              <section
                className={`panel logs${tab === "logs" ? " is-visible" : ""}`}
                id="log-sheets"
              >
                {plan.log_days.map((day, index) => (
                  <article className="sheet-card" key={day.date}>
                    <header className="sheet-head">
                      <div>
                        <h2>
                          {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </h2>
                        <p>
                          Sheet {index + 1} of {plan.log_days.length} ·{" "}
                          {day.miles_driven.toFixed(0)} miles driving ·{" "}
                          {day.total_on_duty_hours} h on duty
                        </p>
                      </div>
                      <span className={`balance${day.balanced ? "" : " is-bad"}`}>
                        {day.balanced ? "Totals 24:00 ✓" : "Does not total 24:00"}
                      </span>
                    </header>
                    <div className="sheet-scroll">
                      <LogSheet
                        day={day}
                        dayNumber={index + 1}
                        totalDays={plan.log_days.length}
                        inputs={plan.inputs}
                        highlightSegment={highlight}
                        onHoverSegment={setHighlight}
                      />
                    </div>
                  </article>
                ))}
              </section>

              <section className={`panel${tab === "itinerary" ? " is-visible" : ""}`}>
                <Itinerary
                  plan={plan}
                  highlightSegment={highlight}
                  onHoverSegment={setHighlight}
                />
              </section>
            </>
          )}
        </main>
      </div>

      <footer className="footer">
        <span>
          Routing by OpenRouteService / OSRM · tiles © OpenStreetMap contributors, © CARTO
        </span>
        <span>
          Rules implemented from FMCSA&rsquo;s <em>Interstate Truck Driver&rsquo;s Guide
          to Hours of Service</em>
        </span>
      </footer>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <div className="empty-art" aria-hidden="true">
        <svg viewBox="0 0 220 120" width="220" height="120">
          <path
            d="M10 96 H210"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="10 8"
            opacity="0.35"
          />
          <rect x="24" y="52" width="86" height="40" rx="5" fill="currentColor" opacity="0.85" />
          <rect x="110" y="62" width="52" height="30" rx="4" fill="currentColor" opacity="0.55" />
          <circle cx="52" cy="96" r="10" fill="currentColor" />
          <circle cx="138" cy="96" r="10" fill="currentColor" />
          <path d="M126 34 L142 34 L134 18 Z" fill="currentColor" opacity="0.4" />
        </svg>
      </div>
      <h2>Plan a compliant trip</h2>
      <p>
        Enter the driver&rsquo;s current location, the pickup and drop-off, and how many
        hours of the cycle are already used. You&rsquo;ll get a routed map with every
        required stop and a filled-in log sheet for each day.
      </p>
      <p className="empty-hint">Or pick one of the example trips above.</p>
    </div>
  );
}

function Legend() {
  const items = [
    { colour: "#16a34a", glyph: "▲", label: "Pickup" },
    { colour: "#dc2626", glyph: "■", label: "Drop-off" },
    { colour: "#f59e0b", glyph: "⛽", label: "Fuel" },
    { colour: "#8b5cf6", glyph: "☕", label: "30-min break" },
    { colour: "#2563eb", glyph: "🛏", label: "10-hour reset" },
    { colour: "#e11d48", glyph: "⏸", label: "34-hour restart" },
  ];
  return (
    <ul className="legend">
      {items.map((item) => (
        <li key={item.label}>
          <span className="legend-pin" style={{ ["--pin" as string]: item.colour }}>
            {item.glyph}
          </span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
