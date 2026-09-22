import { useState } from "react";
import type { TripRequest } from "../types";
import { ChevronIcon, FlagIcon, MapPinIcon, RouteIcon, SparkIcon, TruckIcon } from "./icons";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * The next 06:00, which is when a long-haul driver typically starts.
 *
 * Examples used to depart "now", so clicking one in the evening produced a
 * first log sheet that was 21 hours off duty and a sheet count that no longer
 * matched the card's description. A fixed early start keeps them honest.
 */
export function nextMorning(now = new Date()): string {
  const departure = new Date(now);
  departure.setHours(6, 0, 0, 0);
  if (departure <= now) departure.setDate(departure.getDate() + 1);
  return toLocalInput(departure);
}

export function blankTrip(): TripRequest {
  return {
    current_location: "",
    pickup_location: "",
    dropoff_location: "",
    cycle_hours_used: 0,
    start_time: nextMorning(),
    avg_speed_mph: 55,
    cycle_limit_hours: 70,
    include_inspections: false,
  };
}

/** Ready-made trips so a reviewer never has to type to see the app work. */
export const EXAMPLES: {
  name: string;
  route: string;
  tags: string[];
  request: Omit<TripRequest, "start_time">;
}[] = [
  {
    name: "Short haul",
    route: "Fort Worth → Dallas → Houston",
    tags: ["~275 mi", "1 log sheet"],
    request: {
      current_location: "Fort Worth, TX",
      pickup_location: "Dallas, TX",
      dropoff_location: "Houston, TX",
      cycle_hours_used: 8,
    },
  },
  {
    name: "Overnight",
    route: "Dallas → Oklahoma City → Chicago",
    tags: ["1,000 mi", "10-hour reset"],
    request: {
      current_location: "Dallas, TX",
      pickup_location: "Oklahoma City, OK",
      dropoff_location: "Chicago, IL",
      cycle_hours_used: 12,
    },
  },
  {
    name: "Coast to coast",
    route: "Los Angeles → Phoenix → New York",
    tags: ["2,800 mi", "fuel stops", "5 sheets"],
    request: {
      current_location: "Los Angeles, CA",
      pickup_location: "Phoenix, AZ",
      dropoff_location: "New York, NY",
      cycle_hours_used: 5,
    },
  },
  {
    name: "Cycle exhausted",
    route: "Denver → Salt Lake City → Seattle",
    tags: ["69 h used", "34-hour restart"],
    request: {
      current_location: "Denver, CO",
      pickup_location: "Salt Lake City, UT",
      dropoff_location: "Seattle, WA",
      cycle_hours_used: 69,
    },
  },
];

export function ExampleTrips({
  onPick,
  loading,
}: {
  onPick: (request: TripRequest) => void;
  loading: boolean;
}) {
  return (
    <div className="examples">
      {EXAMPLES.map((example) => (
        <button
          key={example.name}
          type="button"
          className="example"
          disabled={loading}
          onClick={() => onPick({ ...blankTrip(), ...example.request })}
        >
          <div className="example-top">
            <span className="example-icon"><RouteIcon size={17} /></span>
            <span className="tag is-mono">{example.request.cycle_hours_used} h used</span>
          </div>
          <div>
            <strong>{example.name}</strong>
            <div className="example-route">{example.route}</div>
          </div>
          <div className="example-tags">
            {example.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
          </div>
        </button>
      ))}
    </div>
  );
}

interface Props {
  draft: TripRequest;
  onChange: (draft: TripRequest) => void;
  onSubmit: (request: TripRequest) => void;
  loading: boolean;
}

export function TripForm({ draft, onChange, onSubmit, loading }: Props) {
  const [showAssumptions, setShowAssumptions] = useState(false);

  const update = <K extends keyof TripRequest>(key: K, value: TripRequest[K]) =>
    onChange({ ...draft, [key]: value });

  const limit = draft.cycle_limit_hours ?? 70;
  const remaining = Math.max(0, limit - draft.cycle_hours_used);
  const fill = `${(draft.cycle_hours_used / limit) * 100}%`;

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft);
      }}
    >
      <div className="stops-input">
        <Location
          id="current" label="Current location" hint="Where the driver is now"
          value={draft.current_location} placeholder="e.g. Fort Worth, TX"
          icon={<TruckIcon size={15} />} onChange={(v) => update("current_location", v)}
        />
        <Location
          id="pickup" label="Pickup location" hint="1 hour on duty to load"
          value={draft.pickup_location} placeholder="e.g. Dallas, TX"
          icon={<MapPinIcon size={15} />} onChange={(v) => update("pickup_location", v)}
        />
        <Location
          id="dropoff" label="Drop-off location" hint="1 hour on duty to unload"
          value={draft.dropoff_location} placeholder="e.g. Houston, TX"
          icon={<FlagIcon size={15} />} onChange={(v) => update("dropoff_location", v)}
        />
      </div>

      <div className="field">
        <div className="field-label">
          <label htmlFor="cycle">Current cycle used</label>
          <span className="field-hint">On-duty hours in the last {limit === 70 ? 8 : 7} days</span>
        </div>
        <div className="slider-row">
          <input
            id="cycle"
            type="range"
            min={0}
            max={limit}
            step={0.5}
            value={draft.cycle_hours_used}
            style={{ ["--fill" as string]: fill }}
            onChange={(event) => update("cycle_hours_used", Number(event.target.value))}
          />
          <output className="slider-out" htmlFor="cycle">
            <strong>{draft.cycle_hours_used} h</strong>
            <span>{remaining} h left</span>
          </output>
        </div>
      </div>

      <button
        type="button"
        className="disclosure"
        onClick={() => setShowAssumptions((open) => !open)}
        aria-expanded={showAssumptions}
      >
        Planning assumptions
        <ChevronIcon size={13} />
      </button>

      {showAssumptions && (
        <div className="assumptions">
          <div className="field">
            <div className="field-label"><label htmlFor="start">Departure</label></div>
            <input
              id="start"
              type="datetime-local"
              value={draft.start_time}
              onChange={(event) => update("start_time", event.target.value)}
            />
          </div>
          <div className="field">
            <div className="field-label"><label htmlFor="cycle-limit">Cycle rule</label></div>
            <select
              id="cycle-limit"
              value={limit}
              onChange={(event) => {
                const next = Number(event.target.value);
                onChange({
                  ...draft,
                  cycle_limit_hours: next,
                  cycle_hours_used: Math.min(draft.cycle_hours_used, next),
                });
              }}
            >
              <option value={70}>70 hours / 8 days</option>
              <option value={60}>60 hours / 7 days</option>
            </select>
          </div>
          <div className="field is-wide">
            <div className="field-label">
              <label htmlFor="speed">Average speed</label>
              <span className="field-hint">Converts route miles into drive time</span>
            </div>
            <div className="slider-row">
              <input
                id="speed"
                type="range"
                min={35}
                max={70}
                step={1}
                value={draft.avg_speed_mph}
                style={{ ["--fill" as string]: `${(((draft.avg_speed_mph ?? 55) - 35) / 35) * 100}%` }}
                onChange={(event) => update("avg_speed_mph", Number(event.target.value))}
              />
              <output className="slider-out" htmlFor="speed">
                <strong>{draft.avg_speed_mph} mph</strong>
              </output>
            </div>
          </div>
          <label className="check-row field is-wide">
            <input
              type="checkbox"
              checked={Boolean(draft.include_inspections)}
              onChange={(event) => update("include_inspections", event.target.checked)}
            />
            <span>
              Add pre- and post-trip inspections
              <em>15 minutes each, on duty. Off by default so the plan matches the brief exactly.</em>
            </span>
          </label>
        </div>
      )}

      <button type="submit" className="submit" disabled={loading}>
        {loading ? (
          <><SparkIcon size={16} className="spin" /> Planning route…</>
        ) : (
          <><TruckIcon size={16} /> Plan trip &amp; draw logs</>
        )}
      </button>
    </form>
  );
}

function Location({
  id,
  label,
  hint,
  value,
  placeholder,
  icon,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  icon: React.ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        <span className="field-hint">{hint}</span>
      </div>
      <div className="input-wrap">
        <span className="input-icon">{icon}</span>
        <input
          id={id}
          className="input"
          type="text"
          required
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}
