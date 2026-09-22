import { useEffect, useState } from "react";
import { PrintIcon } from "../components/icons";
import { LogSheet } from "../components/LogSheet";
import type { DutyStatus, TripPlan } from "../types";
import { TripHeader } from "./TripHeader";

interface Props {
  plan: TripPlan;
  highlight: number | null;
  onHighlight: (index: number | null) => void;
}

const BAR: { status: DutyStatus; colour: string }[] = [
  { status: "driving", colour: "var(--ok)" },
  { status: "on_duty", colour: "var(--accent)" },
  { status: "sleeper_berth", colour: "var(--violet)" },
  { status: "off_duty", colour: "color-mix(in srgb, var(--text-3) 35%, transparent)" },
];

export function LogsView({ plan, highlight, onHighlight }: Props) {
  const [selected, setSelected] = useState(0);

  // A new trip may have fewer days than the one before it.
  useEffect(() => setSelected(0), [plan.share_id]);

  return (
    <div className="view">
      <TripHeader
        plan={plan}
        title="Daily log sheets"
        actions={
          <button type="button" className="btn is-dark" onClick={() => window.print()}>
            <PrintIcon size={15} />
            Print all {plan.log_days.length} sheets
          </button>
        }
      />

      <div className="day-strip" role="tablist" aria-label="Log sheet for each day">
        {plan.log_days.map((day, index) => {
          const date = new Date(`${day.date}T00:00:00`);
          return (
            <button
              key={day.date}
              type="button"
              role="tab"
              aria-selected={selected === index}
              className={`day-card${selected === index ? " is-active" : ""}`}
              onClick={() => setSelected(index)}
            >
              <div className="day-card-top">
                <span className="day-card-n">Sheet {index + 1}</span>
                <span className={`tag ${day.balanced ? "is-ok" : "is-bad"}`}>
                  {day.balanced ? "= 24 h" : "≠ 24 h"}
                </span>
              </div>
              <strong>
                {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </strong>
              <div className="day-card-bar" aria-hidden="true">
                {BAR.map(({ status, colour }) => (
                  <i
                    key={status}
                    style={{ width: `${(day.totals[status] / 24) * 100}%`, background: colour }}
                  />
                ))}
              </div>
              <div className="day-card-meta">
                <span>{day.miles_driven.toFixed(0)} mi</span>
                <span>{day.total_on_duty_hours} h on duty</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Every sheet stays in the page so printing produces the full set. */}
      {plan.log_days.map((day, index) => (
        <article
          key={day.date}
          className={`card sheet-card${selected === index ? "" : " is-hidden"}`}
        >
          <div className="card-head has-rule">
            <div>
              <h2 className="card-title">
                {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: "long", month: "long", day: "numeric", year: "numeric",
                })}
              </h2>
              <p className="card-sub">
                Sheet {index + 1} of {plan.log_days.length} · {day.miles_driven.toFixed(0)} miles
                driving · {day.total_on_duty_hours} h on duty · {day.cycle_hours_remaining} h
                available tomorrow
              </p>
            </div>
            <span className={`tag ${day.balanced ? "is-ok" : "is-bad"}`}>
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
              onHoverSegment={onHighlight}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
