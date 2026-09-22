import type { RecentTrip, TripPlan } from "../types";
import {
  CompassIcon,
  GridIcon,
  MoonIcon,
  PlusIcon,
  SheetIcon,
  ShieldIcon,
  SunIcon,
  TruckIcon,
} from "./icons";

export type View = "planner" | "overview" | "route" | "logs" | "compliance";
export type Theme = "light" | "dark";

const NAV: { id: Exclude<View, "planner">; label: string; icon: typeof GridIcon }[] = [
  { id: "overview", label: "Overview", icon: GridIcon },
  { id: "route", label: "Route & stops", icon: CompassIcon },
  { id: "logs", label: "Daily logs", icon: SheetIcon },
  { id: "compliance", label: "Compliance", icon: ShieldIcon },
];

/** "Dallas, TX" -> "Dallas" — enough to recognise a trip in a narrow list. */
const city = (place: string) => place.split(",")[0].trim();

/**
 * Planning the same trip twice should not list it twice. The API returns the
 * newest first, so keeping the first of each route keeps the latest run.
 */
function uniqueTrips(trips: RecentTrip[]): RecentTrip[] {
  const seen = new Set<string>();
  return trips.filter((trip) => {
    const key = [trip.current_location, trip.pickup_location, trip.dropoff_location,
                 trip.cycle_hours_used].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface Props {
  view: View;
  plan: TripPlan | null;
  recent: RecentTrip[];
  theme: Theme;
  onNavigate: (view: View) => void;
  onOpenRecent: (shareId: string) => void;
  onTheme: (theme: Theme) => void;
}

export function Sidebar({
  view,
  plan,
  recent,
  theme,
  onNavigate,
  onOpenRecent,
  onTheme,
}: Props) {
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand">
        <span className="brand-mark"><TruckIcon size={19} /></span>
        <div>
          <div className="brand-name">Spotter ELD</div>
          <div className="brand-sub">Trip planner</div>
        </div>
      </div>

      <button type="button" className="new-trip" onClick={() => onNavigate("planner")}>
        <PlusIcon size={16} />
        New trip
      </button>

      <div className="side-label">Current trip</div>
      <nav className="side-nav">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`side-link${view === id ? " is-active" : ""}`}
            onClick={() => onNavigate(id)}
            disabled={!plan}
            title={plan ? undefined : "Plan a trip first"}
            aria-current={view === id ? "page" : undefined}
          >
            <Icon size={17} />
            {label}
            {id === "logs" && plan && (
              <span className="side-count">{plan.log_days.length}</span>
            )}
            {id === "compliance" && plan && (
              <span
                className="side-count"
                style={
                  plan.compliance.feasible
                    ? undefined
                    : { background: "var(--bad)", color: "#fff" }
                }
              >
                {plan.compliance.feasible ? "✓" : "!"}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="side-label">Recent trips</div>
      <div className="recent">
        {recent.length === 0 && <p className="recent-empty">Trips you plan appear here.</p>}
        {uniqueTrips(recent).slice(0, 6).map((trip) => (
          <button
            key={trip.share_id}
            type="button"
            className={`recent-item${plan?.share_id === trip.share_id ? " is-active" : ""}`}
            onClick={() => onOpenRecent(trip.share_id)}
          >
            <span className="recent-route">
              {city(trip.pickup_location)} → {city(trip.dropoff_location)}
            </span>
            {/* Cycle hours are what tell two plans of the same route apart. */}
            <span className="recent-meta">
              {Math.round(trip.total_miles).toLocaleString()} mi · {trip.log_day_count}{" "}
              {trip.log_day_count === 1 ? "day" : "days"} · {trip.cycle_hours_used} h used
            </span>
          </button>
        ))}
      </div>

      <div className="side-spacer" />

      {/* The references' "upgrade" card, repurposed: the four limits at a glance. */}
      <div className="rules-card">
        <h4>Hours of service</h4>
        <p>Property carrier · 49 CFR 395</p>
        <div className="rules-grid">
          <div className="rule-pill"><strong>11 h</strong><span>driving</span></div>
          <div className="rule-pill"><strong>14 h</strong><span>duty window</span></div>
          <div className="rule-pill"><strong>30 m</strong><span>break after 8 h</span></div>
          <div className="rule-pill"><strong>70 h</strong><span>per 8 days</span></div>
        </div>
      </div>

      <div className="side-foot">
        <span>Appearance</span>
        <div className="theme-switch" role="group" aria-label="Colour theme">
          <button
            type="button"
            className={theme === "light" ? "is-on" : ""}
            onClick={() => onTheme("light")}
            aria-label="Light theme"
            aria-pressed={theme === "light"}
          >
            <SunIcon size={14} />
          </button>
          <button
            type="button"
            className={theme === "dark" ? "is-on" : ""}
            onClick={() => onTheme("dark")}
            aria-label="Dark theme"
            aria-pressed={theme === "dark"}
          >
            <MoonIcon size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
