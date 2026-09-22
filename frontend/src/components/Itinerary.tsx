import type { Segment, TripPlan } from "../types";
import { STOP_STYLE } from "./RouteMap";

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

interface HoverProps {
  highlightSegment: number | null;
  onHoverSegment: (index: number | null) => void;
}

/** Every duty change in order, grouped under sticky day headers. */
export function Itinerary({ plan, highlightSegment, onHoverSegment }: { plan: TripPlan } & HoverProps) {
  const days = new Map<string, Segment[]>();
  for (const segment of plan.segments) {
    const key = new Date(segment.start).toDateString();
    days.set(key, [...(days.get(key) ?? []), segment]);
  }

  return (
    <ol className="itinerary">
      {[...days.values()].map((segments) => {
        const miles = segments.reduce((sum, s) => sum + (s.kind === "drive" ? s.miles : 0), 0);
        return (
          <li key={segments[0].start}>
            <div className="itinerary-day">
              <span>{dayLabel(segments[0].start)}</span>
              <span className="num">{Math.round(miles)} mi</span>
            </div>
            {segments.map((segment) => (
              <Row
                key={segment.index}
                segment={segment}
                active={highlightSegment === segment.index}
                onHover={onHoverSegment}
              />
            ))}
          </li>
        );
      })}
    </ol>
  );
}

function Row({
  segment,
  active,
  onHover,
}: {
  segment: Segment;
  active: boolean;
  onHover: (index: number | null) => void;
}) {
  const style = STOP_STYLE[segment.kind];
  const isDrive = segment.kind === "drive";

  return (
    <div
      className={`itinerary-row${active ? " is-active" : ""}${isDrive ? " is-drive" : ""}`}
      onMouseEnter={() => onHover(segment.index)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="itinerary-time">{clock(segment.start)}</span>
      <span className="itinerary-icon" style={{ ["--pin" as string]: style.colour }}>
        {style.glyph}
      </span>
      <div className="itinerary-body">
        <strong>{isDrive ? `Drive ${Math.round(segment.miles)} mi` : segment.title}</strong>
        <span>
          {segment.location || segment.label}
          {isDrive ? "" : ` · mile ${Math.round(segment.start_mile)}`}
        </span>
      </div>
      <span className={`tag is-mono${isDrive ? "" : " is-accent"}`}>{segment.hours} h</span>
    </div>
  );
}

/** The stops only — pickup, fuel, breaks, rests, drop-off — for the overview. */
export function StopList({ plan, highlightSegment, onHoverSegment }: { plan: TripPlan } & HoverProps) {
  return (
    <ul className="stop-list">
      {plan.stops.map((stop) => {
        const style = STOP_STYLE[stop.kind];
        const when = new Date(stop.start);
        return (
          <li
            key={stop.index}
            className={`stop-row${highlightSegment === stop.index ? " is-active" : ""}`}
            onMouseEnter={() => onHoverSegment(stop.index)}
            onMouseLeave={() => onHoverSegment(null)}
          >
            <span className="stop-icon" style={{ ["--pin" as string]: style.colour }}>
              {style.glyph}
            </span>
            <div style={{ minWidth: 0 }}>
              <strong>{stop.title}</strong>
              <span>{stop.location}</span>
            </div>
            <span className="stop-when">
              {when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              <small>
                {when.toLocaleDateString(undefined, { weekday: "short" })} · {stop.hours} h
              </small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
