import { CycleGauge } from "../components/CycleGauge";
import { DutyTimeline } from "../components/DutyTimeline";
import { StopList } from "../components/Itinerary";
import { RouteMap, STOP_STYLE } from "../components/RouteMap";
import { KpiRow } from "../components/Summary";
import type { EventKind, TripPlan } from "../types";
import { TripHeader } from "./TripHeader";

interface Props {
  plan: TripPlan;
  highlight: number | null;
  onHighlight: (index: number | null) => void;
  onOpenRoute: () => void;
}

const LEGEND: EventKind[] = ["pickup", "dropoff", "fuel", "break_30", "rest_10", "restart_34"];

export function OverviewView({ plan, highlight, onHighlight, onOpenRoute }: Props) {
  const { summary, places } = plan;
  const start = new Date(summary.start_time);
  const end = new Date(summary.end_time);
  const shortDate = (date: Date) =>
    date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="view">
      <TripHeader plan={plan} title="Trip overview" />
      <KpiRow plan={plan} />

      <div className="grid-main">
        <section className="card map-card">
          <RouteMap plan={plan} highlightSegment={highlight} onHoverSegment={onHighlight} />

          <div className="map-overlay at-top">
            <div className="progress-route">
              <div className="progress-ends">
                <span>{places.current.name}<small>{shortDate(start)}</small></span>
                <span>{places.dropoff.name}<small>{shortDate(end)}</small></span>
              </div>
              <div className="progress-track"><div className="progress-fill" /></div>
              <div className="progress-meta">
                <span className="num">{Math.round(summary.total_miles).toLocaleString()} mi</span>
                <span>{plan.stops.length} stops</span>
                <span className="num">{summary.driving_hours} h driving</span>
              </div>
            </div>
          </div>

          <div className="map-overlay at-bottom">
            <ul className="legend">
              {LEGEND.map((kind) => (
                <li key={kind}>
                  <span className="legend-pin" style={{ ["--pin" as string]: STOP_STYLE[kind].colour }}>
                    {STOP_STYLE[kind].glyph}
                  </span>
                  {STOP_STYLE[kind].name}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="col">
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Cycle hours</h2>
                <p className="card-sub">Rolling {plan.inputs.cycle_limit_hours} h / {plan.inputs.cycle_limit_hours === 70 ? 8 : 7} day clock</p>
              </div>
            </div>
            <div className="card-body">
              <CycleGauge plan={plan} />
            </div>
          </section>

          <section className="card">
            <div className="card-head has-rule">
              <div>
                <h2 className="card-title">Stops &amp; rests</h2>
                <p className="card-sub">Hover to find one on the map</p>
              </div>
              <button type="button" className="btn" onClick={onOpenRoute}>View all</button>
            </div>
            <div className="scroll-panel" style={{ maxHeight: 268 }}>
              <StopList plan={plan} highlightSegment={highlight} onHoverSegment={onHighlight} />
            </div>
          </section>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Duty status timeline</h2>
            <p className="card-sub">Each day of the trip, midnight to midnight — the same data as the log sheets</p>
          </div>
          <span className="tag is-accent">
            {plan.log_days.length} {plan.log_days.length === 1 ? "day" : "days"}
          </span>
        </div>
        <div className="card-body">
          <DutyTimeline plan={plan} highlightSegment={highlight} onHoverSegment={onHighlight} />
        </div>
      </section>
    </div>
  );
}
