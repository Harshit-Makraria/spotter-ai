import type { DutyStatus, TripPlan } from "../types";

/**
 * The whole trip as one Gantt: a row per calendar day, each block a duty
 * status. It is the same data as the log sheets, read at a glance — you can
 * see the shape of the schedule, where the rests fall, and how the days chain.
 */

const MINUTES = 24 * 60;

const STATUS_NAME: Record<DutyStatus, string> = {
  off_duty: "Off duty",
  sleeper_berth: "Sleeper berth",
  driving: "Driving",
  on_duty: "On duty (not driving)",
};

const KEY_ORDER: DutyStatus[] = ["driving", "on_duty", "sleeper_berth", "off_duty"];

const HOUR_MARKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

function clock(minute: number): string {
  const m = Math.min(minute, MINUTES - 1);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

interface Props {
  plan: TripPlan;
  highlightSegment: number | null;
  onHoverSegment: (index: number | null) => void;
}

export function DutyTimeline({ plan, highlightSegment, onHoverSegment }: Props) {
  return (
    <div className="timeline">
      <div className="timeline-scale">
        <span className="section-label">Day</span>
        <div className="timeline-hours">
          {HOUR_MARKS.map((hour) => (
            <span
              key={hour}
              className="timeline-hour"
              style={{ left: `${(hour / 24) * 100}%` }}
            >
              {hour === 24 ? "24" : String(hour).padStart(2, "0")}
            </span>
          ))}
        </div>
      </div>

      {plan.log_days.map((day) => {
        const date = new Date(`${day.date}T00:00:00`);
        return (
          <div className="timeline-row" key={day.date}>
            <div className="timeline-day">
              <strong>
                {date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              </strong>
              <span>{day.miles_driven.toFixed(0)} mi</span>
            </div>

            <div className="timeline-track">
              <div className="timeline-grid" />
              {day.entries.map((entry, index) => {
                const left = (entry.start_minute / MINUTES) * 100;
                const width = ((entry.end_minute - entry.start_minute) / MINUTES) * 100;
                const active =
                  highlightSegment != null && entry.segment_index === highlightSegment;
                return (
                  <div
                    key={`${day.date}-${index}`}
                    className={`timeline-block s-${entry.status}${active ? " is-active" : ""}`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 0.25)}%` }}
                    onMouseEnter={() => onHoverSegment(entry.segment_index)}
                    onMouseLeave={() => onHoverSegment(null)}
                    title={`${STATUS_NAME[entry.status]} · ${clock(
                      entry.start_minute,
                    )}–${clock(entry.end_minute)}${
                      entry.location ? ` · ${entry.location}` : ""
                    }`}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      <ul className="timeline-key">
        {KEY_ORDER.map((status) => (
          <li key={status}>
            <i className={`timeline-block s-${status}`} style={{ position: "static" }} />
            {STATUS_NAME[status]}
          </li>
        ))}
      </ul>
    </div>
  );
}
