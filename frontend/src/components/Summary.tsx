import type { TripPlan } from "../types";
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  CrossIcon,
  RouteIcon,
  ShieldIcon,
  TruckIcon,
} from "./icons";

const hrs = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/** A small bar chart of real per-day figures — never decoration. */
function Spark({ values, tone }: { values: number[]; tone: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const gap = 3;
  const width = 100;
  const bar = (width - gap * (values.length - 1)) / values.length;

  return (
    <svg className="kpi-spark" viewBox={`0 0 ${width} 30`} preserveAspectRatio="none" aria-hidden="true">
      {values.map((value, index) => {
        const height = Math.max(3, (value / max) * 28);
        return (
          <rect
            key={index}
            x={index * (bar + gap)}
            y={30 - height}
            width={bar}
            height={height}
            rx={2}
            fill={tone}
            opacity={0.3 + (value / max) * 0.7}
          />
        );
      })}
    </svg>
  );
}

export function KpiRow({ plan }: { plan: TripPlan }) {
  const { summary, log_days: days } = plan;
  const arrival = new Date(summary.end_time);
  const departure = new Date(summary.start_time);
  const stops = summary.fuel_stops + summary.rest_breaks + summary.daily_resets + summary.restarts;

  return (
    <section className="kpis" aria-label="Trip summary">
      <article className="kpi is-hero">
        <div className="kpi-top">
          <span className="kpi-label">Total distance</span>
          <span className="kpi-icon"><RouteIcon size={17} /></span>
        </div>
        <span className="kpi-value">
          {Math.round(summary.total_miles).toLocaleString()}<small>mi</small>
        </span>
        <span className="kpi-foot">
          <span className="delta">{plan.route.provider.startsWith("openroute") ? "Truck route" : "Road route"}</span>
          {days.length} {days.length === 1 ? "day" : "days"} on the road
        </span>
        <Spark values={days.map((day) => day.miles_driven)} tone="rgba(43,26,2,0.6)" />
      </article>

      <article className="kpi">
        <div className="kpi-top">
          <span className="kpi-label">Driving time</span>
          <span className="kpi-icon"><TruckIcon size={17} /></span>
        </div>
        <span className="kpi-value">{hrs(summary.driving_hours)}<small>h</small></span>
        <span className="kpi-foot">
          <span className="delta is-ok">{hrs(summary.on_duty_hours)} h</span>
          on duty, not driving
        </span>
        <Spark values={days.map((day) => day.totals.driving)} tone="var(--ok)" />
      </article>

      <article className="kpi">
        <div className="kpi-top">
          <span className="kpi-label">Arrival</span>
          <span className="kpi-icon"><CalendarIcon size={17} /></span>
        </div>
        <span className="kpi-value">
          {arrival.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          <small>
            {arrival.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </small>
        </span>
        <span className="kpi-foot">
          <span className="delta is-warn">{hrs(summary.total_elapsed_hours)} h</span>
          door to door from{" "}
          {departure.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
        <Spark values={days.map((day) => day.total_on_duty_hours)} tone="var(--accent)" />
      </article>

      <article className="kpi">
        <div className="kpi-top">
          <span className="kpi-label">Required stops</span>
          <span className="kpi-icon"><ClockIcon size={17} /></span>
        </div>
        <span className="kpi-value">{stops}</span>
        <span className="kpi-foot">
          {summary.fuel_stops} fuel · {summary.rest_breaks} break · {summary.daily_resets} reset
          {summary.restarts ? ` · ${summary.restarts} restart` : ""}
        </span>
      </article>
    </section>
  );
}

/**
 * Recovers the busiest duty period in the plan.
 *
 * Trip totals clamped to each limit would read "11 / 11" on every multi-day
 * trip, which says nothing. What matters is how hard the hardest single duty
 * period pushes each clock, so the schedule is walked to find it.
 */
function peakDutyPeriod(plan: TripPlan) {
  let drivingNow = 0;
  let restRun = 0;
  let windowStart: number | null = null;
  let peakDriving = 0;
  let peakWindow = 0;
  let longestDriveRun = 0;
  let driveSinceBreak = 0;
  let nonDrivingRun = 0;

  for (const segment of plan.segments) {
    const minutes = segment.hours * 60;
    const startedAt = new Date(segment.start).getTime();
    const endedAt = new Date(segment.end).getTime();

    if (segment.status === "driving") {
      if (windowStart === null) windowStart = startedAt;
      drivingNow += segment.hours;
      driveSinceBreak += segment.hours;
      restRun = 0;
      nonDrivingRun = 0;
      peakDriving = Math.max(peakDriving, drivingNow);
      longestDriveRun = Math.max(longestDriveRun, driveSinceBreak);
      peakWindow = Math.max(peakWindow, (endedAt - windowStart) / 3_600_000);
      continue;
    }

    if (segment.status === "on_duty" && windowStart === null) windowStart = startedAt;

    nonDrivingRun += minutes;
    if (nonDrivingRun >= 30) driveSinceBreak = 0;

    if (segment.status === "off_duty" || segment.status === "sleeper_berth") {
      restRun += minutes;
      if (restRun >= 600) {
        // A qualifying 10-hour rest closes the duty period.
        drivingNow = 0;
        windowStart = null;
        restRun = 0;
      }
    } else {
      restRun = 0;
    }
  }

  return { peakDriving, peakWindow, longestDriveRun };
}

export function HosClocks({ plan }: { plan: TripPlan }) {
  const { summary, inputs } = plan;
  const { peakDriving, peakWindow, longestDriveRun } = peakDutyPeriod(plan);

  const clocks = [
    { name: "11-hour driving limit", cfr: "395.3(a)(3)", used: Math.min(11, peakDriving), limit: 11,
      note: "busiest duty period" },
    { name: "14-hour duty window", cfr: "395.3(a)(2)", used: Math.min(14, peakWindow), limit: 14,
      note: "busiest duty period" },
    { name: "Driving before a 30-min break", cfr: "395.3(a)(3)(ii)", used: Math.min(8, longestDriveRun),
      limit: 8, note: "longest stretch" },
    { name: `${inputs.cycle_limit_hours}-hour cycle`, cfr: "395.3(b)", used: summary.cycle_hours_used_end,
      limit: inputs.cycle_limit_hours, note: `${hrs(summary.cycle_hours_remaining_end)} h left on arrival` },
  ];

  return (
    <div className="clocks">
      {clocks.map((clock) => {
        const pct = Math.min(100, (clock.used / clock.limit) * 100);
        // Running up to a limit is what an efficient plan looks like, so amber
        // means "at the legal maximum". Red is kept for an actual violation.
        const tone = !plan.compliance.feasible ? "full" : pct > 80 ? "warn" : "ok";
        return (
          <div className="clock" key={clock.name}>
            <div className="clock-head">
              <span className="clock-name">{clock.name}</span>
              <span className="clock-cfr">§ {clock.cfr}</span>
            </div>
            <div className={`clock-track is-${tone}`}>
              <div className="clock-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="clock-foot">
              <span>{hrs(clock.used)} / {clock.limit} h</span>
              <span className="clock-note">{clock.note}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ComplianceBanner({ plan }: { plan: TripPlan }) {
  const ok = plan.compliance.feasible;
  return (
    <div className={`banner${ok ? "" : " is-bad"}`}>
      <span className="banner-badge">{ok ? <CheckIcon size={18} /> : <CrossIcon size={18} />}</span>
      <div>
        <strong>{ok ? "This plan is HOS compliant" : "This plan violates hours of service"}</strong>
        <span>
          {ok
            ? "After planning, every clock was re-derived from the finished schedule and checked again."
            : "The independent audit found the problems listed below."}
        </span>
      </div>
    </div>
  );
}

export function ComplianceChecks({ plan }: { plan: TripPlan }) {
  return (
    <ul className="checks">
      {plan.compliance.checks.map((check) => (
        <li key={check.rule} className={`check ${check.passed ? "is-pass" : "is-fail"}`}>
          <span className="check-mark">
            {check.passed ? <CheckIcon size={12} /> : <CrossIcon size={12} />}
          </span>
          <div>
            <strong>{check.rule}</strong>
            <p>{check.detail}</p>
          </div>
          <span className="cfr">§ {check.cfr}</span>
        </li>
      ))}
    </ul>
  );
}

/** The assumptions the plan was built on, stated so a reviewer can check them. */
export function TripFacts({ plan }: { plan: TripPlan }) {
  const { inputs } = plan;
  const facts: [string, string][] = [
    ["Driver type", "Property-carrying CMV"],
    ["Cycle rule", `${inputs.cycle_limit_hours} hours / ${inputs.cycle_limit_hours === 70 ? 8 : 7} days`],
    ["Hours used before departure", `${inputs.cycle_hours_used} h`],
    ["Driving conditions", "Normal — no adverse-conditions extension"],
    ["Pickup and drop-off", "1 hour each, on duty"],
    ["Fuel", "At least every 1,000 miles · 30 min on duty"],
    ["Average speed", `${inputs.avg_speed_mph} mph`],
    ["Pre/post-trip inspections", inputs.include_inspections ? "15 min each" : "Not added"],
    ["Daily rest", "10 hours in the sleeper berth"],
    ["Log time base", "Home-terminal time, midnight to midnight"],
  ];
  return (
    <ul className="facts">
      {facts.map(([label, value]) => (
        <li className="fact" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </li>
      ))}
    </ul>
  );
}

export function ComplianceTag({ plan }: { plan: TripPlan }) {
  const ok = plan.compliance.feasible;
  return (
    <span className={`tag ${ok ? "is-ok" : "is-bad"}`}>
      <ShieldIcon size={12} />
      {ok ? "HOS compliant" : "Violation"}
    </span>
  );
}
