import type { TripPlan } from "../types";
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  CrossIcon,
  GaugeIcon,
  RouteIcon,
  ShieldIcon,
  TruckIcon,
} from "./icons";

const hrs = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/** A tiny bar chart drawn from real per-day figures, not decoration. */
function Spark({ values, tone = "currentColor" }: { values: number[]; tone?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const gap = 2;
  const width = 100;
  const barWidth = (width - gap * (values.length - 1)) / values.length;

  return (
    <svg className="kpi-spark" viewBox={`0 0 ${width} 26`} preserveAspectRatio="none">
      {values.map((value, index) => {
        const height = Math.max(2, (value / max) * 24);
        return (
          <rect
            key={index}
            x={index * (barWidth + gap)}
            y={26 - height}
            width={barWidth}
            height={height}
            rx={1.6}
            fill={tone}
            opacity={0.25 + (value / max) * 0.75}
          />
        );
      })}
    </svg>
  );
}

export function KpiRow({ plan }: { plan: TripPlan }) {
  const { summary, log_days: days, inputs } = plan;
  const arrival = new Date(summary.end_time);

  const milesPerDay = days.map((day) => day.miles_driven);
  const drivingPerDay = days.map((day) => day.totals.driving);
  const onDutyPerDay = days.map((day) => day.total_on_duty_hours);
  const cyclePerDay = days.map((day) => day.cycle_hours_used);

  const cycleUsedPct = Math.round(
    (summary.cycle_hours_used_end / inputs.cycle_limit_hours) * 100,
  );

  return (
    <section className="kpis" aria-label="Trip summary">
      <article className="kpi is-hero">
        <div className="kpi-top">
          <span className="kpi-label">Distance</span>
          <span className="kpi-icon"><RouteIcon size={17} /></span>
        </div>
        <span className="kpi-value">
          {Math.round(summary.total_miles).toLocaleString()}<small>mi</small>
        </span>
        <span className="kpi-sub">{plan.route.provider.split("/")[0]} routing</span>
        <Spark values={milesPerDay} tone="rgba(43,26,2,0.55)" />
      </article>

      <article className="kpi">
        <div className="kpi-top">
          <span className="kpi-label">Driving</span>
          <span className="kpi-icon"><TruckIcon size={17} /></span>
        </div>
        <span className="kpi-value">{hrs(summary.driving_hours)}<small>h</small></span>
        <span className="kpi-sub">{hrs(summary.on_duty_hours)} h on duty</span>
        <Spark values={drivingPerDay} tone="var(--ok)" />
      </article>

      <article className="kpi">
        <div className="kpi-top">
          <span className="kpi-label">Trip time</span>
          <span className="kpi-icon"><ClockIcon size={17} /></span>
        </div>
        <span className="kpi-value">{hrs(summary.total_elapsed_hours)}<small>h</small></span>
        <span className="kpi-sub">door to door</span>
        <Spark values={onDutyPerDay} tone="var(--accent)" />
      </article>

      <article className="kpi">
        <div className="kpi-top">
          <span className="kpi-label">Arrival</span>
          <span className="kpi-icon"><CalendarIcon size={17} /></span>
        </div>
        <span className="kpi-value" style={{ fontSize: "1.28rem" }}>
          {arrival.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
        <span className="kpi-sub">
          {arrival.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          {" · "}
          {summary.log_days} log sheet{summary.log_days === 1 ? "" : "s"}
        </span>
      </article>

      <article className="kpi is-ink">
        <div className="kpi-top">
          <span className="kpi-label">Cycle used</span>
          <span className={`delta ${cycleUsedPct > 85 ? "is-down" : "is-up"}`}>
            {cycleUsedPct}%
          </span>
        </div>
        <span className="kpi-value">
          {hrs(summary.cycle_hours_remaining_end)}<small>h left</small>
        </span>
        <span className="kpi-sub">of {inputs.cycle_limit_hours} h on arrival</span>
        <Spark values={cyclePerDay} tone="rgba(242,245,251,0.55)" />
      </article>

      <article className="kpi">
        <div className="kpi-top">
          <span className="kpi-label">Required stops</span>
          <span className="kpi-icon"><GaugeIcon size={17} /></span>
        </div>
        <span className="kpi-value">
          {summary.fuel_stops + summary.rest_breaks + summary.daily_resets + summary.restarts}
        </span>
        <span className="kpi-sub">
          {summary.fuel_stops} fuel · {summary.rest_breaks} break ·{" "}
          {summary.daily_resets} reset
          {summary.restarts ? ` · ${summary.restarts} restart` : ""}
        </span>
      </article>
    </section>
  );
}

/**
 * Recovers the busiest duty period in the plan.
 *
 * Trip totals clamped to the limit would read "11 / 11" on every multi-day
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
    {
      name: "11-hour driving",
      cfr: "395.3(a)(3)",
      used: Math.min(11, peakDriving),
      limit: 11,
      note: "busiest duty period",
    },
    {
      name: "14-hour window",
      cfr: "395.3(a)(2)",
      used: Math.min(14, peakWindow),
      limit: 14,
      note: "busiest duty period",
    },
    {
      name: "8-hour break clock",
      cfr: "395.3(a)(3)(ii)",
      used: Math.min(8, longestDriveRun),
      limit: 8,
      note: `${summary.rest_breaks + summary.daily_resets} qualifying break(s)`,
    },
    {
      name: `${inputs.cycle_limit_hours}-hour cycle`,
      cfr: "395.3(b)",
      used: summary.cycle_hours_used_end,
      limit: inputs.cycle_limit_hours,
      note: `${hrs(summary.cycle_hours_remaining_end)} h remaining`,
    },
  ];

  return (
    <div className="clocks">
      {clocks.map((clock) => {
        const pct = Math.min(100, (clock.used / clock.limit) * 100);
        // Running right up to a limit is what an efficient plan looks like, so
        // amber means "at the legal maximum". Red is reserved for an actual
        // violation, which the audit would have caught.
        const tone = !plan.compliance.feasible
          ? "full"
          : pct > 80
            ? "warn"
            : "ok";
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

export function CompliancePanel({ plan }: { plan: TripPlan }) {
  const { compliance } = plan;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className={`banner${compliance.feasible ? "" : " is-bad"}`}>
        <span className="banner-badge">
          {compliance.feasible ? <CheckIcon size={14} /> : <CrossIcon size={14} />}
        </span>
        <div>
          <strong>
            {compliance.feasible
              ? "Plan is HOS compliant"
              : "Plan violates hours of service"}
          </strong>
          <span>
            {compliance.feasible
              ? "Every rule below was re-checked against the finished schedule."
              : "Adjust the inputs — details below."}
          </span>
        </div>
      </div>

      <ul className="checks">
        {compliance.checks.map((check) => (
          <li key={check.rule} className={`check ${check.passed ? "is-pass" : "is-fail"}`}>
            <span className="check-mark">
              {check.passed ? <CheckIcon size={11} /> : <CrossIcon size={11} />}
            </span>
            <div>
              <strong>
                {check.rule}<em>§ {check.cfr}</em>
              </strong>
              <p>{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      {compliance.violations.length > 0 && (
        <ul className="note-list is-bad">
          {compliance.violations.map((violation) => <li key={violation}>{violation}</li>)}
        </ul>
      )}

      {compliance.notes.length > 0 && (
        <ul className="note-list">
          {compliance.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}
    </div>
  );
}

export function ComplianceBadge({ plan }: { plan: TripPlan }) {
  const ok = plan.compliance.feasible;
  return (
    <span
      className={`chip ${ok ? "is-ok" : "is-bad"}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
    >
      <ShieldIcon size={11} />
      {ok ? "Compliant" : "Violation"}
    </span>
  );
}
