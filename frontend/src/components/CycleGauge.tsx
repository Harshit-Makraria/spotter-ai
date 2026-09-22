import type { TripPlan } from "../types";

/**
 * The rolling cycle as a segmented semicircle: how much of the 70 (or 60)
 * hours the driver has used by the time they arrive.
 */

const TICKS = 36;
const RADIUS = 92;
const CENTRE_X = 120;
const CENTRE_Y = 112;

export function CycleGauge({ plan }: { plan: TripPlan }) {
  const { summary, inputs } = plan;
  const limit = inputs.cycle_limit_hours;
  const used = Math.min(limit, summary.cycle_hours_used_end);
  const share = used / limit;
  const lit = Math.round(share * TICKS);

  // Amber once the driver is into the last fifth of the cycle, red when out.
  const tone = share >= 1 ? "var(--bad)" : share > 0.8 ? "var(--warn)" : "var(--ok)";

  return (
    <div className="gauge">
      <div className="gauge-dial">
      <svg viewBox="0 0 240 124" role="img" aria-label={`${Math.round(share * 100)} percent of the cycle used`}>
        {Array.from({ length: TICKS }).map((_, index) => {
          // Spread the ticks across a half circle, left to right.
          const angle = Math.PI - (index / (TICKS - 1)) * Math.PI;
          const inner = RADIUS - 16;
          const x1 = CENTRE_X + Math.cos(angle) * inner;
          const y1 = CENTRE_Y - Math.sin(angle) * inner;
          const x2 = CENTRE_X + Math.cos(angle) * RADIUS;
          const y2 = CENTRE_Y - Math.sin(angle) * RADIUS;
          return (
            <line
              key={index}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={index < lit ? tone : "var(--surface-3)"}
              strokeWidth={5}
              strokeLinecap="round"
              className="gauge-tick"
              style={{ transitionDelay: `${index * 12}ms` }}
            />
          );
        })}
      </svg>
      <div className="gauge-value">{Math.round(share * 100)}%</div>
      </div>
      <p className="gauge-caption">of the {limit}-hour cycle used on arrival</p>

      <div className="gauge-legend">
        <div>
          <strong>{summary.cycle_hours_used_start}</strong>
          <span>h at departure</span>
        </div>
        <div style={{ textAlign: "center" }}>
          <strong>{summary.cycle_hours_used_end}</strong>
          <span>h on arrival</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <strong style={{ color: tone }}>{summary.cycle_hours_remaining_end}</strong>
          <span>h left</span>
        </div>
      </div>
    </div>
  );
}
