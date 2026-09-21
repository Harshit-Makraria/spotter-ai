import type { TripPlan } from "../types";

const HOUR = (value: number) => `${value.toFixed(value % 1 ? 2 : 0)} h`;

export function SummaryStats({ plan }: { plan: TripPlan }) {
  const { summary, route } = plan;
  const arrival = new Date(summary.end_time);

  const stats = [
    { label: "Distance", value: `${Math.round(summary.total_miles)} mi`, sub: route.provider.split("/")[0] },
    { label: "Driving", value: HOUR(summary.driving_hours), sub: `${HOUR(summary.on_duty_hours)} on duty` },
    { label: "Trip time", value: HOUR(summary.total_elapsed_hours), sub: "door to door" },
    {
      label: "Arrival",
      value: arrival.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      sub: arrival.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    },
    { label: "Log sheets", value: String(summary.log_days), sub: "one per calendar day" },
    {
      label: "Cycle left",
      value: HOUR(summary.cycle_hours_remaining_end),
      sub: `of ${plan.inputs.cycle_limit_hours} h on arrival`,
    },
  ];

  return (
    <div className="stats">
      {stats.map((stat) => (
        <div className="stat" key={stat.label}>
          <span className="stat-label">{stat.label}</span>
          <span className="stat-value">{stat.value}</span>
          <span className="stat-sub">{stat.sub}</span>
        </div>
      ))}
    </div>
  );
}

/** The four HOS clocks as they stand when the driver arrives. */
export function HosClocks({ plan }: { plan: TripPlan }) {
  const { summary, inputs } = plan;
  const clocks = [
    {
      name: "11-hour driving",
      cfr: "395.3(a)(3)",
      used: Math.min(11, summary.driving_hours),
      limit: 11,
      note: "per duty period",
    },
    {
      name: "14-hour window",
      cfr: "395.3(a)(2)",
      used: Math.min(14, summary.driving_hours + summary.on_duty_hours),
      limit: 14,
      note: "per duty period",
    },
    {
      name: "8-hour break clock",
      cfr: "395.3(a)(3)(ii)",
      used: 8,
      limit: 8,
      note: `${summary.rest_breaks + summary.daily_resets} qualifying break(s)`,
    },
    {
      name: `${inputs.cycle_limit_hours}-hour cycle`,
      cfr: "395.3(b)",
      used: summary.cycle_hours_used_end,
      limit: inputs.cycle_limit_hours,
      note: `${summary.cycle_hours_remaining_end} h remaining`,
    },
  ];

  return (
    <div className="clocks">
      {clocks.map((clock) => {
        const pct = Math.min(100, (clock.used / clock.limit) * 100);
        const tone = pct >= 100 ? "full" : pct > 80 ? "warn" : "ok";
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
              <span>
                {clock.used.toFixed(clock.used % 1 ? 2 : 0)} / {clock.limit} h
              </span>
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
    <div className="compliance">
      <div className={`compliance-banner${compliance.feasible ? "" : " is-bad"}`}>
        <span className="compliance-badge">{compliance.feasible ? "✓" : "!"}</span>
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

      <ul className="check-list">
        {compliance.checks.map((check) => (
          <li key={check.rule} className={check.passed ? "is-pass" : "is-fail"}>
            <span className="check-mark">{check.passed ? "✓" : "✕"}</span>
            <div>
              <strong>
                {check.rule} <em>§ {check.cfr}</em>
              </strong>
              <span>{check.detail}</span>
            </div>
          </li>
        ))}
      </ul>

      {compliance.violations.length > 0 && (
        <ul className="violations">
          {compliance.violations.map((violation) => (
            <li key={violation}>{violation}</li>
          ))}
        </ul>
      )}

      {compliance.notes.length > 0 && (
        <ul className="notes">
          {compliance.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
