import type { ReactNode } from "react";
import { ArrowRightIcon } from "../components/icons";
import { ComplianceTag } from "../components/Summary";
import type { TripPlan } from "../types";

/** The title row shared by every view of a planned trip. */
export function TripHeader({
  plan,
  title,
  actions,
}: {
  plan: TripPlan;
  title: string;
  actions?: ReactNode;
}) {
  const departure = new Date(plan.summary.start_time);
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        <div className="page-sub">
          <span className="route-chip">
            <i style={{ background: "var(--info)" }} />
            {plan.places.current.name}
          </span>
          <ArrowRightIcon size={13} className="sep" />
          <span className="route-chip">
            <i style={{ background: "var(--ok)" }} />
            {plan.places.pickup.name}
          </span>
          <ArrowRightIcon size={13} className="sep" />
          <span className="route-chip">
            <i style={{ background: "var(--bad)" }} />
            {plan.places.dropoff.name}
          </span>
          <span className="sep">·</span>
          <span>
            Departs{" "}
            {departure.toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <ComplianceTag plan={plan} />
        </div>
      </div>
      {actions && <div className="page-actions no-print">{actions}</div>}
    </header>
  );
}
