"""
Hours-of-Service simulator for property-carrying CMV drivers.

Implements 49 CFR Part 395 as described in FMCSA's *Interstate Truck Driver's
Guide to Hours of Service* (2022).  This module is deliberately free of any
Django or network imports: it is a pure function of its inputs, which makes the
rules directly unit-testable against the worked examples in the guide.

Rules implemented
-----------------
395.3(a)(3)    11 hours maximum driving per duty window.
395.3(a)(2)    14 consecutive hour driving window, measured on the wall clock
               from the first on-duty activity.  Off-duty time inside the
               window does *not* extend it.
395.3(a)(3)(ii) 30 consecutive minutes of non-driving required before
               accumulating more than 8 cumulative hours of driving.  The break
               may be taken off duty, on duty, or in the sleeper berth, and any
               qualifying consecutive non-driving period satisfies it.
395.3(b)       60/7 or 70/8 on-duty cycle, computed on a rolling window of days.
395.3(c)       34 consecutive hours off duty restarts the cycle.
395.3(a)(1)    10 consecutive hours off duty (or sleeper) resets the 11 and 14
               hour clocks.

All internal arithmetic is in whole minutes so that the four duty-status totals
on a daily log always sum to exactly 24:00.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum

# --------------------------------------------------------------------------
# Regulatory constants
# --------------------------------------------------------------------------

MAX_DRIVING_PER_WINDOW = 11 * 60      # 395.3(a)(3)
MAX_DUTY_WINDOW = 14 * 60             # 395.3(a)(2)
MAX_DRIVING_BEFORE_BREAK = 8 * 60     # 395.3(a)(3)(ii)
REQUIRED_BREAK = 30                   # 395.3(a)(3)(ii)
REQUIRED_RESET = 10 * 60              # 395.3(a)(1)
RESTART_PERIOD = 34 * 60              # 395.3(c)

CYCLE_RULES = {
    70: 8,   # 70 hours in any 8 consecutive days
    60: 7,   # 60 hours in any 7 consecutive days
}

# Operational assumptions stated in the assessment brief
FUEL_INTERVAL_MILES = 1000.0
FUEL_STOP_MINUTES = 30
PICKUP_MINUTES = 60
DROPOFF_MINUTES = 60

# Additional realism, matching the pre-/post-trip inspections shown in the
# Schneider logbook walkthrough.  Toggleable; counts as on-duty not driving.
PRETRIP_MINUTES = 15
POSTTRIP_MINUTES = 15

DEFAULT_AVG_SPEED_MPH = 55.0

# A duty period may not exceed 14 hours, so no single prior day can carry more.
MAX_ONDUTY_PER_DAY = 14.0


class DutyStatus(str, Enum):
    """The four rows of a DOT record of duty status."""

    OFF_DUTY = "off_duty"
    SLEEPER = "sleeper_berth"
    DRIVING = "driving"
    ON_DUTY = "on_duty"

    @property
    def row(self) -> int:
        """1-indexed grid row, matching the printed log sheet."""
        return {
            DutyStatus.OFF_DUTY: 1,
            DutyStatus.SLEEPER: 2,
            DutyStatus.DRIVING: 3,
            DutyStatus.ON_DUTY: 4,
        }[self]


class EventKind(str, Enum):
    """What the driver is actually doing, for icons, remarks and the map."""

    DRIVE = "drive"
    PRETRIP = "pretrip"
    POSTTRIP = "posttrip"
    PICKUP = "pickup"
    DROPOFF = "dropoff"
    FUEL = "fuel"
    BREAK_30 = "break_30"
    REST_10 = "rest_10"
    RESTART_34 = "restart_34"


#: Kinds that represent a stop worth drawing on the map.
STOP_KINDS = {
    EventKind.PRETRIP,
    EventKind.POSTTRIP,
    EventKind.PICKUP,
    EventKind.DROPOFF,
    EventKind.FUEL,
    EventKind.BREAK_30,
    EventKind.REST_10,
    EventKind.RESTART_34,
}


@dataclass
class Segment:
    """One continuous period at a single duty status."""

    status: DutyStatus
    kind: EventKind
    start: datetime
    end: datetime
    start_mile: float
    end_mile: float
    label: str
    #: Human-readable place, resolved later by the planner from the route geometry.
    location: str = ""
    lat: float | None = None
    lon: float | None = None

    @property
    def minutes(self) -> int:
        return round((self.end - self.start).total_seconds() / 60)

    @property
    def hours(self) -> float:
        return self.minutes / 60.0

    @property
    def miles(self) -> float:
        return round(self.end_mile - self.start_mile, 1)


@dataclass
class Leg:
    """A stretch of driving that ends in a required on-duty event."""

    miles: float
    end_event: EventKind | None
    label: str


@dataclass
class PlanInput:
    start_time: datetime
    cycle_hours_used: float
    legs: list[Leg]
    cycle_limit_hours: int = 70
    avg_speed_mph: float = DEFAULT_AVG_SPEED_MPH
    #: Off by default so that the output matches the assessment brief's stated
    #: assumptions exactly (1 h pickup, 1 h drop-off, fuel every 1,000 mi).
    #: Enabling it adds the pre-/post-trip inspections FMCSA expects in practice.
    include_inspections: bool = False
    #: Optional true on-duty hours for the days preceding the trip, oldest
    #: first.  When omitted, ``cycle_hours_used`` is spread evenly across the
    #: prior days so that it ages out of the rolling window realistically.
    previous_days: list[float] | None = None


@dataclass
class Summary:
    total_miles: float
    driving_hours: float
    on_duty_hours: float
    off_duty_hours: float
    sleeper_hours: float
    total_hours: float
    start_time: datetime
    end_time: datetime
    cycle_hours_used_start: float
    cycle_hours_used_end: float
    cycle_hours_remaining_end: float
    fuel_stops: int
    rest_breaks: int
    daily_resets: int
    restarts: int
    log_days: int


@dataclass
class Plan:
    segments: list[Segment]
    summary: Summary
    violations: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    #: On-duty minutes per calendar day, including the days before departure.
    #: The log sheets need this to fill in the rolling cycle recap.
    daily_on_duty: dict[date, int] = field(default_factory=dict)

    @property
    def feasible(self) -> bool:
        return not self.violations

    @property
    def stops(self) -> list[Segment]:
        return [s for s in self.segments if s.kind in STOP_KINDS]


class InfeasibleTrip(ValueError):
    """Raised when the inputs cannot produce a legal plan."""


# --------------------------------------------------------------------------
# The simulator
# --------------------------------------------------------------------------


class _Simulator:
    def __init__(self, inp: PlanInput):
        if inp.cycle_limit_hours not in CYCLE_RULES:
            raise InfeasibleTrip(
                f"Unsupported cycle {inp.cycle_limit_hours}; expected 60 or 70."
            )
        if inp.cycle_hours_used < 0 or inp.cycle_hours_used > inp.cycle_limit_hours:
            raise InfeasibleTrip(
                f"Cycle hours used must be between 0 and {inp.cycle_limit_hours}."
            )
        if inp.avg_speed_mph <= 0:
            raise InfeasibleTrip("Average speed must be positive.")

        self.inp = inp
        self.cycle_limit = inp.cycle_limit_hours * 60
        self.cycle_days = CYCLE_RULES[inp.cycle_limit_hours]

        self.clock: datetime = inp.start_time
        self.mile: float = 0.0

        # Clocks, all in minutes.
        self.drive_in_window = 0
        self.drive_since_break = 0
        self.consecutive_off = 0
        self.window_start: datetime | None = None
        self.miles_since_fuel = 0.0

        self.segments: list[Segment] = []
        self.notes: list[str] = []

        # On-duty minutes per calendar day, seeded with the driver's history so
        # that the rolling cycle window can age hours out correctly.
        self.daily_on_duty: dict[date, int] = {}
        self._seed_history()

    # -- cycle bookkeeping -------------------------------------------------

    def _seed_history(self) -> None:
        inp = self.inp
        first_day = inp.start_time.date()
        prior_day_count = self.cycle_days - 1

        if inp.previous_days is not None:
            history = list(inp.previous_days)[-prior_day_count:]
        else:
            # Spread the stated cycle usage evenly over the preceding days.
            total = inp.cycle_hours_used
            per_day = total / prior_day_count if prior_day_count else 0.0
            if per_day > MAX_ONDUTY_PER_DAY:
                # Too concentrated to spread; pack the most recent days instead.
                history, left = [], total
                for _ in range(prior_day_count):
                    take = min(MAX_ONDUTY_PER_DAY, left)
                    history.append(take)
                    left -= take
                history.reverse()
            else:
                history = [per_day] * prior_day_count
            if prior_day_count:
                self.notes.append(
                    f"{total:g} h of prior cycle time was distributed evenly across "
                    f"the {prior_day_count} days before departure; hours age out of "
                    f"the rolling {self.cycle_days}-day window as the trip proceeds."
                )

        for offset, hours in enumerate(reversed(history), start=1):
            self.daily_on_duty[first_day - timedelta(days=offset)] = round(hours * 60)

    def _cycle_used(self, when: datetime | None = None) -> int:
        """On-duty minutes inside the rolling cycle window ending on ``when``."""
        today = (when or self.clock).date()
        oldest = today - timedelta(days=self.cycle_days - 1)
        return sum(
            minutes
            for day, minutes in self.daily_on_duty.items()
            if oldest <= day <= today
        )

    def _cycle_available(self) -> int:
        return max(0, self.cycle_limit - self._cycle_used())

    # -- segment construction ---------------------------------------------

    def _add(
        self,
        status: DutyStatus,
        kind: EventKind,
        minutes: int,
        label: str,
        miles: float = 0.0,
    ) -> Segment:
        if minutes <= 0:
            raise ValueError(f"Refusing to add a non-positive segment: {label}")

        start, end = self.clock, self.clock + timedelta(minutes=minutes)
        start_mile = self.mile
        end_mile = round(self.mile + miles, 3)

        seg = Segment(
            status=status,
            kind=kind,
            start=start,
            end=end,
            start_mile=start_mile,
            end_mile=end_mile,
            label=label,
        )
        self.segments.append(seg)

        # The 14-hour window opens at the first work of the duty period.
        if status in (DutyStatus.DRIVING, DutyStatus.ON_DUTY) and self.window_start is None:
            self.window_start = start

        if status is DutyStatus.DRIVING:
            self.drive_in_window += minutes
            self.drive_since_break += minutes
            self.consecutive_off = 0
            self.miles_since_fuel += miles
        else:
            # Any consecutive non-driving period of 30 minutes or more
            # satisfies 395.3(a)(3)(ii) -- a fuel stop or the hour spent
            # loading counts just as much as a dedicated break.
            self.consecutive_off += minutes
            if self.consecutive_off >= REQUIRED_BREAK:
                self.drive_since_break = 0

        if status in (DutyStatus.DRIVING, DutyStatus.ON_DUTY):
            self._charge_cycle(start, end)

        self.clock = end
        self.mile = end_mile
        return seg

    def _charge_cycle(self, start: datetime, end: datetime) -> None:
        """Attribute on-duty minutes to the calendar days they fall on."""
        cursor = start
        while cursor < end:
            midnight = datetime.combine(
                cursor.date() + timedelta(days=1), datetime.min.time(),
                tzinfo=cursor.tzinfo,
            )
            slice_end = min(end, midnight)
            minutes = round((slice_end - cursor).total_seconds() / 60)
            if minutes:
                self.daily_on_duty[cursor.date()] = (
                    self.daily_on_duty.get(cursor.date(), 0) + minutes
                )
            cursor = slice_end

    # -- rest insertion ----------------------------------------------------

    def _take_reset(self) -> None:
        """10 consecutive hours in the sleeper berth; resets the 11 and 14 clocks."""
        self._add(
            DutyStatus.SLEEPER,
            EventKind.REST_10,
            REQUIRED_RESET,
            "10-hour off-duty reset (sleeper berth)",
        )
        self.drive_in_window = 0
        self.drive_since_break = 0
        self.window_start = None

    def _take_break(self) -> None:
        """30 consecutive minutes off duty to satisfy 395.3(a)(3)(ii)."""
        self._add(
            DutyStatus.OFF_DUTY,
            EventKind.BREAK_30,
            REQUIRED_BREAK,
            "30-minute rest break",
        )

    def _take_restart(self) -> None:
        """34 consecutive hours off duty; restarts the weekly cycle."""
        seg_start = self.clock
        self._add(
            DutyStatus.OFF_DUTY,
            EventKind.RESTART_34,
            RESTART_PERIOD,
            f"34-hour restart ({self.inp.cycle_limit_hours}-hour cycle reset)",
        )
        # A restart wipes the rolling window clean.
        for day in list(self.daily_on_duty):
            if day <= self.clock.date():
                self.daily_on_duty[day] = 0
        self.drive_in_window = 0
        self.drive_since_break = 0
        self.window_start = None
        self.notes.append(
            f"A 34-hour restart was required at {seg_start:%b %d %H:%M} because the "
            f"{self.inp.cycle_limit_hours}-hour cycle was exhausted."
        )

    # -- driving availability ---------------------------------------------

    def _window_remaining(self) -> int:
        if self.window_start is None:
            return MAX_DUTY_WINDOW
        elapsed = round((self.clock - self.window_start).total_seconds() / 60)
        return max(0, MAX_DUTY_WINDOW - elapsed)

    def _drivable_minutes(self) -> int:
        return min(
            MAX_DRIVING_PER_WINDOW - self.drive_in_window,
            self._window_remaining(),
            MAX_DRIVING_BEFORE_BREAK - self.drive_since_break,
            self._cycle_available(),
        )

    def _make_drivable(self) -> None:
        """Insert whatever rest the regulations require before driving again.

        Loops because one remedy can expose another: a 30-minute break consumes
        30 minutes of the 14-hour window, which may itself end the duty period.
        """
        for _ in range(8):  # generous bound; each pass resolves one constraint
            if self._cycle_available() <= 0:
                self._take_restart()
                continue
            if self.drive_in_window >= MAX_DRIVING_PER_WINDOW:
                self._take_reset()
                continue
            if self._window_remaining() <= 0:
                self._take_reset()
                continue
            if self.drive_since_break >= MAX_DRIVING_BEFORE_BREAK:
                self._take_break()
                continue
            if self._drivable_minutes() <= 0:
                # Time remains on paper but not enough to move; close the day.
                self._take_reset()
                continue
            return
        raise InfeasibleTrip("Unable to find a legal driving opportunity.")

    # -- main loop ---------------------------------------------------------

    def run(self) -> Plan:
        inp = self.inp

        if inp.include_inspections:
            self._make_on_duty_capacity(PRETRIP_MINUTES)
            self._add(
                DutyStatus.ON_DUTY,
                EventKind.PRETRIP,
                PRETRIP_MINUTES,
                "Pre-trip inspection",
            )

        for leg in inp.legs:
            self._drive_leg(leg)
            if leg.end_event is EventKind.PICKUP:
                self._on_duty_event(EventKind.PICKUP, PICKUP_MINUTES, "Pickup — loading")
            elif leg.end_event is EventKind.DROPOFF:
                self._on_duty_event(EventKind.DROPOFF, DROPOFF_MINUTES, "Drop-off — unloading")

        if inp.include_inspections:
            self._make_on_duty_capacity(POSTTRIP_MINUTES)
            self._add(
                DutyStatus.ON_DUTY,
                EventKind.POSTTRIP,
                POSTTRIP_MINUTES,
                "Post-trip inspection",
            )

        return Plan(
            segments=self.segments,
            summary=self._summarise(),
            violations=self._audit(),
            notes=self.notes,
            daily_on_duty=dict(self.daily_on_duty),
        )

    def _make_on_duty_capacity(self, minutes: int) -> None:
        """On-duty work also needs cycle hours available."""
        if self._cycle_available() < minutes:
            self._take_restart()

    def _on_duty_event(self, kind: EventKind, minutes: int, label: str) -> None:
        self._make_on_duty_capacity(minutes)
        self._add(DutyStatus.ON_DUTY, kind, minutes, label)

    def _drive_leg(self, leg: Leg) -> None:
        speed = self.inp.avg_speed_mph
        remaining = leg.miles

        while remaining > 0.05:
            self._make_drivable()

            available_minutes = self._drivable_minutes()
            miles_by_time = available_minutes / 60.0 * speed
            miles_to_fuel = max(0.0, FUEL_INTERVAL_MILES - self.miles_since_fuel)

            if miles_to_fuel <= 0.05:
                self._fuel_stop()
                continue

            chunk = min(remaining, miles_by_time, miles_to_fuel)
            minutes = min(available_minutes, max(1, round(chunk / speed * 60)))

            self._add(
                DutyStatus.DRIVING,
                EventKind.DRIVE,
                minutes,
                leg.label,
                miles=chunk,
            )
            remaining -= chunk

            # Refuel before the next stretch, never after the trip has ended.
            if remaining > 0.05 and self.miles_since_fuel >= FUEL_INTERVAL_MILES - 0.05:
                self._fuel_stop()

    def _fuel_stop(self) -> None:
        self._make_on_duty_capacity(FUEL_STOP_MINUTES)
        self._add(
            DutyStatus.ON_DUTY,
            EventKind.FUEL,
            FUEL_STOP_MINUTES,
            "Fuel stop",
        )
        self.miles_since_fuel = 0.0

    # -- reporting ---------------------------------------------------------

    def _summarise(self) -> Summary:
        by_status: dict[DutyStatus, int] = {s: 0 for s in DutyStatus}
        for seg in self.segments:
            by_status[seg.status] += seg.minutes

        if self.segments:
            start = self.segments[0].start
            end = self.segments[-1].end
        else:
            start = end = self.inp.start_time
        cycle_end = self._cycle_used(end)

        counts = {k: 0 for k in EventKind}
        for seg in self.segments:
            counts[seg.kind] += 1

        return Summary(
            total_miles=round(self.mile, 1),
            driving_hours=round(by_status[DutyStatus.DRIVING] / 60, 2),
            on_duty_hours=round(by_status[DutyStatus.ON_DUTY] / 60, 2),
            off_duty_hours=round(by_status[DutyStatus.OFF_DUTY] / 60, 2),
            sleeper_hours=round(by_status[DutyStatus.SLEEPER] / 60, 2),
            total_hours=round((end - start).total_seconds() / 3600, 2),
            start_time=start,
            end_time=end,
            cycle_hours_used_start=round(self.inp.cycle_hours_used, 2),
            cycle_hours_used_end=round(cycle_end / 60, 2),
            cycle_hours_remaining_end=round(
                max(0, self.cycle_limit - cycle_end) / 60, 2
            ),
            fuel_stops=counts[EventKind.FUEL],
            rest_breaks=counts[EventKind.BREAK_30],
            daily_resets=counts[EventKind.REST_10],
            restarts=counts[EventKind.RESTART_34],
            log_days=len({
                d for seg in self.segments
                for d in _days_spanned(seg.start, seg.end)
            }),
        )

    def _audit(self) -> list[str]:
        """Independently re-check the finished plan against the regulations.

        This deliberately re-derives the clocks from the emitted segments rather
        than trusting the simulator's own state, so it can catch a bug in the
        simulator rather than repeating it.
        """
        violations: list[str] = []

        drive_in_window = 0
        drive_since_break = 0
        # Any consecutive non-driving time can satisfy the 30-minute break, but
        # only off-duty and sleeper time counts toward the 10-hour reset, so the
        # two are tracked separately.
        consecutive_nondriving = 0
        consecutive_rest = 0
        window_start: datetime | None = None

        for seg in self.segments:
            if seg.status is DutyStatus.DRIVING:
                if window_start is None:
                    window_start = seg.start
                elapsed = round((seg.end - window_start).total_seconds() / 60)
                if elapsed > MAX_DUTY_WINDOW:
                    violations.append(
                        f"14-hour window exceeded: driving until {seg.end:%b %d %H:%M}, "
                        f"{elapsed / 60:.2f} h after the duty period began."
                    )
                drive_in_window += seg.minutes
                if drive_in_window > MAX_DRIVING_PER_WINDOW:
                    violations.append(
                        f"11-hour driving limit exceeded at {seg.end:%b %d %H:%M} "
                        f"({drive_in_window / 60:.2f} h driven)."
                    )
                drive_since_break += seg.minutes
                if drive_since_break > MAX_DRIVING_BEFORE_BREAK:
                    violations.append(
                        f"Drove {drive_since_break / 60:.2f} h without a 30-minute "
                        f"break, ending {seg.end:%b %d %H:%M}."
                    )
                consecutive_nondriving = 0
                consecutive_rest = 0
            else:
                if seg.status is DutyStatus.ON_DUTY and window_start is None:
                    window_start = seg.start
                consecutive_nondriving += seg.minutes
                if consecutive_nondriving >= REQUIRED_BREAK:
                    drive_since_break = 0

                if seg.status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER):
                    consecutive_rest += seg.minutes
                else:
                    # On-duty work breaks the chain of qualifying rest.
                    consecutive_rest = 0
                if consecutive_rest >= REQUIRED_RESET:
                    drive_in_window = 0
                    window_start = None

        # Rolling cycle check, evaluated at the end of every day of the trip.
        for day in sorted(self.daily_on_duty):
            oldest = day - timedelta(days=self.cycle_days - 1)
            used = sum(
                m for d, m in self.daily_on_duty.items() if oldest <= d <= day
            )
            if used > self.cycle_limit + 1:  # 1 minute of rounding tolerance
                violations.append(
                    f"{self.inp.cycle_limit_hours}-hour cycle exceeded on {day}: "
                    f"{used / 60:.2f} h on duty in {self.cycle_days} days."
                )

        return violations


def _days_spanned(start: datetime, end: datetime) -> list[date]:
    days, cursor = [], start.date()
    while cursor <= (end - timedelta(microseconds=1)).date():
        days.append(cursor)
        cursor += timedelta(days=1)
    return days


# --------------------------------------------------------------------------
# Public entry point
# --------------------------------------------------------------------------


def plan_trip(inp: PlanInput) -> Plan:
    """Simulate a trip and return the resulting record of duty status."""
    return _Simulator(inp).run()


def build_legs(miles_to_pickup: float, miles_pickup_to_dropoff: float) -> list[Leg]:
    """The standard shape of an assessment trip: drive, load, drive, unload."""
    return [
        Leg(miles=miles_to_pickup, end_event=EventKind.PICKUP,
            label="Drive to pickup"),
        Leg(miles=miles_pickup_to_dropoff, end_event=EventKind.DROPOFF,
            label="Drive to drop-off"),
    ]
