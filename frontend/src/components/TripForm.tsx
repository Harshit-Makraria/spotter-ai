import { useState } from "react";
import type { TripRequest } from "../types";

/** Ready-made trips so a reviewer never has to type to see the app work. */
export const EXAMPLES: { name: string; blurb: string; request: TripRequest }[] = [
  {
    name: "Short haul",
    blurb: "Dallas → Houston · 1 log sheet",
    request: {
      current_location: "Fort Worth, TX",
      pickup_location: "Dallas, TX",
      dropoff_location: "Houston, TX",
      cycle_hours_used: 8,
    },
  },
  {
    name: "Overnight",
    blurb: "Dallas → Chicago · 2 sheets, 10-hour reset",
    request: {
      current_location: "Dallas, TX",
      pickup_location: "Oklahoma City, OK",
      dropoff_location: "Chicago, IL",
      cycle_hours_used: 12,
    },
  },
  {
    name: "Coast to coast",
    blurb: "LA → New York · 5+ sheets, fuel stops",
    request: {
      current_location: "Los Angeles, CA",
      pickup_location: "Phoenix, AZ",
      dropoff_location: "New York, NY",
      cycle_hours_used: 5,
    },
  },
  {
    name: "Cycle exhausted",
    blurb: "69 h used · forces a 34-hour restart",
    request: {
      current_location: "Denver, CO",
      pickup_location: "Salt Lake City, UT",
      dropoff_location: "Seattle, WA",
      cycle_hours_used: 69,
    },
  },
];

function localDateTimeValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:00`;
}

interface Props {
  onSubmit: (request: TripRequest) => void;
  loading: boolean;
}

export function TripForm({ onSubmit, loading }: Props) {
  const [form, setForm] = useState<TripRequest>({
    current_location: "",
    pickup_location: "",
    dropoff_location: "",
    cycle_hours_used: 0,
    start_time: localDateTimeValue(),
    avg_speed_mph: 55,
    cycle_limit_hours: 70,
    include_inspections: false,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = <K extends keyof TripRequest>(key: K, value: TripRequest[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const applyExample = (request: TripRequest) => {
    const next = { ...form, ...request, start_time: localDateTimeValue() };
    setForm(next);
    onSubmit(next);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(form);
  };

  const cycleRemaining = (form.cycle_limit_hours ?? 70) - form.cycle_hours_used;

  return (
    <form className="trip-form" onSubmit={handleSubmit}>
      <div className="examples">
        <span className="examples-label">Try one</span>
        <div className="examples-grid">
          {EXAMPLES.map((example) => (
            <button
              key={example.name}
              type="button"
              className="example-chip"
              onClick={() => applyExample(example.request)}
              disabled={loading}
            >
              <strong>{example.name}</strong>
              <span>{example.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <Field
        id="current"
        label="Current location"
        hint="Where the driver is right now"
        value={form.current_location}
        onChange={(value) => update("current_location", value)}
        placeholder="Fort Worth, TX"
      />
      <Field
        id="pickup"
        label="Pickup location"
        value={form.pickup_location}
        onChange={(value) => update("pickup_location", value)}
        placeholder="Dallas, TX"
      />
      <Field
        id="dropoff"
        label="Drop-off location"
        value={form.dropoff_location}
        onChange={(value) => update("dropoff_location", value)}
        placeholder="Houston, TX"
      />

      <div className="field">
        <label htmlFor="cycle">
          Current cycle used
          <span className="field-hint">
            On-duty hours already in the {form.cycle_limit_hours}-hour cycle
          </span>
        </label>
        <div className="slider-row">
          <input
            id="cycle"
            type="range"
            min={0}
            max={form.cycle_limit_hours}
            step={0.5}
            value={form.cycle_hours_used}
            onChange={(event) =>
              update("cycle_hours_used", Number(event.target.value))
            }
          />
          <output className="slider-value">
            {form.cycle_hours_used} h
            <span>{cycleRemaining} h left</span>
          </output>
        </div>
      </div>

      <button
        type="button"
        className="advanced-toggle"
        onClick={() => setShowAdvanced((open) => !open)}
        aria-expanded={showAdvanced}
      >
        {showAdvanced ? "Hide" : "Show"} planning assumptions
      </button>

      {showAdvanced && (
        <div className="advanced">
          <div className="field">
            <label htmlFor="start">Departure</label>
            <input
              id="start"
              type="datetime-local"
              value={form.start_time}
              onChange={(event) => update("start_time", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="speed">
              Average speed
              <span className="field-hint">Used to convert miles to drive time</span>
            </label>
            <div className="slider-row">
              <input
                id="speed"
                type="range"
                min={35}
                max={70}
                step={1}
                value={form.avg_speed_mph}
                onChange={(event) =>
                  update("avg_speed_mph", Number(event.target.value))
                }
              />
              <output className="slider-value">{form.avg_speed_mph} mph</output>
            </div>
          </div>
          <div className="field">
            <label htmlFor="cycle-limit">Cycle rule</label>
            <select
              id="cycle-limit"
              value={form.cycle_limit_hours}
              onChange={(event) =>
                update("cycle_limit_hours", Number(event.target.value))
              }
            >
              <option value={70}>70 hours / 8 days</option>
              <option value={60}>60 hours / 7 days</option>
            </select>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.include_inspections}
              onChange={(event) =>
                update("include_inspections", event.target.checked)
              }
            />
            <span>
              Add pre/post-trip inspections
              <em>15 min each, on duty — off by default to match the brief</em>
            </span>
          </label>
        </div>
      )}

      <button type="submit" className="submit" disabled={loading}>
        {loading ? "Planning route…" : "Plan trip & draw logs"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </label>
      <input
        id={id}
        type="text"
        required
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
