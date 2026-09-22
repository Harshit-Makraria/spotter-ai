import { ExampleTrips, TripForm } from "../components/TripForm";
import type { TripRequest } from "../types";

interface Props {
  draft: TripRequest;
  onChange: (draft: TripRequest) => void;
  onSubmit: (request: TripRequest) => void;
  loading: boolean;
}

const STEPS = [
  {
    title: "Route the truck",
    body: "The three locations are geocoded and routed on OpenRouteService's heavy-goods-vehicle profile, with OSRM as a fallback.",
  },
  {
    title: "Run the duty clocks",
    body: "A simulator drives the route minute by minute under the 11, 14, 8 and 70 hour limits, inserting every break, reset, fuel stop and restart the law requires.",
  },
  {
    title: "Draw the logs",
    body: "The timeline is cut at midnight into DOT daily log sheets — grid, totals, remarks and recap — then audited again from scratch.",
  },
];

export function PlannerView({ draft, onChange, onSubmit, loading }: Props) {
  return (
    <div className="view">
      <header className="page-head">
        <div>
          <h1>Plan a new trip</h1>
          <p className="page-sub">
            Four details in, a routed plan and a filled-in log sheet for every day out.
          </p>
        </div>
      </header>

      <div className="planner">
        <section className="card">
          <div className="card-head has-rule">
            <div>
              <h2 className="card-title">Trip details</h2>
              <p className="card-sub">Property-carrying driver on the 70 hour / 8 day rule</p>
            </div>
          </div>
          <div className="card-body">
            <TripForm draft={draft} onChange={onChange} onSubmit={onSubmit} loading={loading} />
          </div>
        </section>

        <div className="col">
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Quick start</h2>
                <p className="card-sub">One click plans the trip — no typing needed</p>
              </div>
            </div>
            <div className="card-body">
              <ExampleTrips loading={loading} onPick={(request) => { onChange(request); onSubmit(request); }} />
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">How the plan is built</h2>
                <p className="card-sub">49 CFR Part 395, property carriers</p>
              </div>
            </div>
            <div className="card-body">
              <ol className="steps">
                {STEPS.map((step, index) => (
                  <li className="step" key={step.title}>
                    <span className="step-n">{index + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
