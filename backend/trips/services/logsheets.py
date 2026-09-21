"""
Turn a continuous record of duty status into printable daily log sheets.

A DOT log covers one calendar day, midnight to midnight, in the time zone of
the driver's home terminal (49 CFR 395.8).  A duty status that spans midnight
is therefore split across two sheets, and any part of a day the trip does not
cover is off duty by default -- which is what makes the four row totals on
every sheet add up to exactly 24 hours.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from .hos import DutyStatus, EventKind, Segment

MINUTES_PER_DAY = 24 * 60


@dataclass
class GridEntry:
    """One horizontal run on the log grid, in minutes from midnight."""

    status: DutyStatus
    start_minute: int
    end_minute: int
    kind: EventKind
    label: str
    location: str = ""
    #: Index of the originating segment, so the UI can cross-highlight the map.
    segment_index: int | None = None

    @property
    def minutes(self) -> int:
        return self.end_minute - self.start_minute

    @property
    def row(self) -> int:
        return self.status.row


@dataclass
class Remark:
    """A duty-status change annotated with its city/state, per 395.8(c)."""

    minute: int
    location: str
    note: str
    kind: EventKind


@dataclass
class LogDay:
    day: date
    entries: list[GridEntry]
    remarks: list[Remark]
    totals: dict[DutyStatus, int]
    miles_driven: float
    #: Rolling on-duty hours in the cycle at the end of this day.
    cycle_hours_used: float = 0.0
    cycle_hours_remaining: float = 0.0
    #: On-duty hours over the last N days including today, keyed by N.
    #: The printed recap asks for several window lengths at once.
    rolling_on_duty: dict[int, float] = field(default_factory=dict)

    @property
    def total_minutes(self) -> int:
        return sum(self.totals.values())

    @property
    def total_on_duty_hours(self) -> float:
        """Lines 3 + 4 -- the figure a driver circles at the bottom of the sheet."""
        return round(
            (self.totals[DutyStatus.DRIVING] + self.totals[DutyStatus.ON_DUTY]) / 60, 2
        )

    def is_balanced(self) -> bool:
        return self.total_minutes == MINUTES_PER_DAY


def _minute_of_day(when: datetime, day: date) -> int:
    """Clamp a timestamp to a minute offset within ``day``."""
    delta = when - datetime.combine(day, datetime.min.time(), tzinfo=when.tzinfo)
    return max(0, min(MINUTES_PER_DAY, round(delta.total_seconds() / 60)))


def _days_between(start: datetime, end: datetime) -> list[date]:
    days, cursor = [], start.date()
    last = (end - timedelta(microseconds=1)).date() if end > start else start.date()
    while cursor <= last:
        days.append(cursor)
        cursor += timedelta(days=1)
    return days


def build_log_days(
    segments: list[Segment],
    cycle_limit_hours: int = 70,
    cycle_days: int = 8,
    daily_on_duty: dict[date, int] | None = None,
) -> list[LogDay]:
    """Split a duty-status timeline into one balanced log sheet per day."""
    if not segments:
        return []

    first = segments[0].start
    last = segments[-1].end
    all_days = _days_between(first, last)

    # Bucket each segment into the days it touches.
    per_day: dict[date, list[GridEntry]] = {d: [] for d in all_days}
    miles_per_day: dict[date, float] = {d: 0.0 for d in all_days}

    for index, seg in enumerate(segments):
        for day in _days_between(seg.start, seg.end):
            start_m = _minute_of_day(seg.start, day)
            end_m = _minute_of_day(seg.end, day)
            if end_m <= start_m:
                continue
            per_day.setdefault(day, []).append(
                GridEntry(
                    status=seg.status,
                    start_minute=start_m,
                    end_minute=end_m,
                    kind=seg.kind,
                    label=seg.label,
                    location=seg.location,
                    segment_index=index,
                )
            )
            if seg.status is DutyStatus.DRIVING and seg.minutes:
                # Attribute mileage to each day in proportion to time driven.
                share = (end_m - start_m) / seg.minutes
                miles_per_day[day] = miles_per_day.get(day, 0.0) + seg.miles * share

    log_days: list[LogDay] = []
    for day in all_days:
        entries = sorted(per_day.get(day, []), key=lambda e: e.start_minute)
        entries = _fill_off_duty_gaps(entries)

        totals = {status: 0 for status in DutyStatus}
        for entry in entries:
            totals[entry.status] += entry.minutes

        log_days.append(
            LogDay(
                day=day,
                entries=entries,
                remarks=_build_remarks(entries),
                totals=totals,
                miles_driven=round(miles_per_day.get(day, 0.0), 1),
            )
        )

    _attach_cycle_recap(log_days, cycle_limit_hours, cycle_days, daily_on_duty)
    return log_days


def _fill_off_duty_gaps(entries: list[GridEntry]) -> list[GridEntry]:
    """Pad the day with off-duty time so the sheet totals 24 hours."""
    filled: list[GridEntry] = []
    cursor = 0

    last_location = ""

    for entry in entries:
        if entry.start_minute > cursor:
            filled.append(
                GridEntry(
                    status=DutyStatus.OFF_DUTY,
                    start_minute=cursor,
                    end_minute=entry.start_minute,
                    kind=EventKind.BREAK_30,
                    label="Off duty",
                    # The driver is still wherever they last stopped.
                    location=last_location,
                )
            )
        filled.append(entry)
        cursor = max(cursor, entry.end_minute)
        last_location = entry.location or last_location

    if cursor < MINUTES_PER_DAY:
        filled.append(
            GridEntry(
                status=DutyStatus.OFF_DUTY,
                start_minute=cursor,
                end_minute=MINUTES_PER_DAY,
                kind=EventKind.BREAK_30,
                label="Off duty",
                location=last_location,
            )
        )

    return _merge_adjacent(filled)


def _merge_adjacent(entries: list[GridEntry]) -> list[GridEntry]:
    """Collapse touching runs of the same status into one drawn line."""
    merged: list[GridEntry] = []
    for entry in entries:
        if (
            merged
            and merged[-1].status is entry.status
            and merged[-1].end_minute == entry.start_minute
            and merged[-1].kind is entry.kind
        ):
            merged[-1].end_minute = entry.end_minute
        else:
            merged.append(entry)
    return merged


def _build_remarks(entries: list[GridEntry]) -> list[Remark]:
    """One remark per change of duty status, as 395.8(c) requires."""
    remarks: list[Remark] = []
    previous: GridEntry | None = None

    for entry in entries:
        starts_the_day = entry.start_minute == 0
        changed = previous is not None and previous.status is not entry.status
        if changed or (starts_the_day and entry.status is not DutyStatus.OFF_DUTY):
            # A single stop usually produces two status changes -- arriving on
            # duty and then driving away again. The printed form names the place
            # once, so consecutive remarks at the same location are collapsed.
            if remarks and remarks[-1].location == entry.location:
                previous = entry
                continue
            remarks.append(
                Remark(
                    minute=entry.start_minute,
                    location=entry.location,
                    note=entry.label,
                    kind=entry.kind,
                )
            )
        previous = entry

    return remarks


def _attach_cycle_recap(
    log_days: list[LogDay],
    cycle_limit_hours: int,
    cycle_days: int,
    daily_on_duty: dict[date, int] | None,
) -> None:
    """Fill the recap box: rolling on-duty hours and hours available."""
    ledger = dict(daily_on_duty or {})
    for log_day in log_days:
        ledger.setdefault(
            log_day.day,
            log_day.totals[DutyStatus.DRIVING] + log_day.totals[DutyStatus.ON_DUTY],
        )

    def window_hours(day: date, days: int) -> float:
        oldest = day - timedelta(days=days - 1)
        return round(
            sum(m for d, m in ledger.items() if oldest <= d <= day) / 60, 2
        )

    for log_day in log_days:
        # 5, 7 and 8 day windows are the ones the printed recap asks for.
        log_day.rolling_on_duty = {
            days: window_hours(log_day.day, days) for days in (5, 7, 8)
        }
        used = window_hours(log_day.day, cycle_days)
        log_day.cycle_hours_used = used
        log_day.cycle_hours_remaining = round(max(0.0, cycle_limit_hours - used), 2)
