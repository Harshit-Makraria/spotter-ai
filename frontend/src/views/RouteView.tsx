import { Directions } from "../components/Directions";
import { Itinerary } from "../components/Itinerary";
import { RouteMap } from "../components/RouteMap";
import type { TripPlan } from "../types";
import { TripHeader } from "./TripHeader";

interface Props {
  plan: TripPlan;
  highlight: number | null;
  onHighlight: (index: number | null) => void;
}

export function RouteView({ plan, highlight, onHighlight }: Props) {
  const directions = plan.route.directions ?? [];
  const provider = plan.route.provider.startsWith("openroute")
    ? "OpenRouteService · heavy-goods-vehicle profile"
    : "OSRM · road network";

  return (
    <div className="view">
      <TripHeader plan={plan} title="Route & stops" />

      <div className="grid-main">
        <section className="card map-card">
          <RouteMap plan={plan} highlightSegment={highlight} onHoverSegment={onHighlight} tall />
        </section>

        <section className="card">
          <div className="card-head has-rule">
            <div>
              <h2 className="card-title">Itinerary</h2>
              <p className="card-sub">Every change of duty status, in order</p>
            </div>
            <span className="tag">{plan.segments.length} entries</span>
          </div>
          <div className="scroll-panel" style={{ maxHeight: 578 }}>
            <Itinerary plan={plan} highlightSegment={highlight} onHoverSegment={onHighlight} />
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head has-rule">
          <div>
            <h2 className="card-title">Turn-by-turn directions</h2>
            <p className="card-sub">{provider} · consecutive steps on the same road merged into one line</p>
          </div>
          <span className="tag is-info">{directions.length} steps</span>
        </div>
        <Directions plan={plan} />
      </section>
    </div>
  );
}
