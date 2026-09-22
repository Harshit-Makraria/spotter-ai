import {
  ComplianceBanner,
  ComplianceChecks,
  HosClocks,
  TripFacts,
} from "../components/Summary";
import type { TripPlan } from "../types";
import { TripHeader } from "./TripHeader";

export function ComplianceView({ plan }: { plan: TripPlan }) {
  const { compliance } = plan;

  return (
    <div className="view">
      <TripHeader plan={plan} title="Compliance report" />
      <ComplianceBanner plan={plan} />

      <div className="grid-2">
        <section className="card">
          <div className="card-head has-rule">
            <div>
              <h2 className="card-title">Rules checked</h2>
              <p className="card-sub">Each one re-derived from the finished schedule</p>
            </div>
          </div>
          <ComplianceChecks plan={plan} />
        </section>

        <section className="card">
          <div className="card-head has-rule">
            <div>
              <h2 className="card-title">How close to each limit</h2>
              <p className="card-sub">The busiest duty period in the plan</p>
            </div>
          </div>
          <div className="card-body">
            <HosClocks plan={plan} />
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head has-rule">
            <div>
              <h2 className="card-title">Assumptions applied</h2>
              <p className="card-sub">From the assessment brief, plus the planning settings used</p>
            </div>
          </div>
          <TripFacts plan={plan} />
        </section>

        <section className="card">
          <div className="card-head has-rule">
            <div>
              <h2 className="card-title">Planner notes</h2>
              <p className="card-sub">Decisions the planner made that are worth knowing about</p>
            </div>
          </div>
          <div className="card-body">
            {compliance.violations.length > 0 && (
              <ul className="note-list is-bad" style={{ marginBottom: 14 }}>
                {compliance.violations.map((violation) => <li key={violation}>{violation}</li>)}
              </ul>
            )}
            <ul className="note-list">
              {compliance.notes.map((note) => <li key={note}>{note}</li>)}
              <li>
                A calendar sheet can show more than 11 hours of driving: it may hold the end of
                one duty period and the start of the next. The 11-hour limit applies per duty
                period, which is how it is checked here.
              </li>
              <li>
                The 30-minute break is satisfied by any 30 consecutive minutes off the wheel, so
                a one-hour pickup or a fuel stop counts as the break and no extra one is added.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
