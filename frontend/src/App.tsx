import { useCallback, useEffect, useState } from "react";
import { ApiError, loadTrip, ping, planTrip, recentTrips } from "./api";
import { AlertIcon, LinkIcon, MenuIcon, PrintIcon, SparkIcon } from "./components/icons";
import { Sidebar, type Theme, type View } from "./components/Sidebar";
import { blankTrip } from "./components/TripForm";
import type { RecentTrip, TripPlan, TripRequest } from "./types";
import { ComplianceView } from "./views/ComplianceView";
import { LogsView } from "./views/LogsView";
import { OverviewView } from "./views/OverviewView";
import { PlannerView } from "./views/PlannerView";
import { RouteView } from "./views/RouteView";

/** Comfortably inside Render's 15-minute idle timeout, without spamming it. */
const KEEP_WARM_INTERVAL_MS = 10 * 60 * 1000;
const THEME_KEY = "eld-theme";

const VIEW_TITLES: Record<View, string> = {
  planner: "New trip",
  overview: "Overview",
  route: "Route & stops",
  logs: "Daily logs",
  compliance: "Compliance",
};

type ApiState = "online" | "waking" | "offline";

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* private mode or blocked storage — fall back to the system setting */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function shareIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/t\/([\w-]+)\/?$/);
  return match ? match[1] : null;
}

export default function App() {
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [draft, setDraft] = useState<TripRequest>(blankTrip);
  const [view, setView] = useState<View>("planner");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [recent, setRecent] = useState<RecentTrip[]>([]);
  const [api, setApi] = useState<ApiState>("waking");
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* not remembering the choice is not worth failing over */
    }
  }, [theme]);

  const refreshRecent = useCallback(() => {
    recentTrips().then(setRecent).catch(() => undefined);
  }, []);

  // Render's free tier sleeps after 15 minutes idle. Ping on load so the first
  // plan is not stuck behind a cold start, and keep a heartbeat going while the
  // tab is being looked at. A hidden tab stays quiet.
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      ping()
        .then(() => setApi("online"))
        .catch(() => setApi("offline"));
    };
    beat();
    refreshRecent();
    const timer = window.setInterval(beat, KEEP_WARM_INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [refreshRecent]);

  const open = useCallback((shareId: string) => {
    setLoading(true);
    setError(null);
    setMenuOpen(false);
    loadTrip(shareId)
      .then((result) => {
        setPlan(result);
        setView("overview");
        window.history.replaceState(null, "", `/t/${shareId}`);
      })
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Restore a shared trip from its permalink.
  useEffect(() => {
    const shareId = shareIdFromUrl();
    if (shareId) open(shareId);
  }, [open]);

  const submit = useCallback(
    async (request: TripRequest) => {
      setLoading(true);
      setError(null);
      setHighlight(null);
      try {
        const result = await planTrip(request);
        setPlan(result);
        setView("overview");
        setApi("online");
        if (result.share_id) window.history.replaceState(null, "", `/t/${result.share_id}`);
        window.scrollTo({ top: 0, behavior: "smooth" });
        refreshRecent();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Something went wrong while planning the trip.");
        if (err instanceof ApiError && err.status === 0) setApi("offline");
      } finally {
        setLoading(false);
      }
    },
    [refreshRecent],
  );

  const navigate = (next: View) => {
    setView(next);
    setMenuOpen(false);
    setError(null);
    window.scrollTo({ top: 0 });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard access can be refused; the URL is still in the address bar */
    }
  };

  const showTrip = plan && view !== "planner";
  const crumb = showTrip
    ? `${plan.places.pickup.name.split(",")[0]} → ${plan.places.dropoff.name.split(",")[0]}`
    : null;

  return (
    <div className={`shell${menuOpen ? " is-menu-open" : ""}`}>
      <Sidebar
        view={view}
        plan={plan}
        recent={recent}
        theme={theme}
        onNavigate={navigate}
        onOpenRecent={open}
        onTheme={setTheme}
      />
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="btn is-icon menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <MenuIcon size={18} />
          </button>

          <nav className="crumbs" aria-label="Breadcrumb">
            <span>Trips</span>
            <span className="sep">/</span>
            {crumb && (
              <>
                <strong>{crumb}</strong>
                <span className="sep">/</span>
              </>
            )}
            <span>{VIEW_TITLES[view]}</span>
          </nav>

          <div className="topbar-actions">
            <span className={`status-dot${api === "waking" ? " is-waking" : api === "offline" ? " is-down" : ""}`}>
              <i />
              <span>{api === "online" ? "API online" : api === "waking" ? "Waking API" : "API unreachable"}</span>
            </span>
            {showTrip && (
              <>
                <button type="button" className="btn" onClick={copyLink}>
                  <LinkIcon size={15} />
                  <span>{copied ? "Copied" : "Share"}</span>
                </button>
                <button
                  type="button"
                  className="btn is-dark"
                  onClick={() => {
                    setView("logs");
                    window.setTimeout(() => window.print(), 250);
                  }}
                >
                  <PrintIcon size={15} />
                  <span>Export logs</span>
                </button>
              </>
            )}
          </div>
        </header>

        <main className="content">
          {error && (
            <div className="alert" role="alert">
              <AlertIcon size={18} />
              <div>
                <strong>Could not plan that trip</strong>
                <span>{error}</span>
              </div>
            </div>
          )}

          {loading ? (
            <Loading waking={api !== "online"} />
          ) : !plan || view === "planner" ? (
            <PlannerView draft={draft} onChange={setDraft} onSubmit={submit} loading={loading} />
          ) : view === "overview" ? (
            <OverviewView
              key={`overview-${plan.share_id}`}
              plan={plan}
              highlight={highlight}
              onHighlight={setHighlight}
              onOpenRoute={() => navigate("route")}
            />
          ) : view === "route" ? (
            <RouteView key={`route-${plan.share_id}`} plan={plan} highlight={highlight} onHighlight={setHighlight} />
          ) : view === "logs" ? (
            <LogsView key={`logs-${plan.share_id}`} plan={plan} highlight={highlight} onHighlight={setHighlight} />
          ) : (
            <ComplianceView key={`compliance-${plan.share_id}`} plan={plan} />
          )}
        </main>

        <footer className="footer">
          <span>Routing: OpenRouteService / OSRM · Tiles © Esri, OpenStreetMap contributors</span>
          <span>Rules from FMCSA&rsquo;s Interstate Truck Driver&rsquo;s Guide to Hours of Service</span>
        </footer>
      </div>
    </div>
  );
}

function Loading({ waking }: { waking: boolean }) {
  return (
    <div className="view">
      <section className="card">
        <div className="loading-card">
          <SparkIcon size={22} className="spin" />
          <div>
            <strong>{waking ? "Waking the planning service…" : "Planning the trip…"}</strong>
            <span>
              {waking
                ? "The free-tier API sleeps when idle, so the first request takes a little longer."
                : "Geocoding, routing, then running the duty clocks across the whole trip."}
            </span>
          </div>
          <div className="loading-steps">
            <span className="tag is-info">Route</span>
            <span className="tag is-accent">HOS clocks</span>
            <span className="tag is-ok">Log sheets</span>
          </div>
        </div>
      </section>
      <div className="kpis">
        {[0, 1, 2, 3].map((index) => <div key={index} className="skeleton" style={{ height: 134 }} />)}
      </div>
      <div className="grid-main">
        <div className="skeleton" style={{ height: 520 }} />
        <div className="col">
          <div className="skeleton" style={{ height: 250 }} />
          <div className="skeleton" style={{ height: 250 }} />
        </div>
      </div>
    </div>
  );
}
