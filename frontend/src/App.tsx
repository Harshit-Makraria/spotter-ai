import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, loadTrip, ping, planTrip } from "./api";
import { DutyTimeline } from "./components/DutyTimeline";
import { Itinerary } from "./components/Itinerary";
import { LogSheet } from "./components/LogSheet";
import { RouteMap } from "./components/RouteMap";
import {
  ComplianceBadge,
  CompliancePanel,
  HosClocks,
  KpiRow,
} from "./components/Summary";
import { TripForm } from "./components/TripForm";
import {
  ArrowRightIcon,
  LinkIcon,
  ListIcon,
  MapPinIcon,
  MoonIcon,
  PrintIcon,
  RouteIcon,
  SheetIcon,
  ShieldIcon,
  SunIcon,
  TruckIcon,
} from "./components/icons";
import type { TripPlan, TripRequest } from "./types";

type Tab = "overview" | "logs" | "itinerary" | "compliance";

const TABS: { id: Tab; label: string; icon: typeof RouteIcon }[] = [
  { id: "overview", label: "Overview", icon: RouteIcon },
  { id: "logs", label: "Daily logs", icon: SheetIcon },
  { id: "itinerary", label: "Itinerary", icon: ListIcon },
  { id: "compliance", label: "Compliance", icon: ShieldIcon },
];

/** Comfortably inside Render's 15-minute idle timeout, without spamming it. */
const KEEP_WARM_INTERVAL_MS = 10 * 60 * 1000;
const THEME_KEY = "eld-theme";

type Theme = "light" | "dark";

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* private mode, blocked storage — fall through to the system preference */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function shareIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/t\/([\w-]+)\/?$/);
  return match ? match[1] : null;
}

export default function App() {
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [highlight, setHighlight] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* not being able to remember the choice is not worth failing over */
    }
  }, [theme]);

  // The free-tier API sleeps after 15 minutes idle. Ping on load so the first
  // plan is not stuck behind a cold start, then keep a heartbeat going while
  // the tab is actually being looked at. A hidden tab stays quiet.
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") ping().catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, KEEP_WARM_INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
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
      setTab("overview");
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
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><TruckIcon size={19} /></span>
          <div>
            <div className="brand-name">Spotter ELD</div>
            <div className="brand-sub">Trip Planner</div>
          </div>
        </div>

        {plan && (
          <nav className="nav" role="tablist" aria-label="Trip views">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "is-active" : ""}
                onClick={() => setTab(id)}
              >
                <Icon size={15} />
                {label}
                {id === "logs" && (
                  <span className="nav-badge">{plan.log_days.length}</span>
                )}
              </button>
            ))}
          </nav>
        )}

        <div className="topbar-actions">
          {plan && (
            <>
              <button type="button" className="pill-btn" onClick={copyLink}>
                <LinkIcon size={15} />
                {copied ? "Copied" : "Share"}
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => window.print()}
                aria-label="Print or save log sheets as PDF"
              >
                <PrintIcon size={16} />
              </button>
            </>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </button>
        </div>
      </header>

      <div className="page">
        <div className="page-head">
          <div className="page-title">
            <div>
              <h1>{plan ? "Trip Plan" : "Plan a compliant trip"}</h1>
              {plan ? (
                <p>
                  <span className="route-chip">
                    <i className="dot" style={{ background: "var(--ok)" }} />
                    {plan.places.pickup.name}
                  </span>
                  <ArrowRightIcon size={13} className="arrow" />
                  <span className="route-chip">
                    <i className="dot" style={{ background: "var(--bad)" }} />
                    {plan.places.dropoff.name}
                  </span>
                  <ComplianceBadge plan={plan} />
                </p>
              ) : (
                <p>Hours-of-service routing and DOT daily logs · 49 CFR Part 395</p>
              )}
            </div>
          </div>
        </div>

        {plan && !loading && <KpiRow plan={plan} />}

        <div className="board" ref={resultsRef}>
          <aside className="rail">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Trip details</h2>
                  <p>Four inputs, then the clocks do the rest</p>
                </div>
              </div>
              <div className="card-body">
                <TripForm onSubmit={submit} loading={loading} />
              </div>
            </section>

            {plan && !loading && (
              <section className="card">
                <div className="card-head">
                  <div>
                    <h3>Hours of service</h3>
                    <p>Where the clocks stand on arrival</p>
                  </div>
                </div>
                <div className="card-body">
                  <HosClocks plan={plan} />
                </div>
              </section>
            )}
          </aside>

          <main className="stack">
            {error && (
              <div className="alert" role="alert">
                <div>
                  <strong>Could not plan that trip</strong>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {loading && <LoadingState waking={waking} />}
            {!loading && !plan && !error && <EmptyState />}

            {plan && !loading && (
              <>
                <section className={`panel${tab === "overview" ? "" : " is-hidden"}`}
                  style={{ display: tab === "overview" ? "flex" : "none",
                           flexDirection: "column", gap: 16 }}>
                  <div className="card map-card">
                    <RouteMap
                      plan={plan}
                      highlightSegment={highlight}
                      onHoverSegment={setHighlight}
                    />
                    <div className="map-overlay at-top-left">
                      <RouteProgress plan={plan} />
                    </div>
                  </div>

                  <div className="card timeline-card">
                    <div className="card-head">
                      <div>
                        <h3>Duty status timeline</h3>
                        <p>Every day of the trip, midnight to midnight</p>
                      </div>
                      <span className="chip is-accent">
                        {plan.log_days.length} day{plan.log_days.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="card-body">
                      <DutyTimeline
                        plan={plan}
                        highlightSegment={highlight}
                        onHoverSegment={setHighlight}
                      />
                    </div>
                  </div>
                </section>

                <section
                  className={`panel is-logs`}
                  style={{ display: tab === "logs" ? "block" : "none" }}
                >
                  <div className="sheets">
                    {plan.log_days.map((day, index) => (
                      <article className="card" key={day.date}>
                        <div className="card-head">
                          <div>
                            <h2>
                              {new Date(`${day.date}T00:00:00`).toLocaleDateString(
                                undefined,
                                { weekday: "long", month: "long", day: "numeric",
                                  year: "numeric" },
                              )}
                            </h2>
                            <p>
                              Sheet {index + 1} of {plan.log_days.length} ·{" "}
                              {day.miles_driven.toFixed(0)} miles driving ·{" "}
                              {day.total_on_duty_hours} h on duty
                            </p>
                          </div>
                          <span className={`chip ${day.balanced ? "is-ok" : "is-bad"}`}>
                            {day.balanced ? "Totals 24:00" : "Does not total 24:00"}
                          </span>
                        </div>
                        <div className="sheet-scroll">
                          <LogSheet
                            day={day}
                            dayNumber={index + 1}
                            totalDays={plan.log_days.length}
                            inputs={plan.inputs}
                            shippingNumber={plan.share_id ?? "—"}
                            highlightSegment={highlight}
                            onHoverSegment={setHighlight}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section
                  className="panel"
                  style={{ display: tab === "itinerary" ? "block" : "none" }}
                >
                  <div className="card">
                    <div className="card-head">
                      <div>
                        <h2>Stop-by-stop</h2>
                        <p>Every duty change, in order</p>
                      </div>
                      <span className="chip">{plan.stops.length} stops</span>
                    </div>
                    <div className="card-body">
                      <Itinerary
                        plan={plan}
                        highlightSegment={highlight}
                        onHoverSegment={setHighlight}
                      />
                    </div>
                  </div>
                </section>

                <section
                  className="panel"
                  style={{ display: tab === "compliance" ? "block" : "none" }}
                >
                  <div className="card">
                    <div className="card-head">
                      <div>
                        <h2>Compliance report</h2>
                        <p>Each rule re-checked against the finished schedule</p>
                      </div>
                      <ComplianceBadge plan={plan} />
                    </div>
                    <div className="card-body">
                      <CompliancePanel plan={plan} />
                    </div>
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      </div>

      <footer className="footer">
        <span>
          Routing by OpenRouteService / OSRM · tiles © Esri, OpenStreetMap contributors
        </span>
        <span>
          Rules from FMCSA&rsquo;s <em>Interstate Truck Driver&rsquo;s Guide to Hours of
          Service</em>
        </span>
      </footer>
    </div>
  );
}

/** Origin → destination progress, in the shape of the DHL tracking reference. */
function RouteProgress({ plan }: { plan: TripPlan }) {
  const { summary, places } = plan;
  const start = new Date(summary.start_time);
  const end = new Date(summary.end_time);

  return (
    <div className="progress-route">
      <div className="progress-ends">
        <span>{places.current.name}</span>
        <span>{places.dropoff.name}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: "100%" }} />
      </div>
      <div className="progress-meta">
        <span>{start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span className="num">{Math.round(summary.total_miles).toLocaleString()} mi</span>
        <span>{end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
      </div>
    </div>
  );
}

function LoadingState({ waking }: { waking: boolean }) {
  return (
    <>
      <div className="skeleton" style={{ height: 420 }} />
      <div className="card">
        <div className="loading-note">
          <strong>{waking ? "Waking the planning service…" : "Building route…"}</strong>
          <span>
            {waking
              ? "The free-tier API sleeps when idle. This takes a few seconds the first time."
              : "Geocoding locations, routing, then simulating the duty clocks."}
          </span>
        </div>
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="card">
      <div className="state">
        <span className="state-art"><MapPinIcon size={40} /></span>
        <h2>Ready when you are</h2>
        <p>
          Enter the driver&rsquo;s current location, the pickup and drop-off, and how many
          hours of the cycle are already used. You&rsquo;ll get a routed map with every
          required stop and a filled-in log sheet for each day.
        </p>
        <p className="state-hint">Or pick one of the example trips on the left.</p>
      </div>
    </div>
  );
}
