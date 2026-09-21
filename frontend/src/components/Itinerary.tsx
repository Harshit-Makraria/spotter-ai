import type { Segment, TripPlan } from "../types";
import { STOP_STYLE } from "./RouteMap";

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface Props {
  plan: TripPlan;
  highlightSegment: number | null;
  onHoverSegment: (index: number | null) => void;
}

export function Itinerary({ plan, highlightSegment, onHoverSegment }: Props) {
  let currentDay = "";

  return (
    <ol className="itinerary">
      {plan.segments.map((segment) => {
        const day = new Date(segment.start).toDateString();
        const newDay = day !== currentDay;
        currentDay = day;

        return (
          <li key={segment.index}>
            {newDay && <div className="itinerary-day">{dayLabel(segment.start)}</div>}
            <Row
              segment={segment}
              active={highlightSegment === segment.index}
              onHover={onHoverSegment}
            />
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
        <strong>
          {isDrive ? `Drive ${Math.round(segment.miles)} mi` : segment.title}
        </strong>
        <span>
          {segment.location || segment.label}
          {isDrive ? "" : ` · mile ${Math.round(segment.start_mile)}`}
        </span>
      </div>
      <span className={`chip${isDrive ? "" : " is-accent"}`}>{segment.hours} h</span>
    </div>
  );
}
