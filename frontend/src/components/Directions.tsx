import type { Direction, DirectionKind, TripPlan } from "../types";
import {
  FlagIcon,
  MapPinIcon,
  RampIcon,
  RoundaboutIcon,
  StraightIcon,
  TruckIcon,
  TurnLeftIcon,
  TurnRightIcon,
  UTurnIcon,
} from "./icons";

const ICON: Record<DirectionKind, typeof TurnLeftIcon> = {
  depart: TruckIcon,
  arrive: FlagIcon,
  left: TurnLeftIcon,
  right: TurnRightIcon,
  straight: StraightIcon,
  continue: StraightIcon,
  ramp: RampIcon,
  roundabout: RoundaboutIcon,
  uturn: UTurnIcon,
};

/** Stretches this long are the ones a driver actually plans a day around. */
const MAJOR_MILES = 25;

function Leg({ title, subtitle, steps }: { title: string; subtitle: string; steps: Direction[] }) {
  const miles = steps.reduce((sum, step) => sum + step.miles, 0);
  return (
    <section className="dir-leg">
      <header className="dir-leg-head">
        <span>{title}</span>
        <span className="tag is-mono">{Math.round(miles).toLocaleString()} mi · {subtitle}</span>
      </header>
      <ol className="dir-list">
        {steps.map((step, index) => {
          const Icon = ICON[step.kind] ?? StraightIcon;
          const major = step.miles >= MAJOR_MILES || step.kind === "arrive";
          return (
            <li key={`${step.leg}-${index}`} className={`dir${major ? " is-major" : ""}`}>
              <span className="dir-icon"><Icon size={15} /></span>
              <strong>{step.text}</strong>
              <span className="dir-miles">
                {step.miles >= 0.1 ? `${step.miles.toLocaleString()} mi` : "—"}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function Directions({ plan }: { plan: TripPlan }) {
  const steps = plan.route.directions ?? [];

  if (steps.length === 0) {
    return (
      <div className="card-body">
        <div className="empty-hint">
          <MapPinIcon size={18} />
          Turn-by-turn directions are not available for this trip.
        </div>
      </div>
    );
  }

  const toPickup = steps.filter((step) => step.leg === 0);
  const toDropoff = steps.filter((step) => step.leg !== 0);

  return (
    <div className="dir-legs">
      <Leg
        title={`To pickup · ${plan.places.pickup.name}`}
        subtitle={`${toPickup.length} steps`}
        steps={toPickup}
      />
      <Leg
        title={`To drop-off · ${plan.places.dropoff.name}`}
        subtitle={`${toDropoff.length} steps`}
        steps={toDropoff}
      />
    </div>
  );
}
