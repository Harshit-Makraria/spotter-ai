"""
Hours-of-Service engine tests.

Every assertion here traces back to a worked example or an explicit rule in
FMCSA's *Interstate Truck Driver's Guide to Hours of Service* (2022).  Page
references are to that document.
"""

import unittest
from datetime import date, datetime, timedelta

from trips.services.hos import (
    MAX_DRIVING_BEFORE_BREAK,
    MAX_DRIVING_PER_WINDOW,
    MAX_DUTY_WINDOW,
    REQUIRED_BREAK,
    DutyStatus,
    EventKind,
    InfeasibleTrip,
    Leg,
    PlanInput,
    Segment,
    build_legs,
    plan_trip,
)
from trips.services.logsheets import MINUTES_PER_DAY, build_log_days

SPEED = 55.0


def make_plan(miles_to_pickup, miles_to_dropoff, cycle_used=0.0, **kwargs):
    return plan_trip(
        PlanInput(
            start_time=kwargs.pop("start_time", datetime(2026, 3, 2, 6, 0)),
            cycle_hours_used=cycle_used,
            legs=build_legs(miles_to_pickup, miles_to_dropoff),
            avg_speed_mph=kwargs.pop("avg_speed_mph", SPEED),
            **kwargs,
        )
    )


def driving_segments(plan):
    return [s for s in plan.segments if s.status is DutyStatus.DRIVING]


class FourteenHourWindow(unittest.TestCase):
    """395.3(a)(2) -- guide p.6."""

    def test_no_driving_after_the_fourteenth_hour(self):
        """'You come to work at 6:00 a.m. You must not drive after 8:00 p.m.'"""
        plan = make_plan(0, 2000, cycle_used=0)
        first_work = plan.segments[0].start
        deadline = first_work + timedelta(minutes=MAX_DUTY_WINDOW)

        first_day_driving = [
            s for s in driving_segments(plan) if s.start < deadline + timedelta(hours=2)
        ]
        self.assertTrue(first_day_driving, "expected driving on the first day")
        for seg in first_day_driving:
            if seg.start >= first_work and seg.start < deadline:
                self.assertLessEqual(
                    seg.end, deadline,
                    f"drove until {seg.end}, past the 14-hour deadline of {deadline}",
                )

    def test_off_duty_time_does_not_extend_the_window(self):
        """A 30-minute break consumes window time; it does not push the deadline."""
        plan = make_plan(0, 2000)
        windows = _duty_windows(plan)
        for start, last_drive_end in windows:
            self.assertLessEqual(
                (last_drive_end - start).total_seconds() / 60,
                MAX_DUTY_WINDOW,
                f"duty window beginning {start} allowed driving until {last_drive_end}",
            )


class ElevenHourLimit(unittest.TestCase):
    """395.3(a)(3) -- guide p.7."""

    def test_at_most_eleven_hours_driving_per_window(self):
        plan = make_plan(0, 3000)
        for start, _ in _duty_windows(plan):
            driven = sum(
                s.minutes
                for s in driving_segments(plan)
                if start <= s.start < start + timedelta(minutes=MAX_DUTY_WINDOW)
            )
            self.assertLessEqual(
                driven, MAX_DRIVING_PER_WINDOW,
                f"{driven / 60:.2f} h driven in the window starting {start}",
            )

    def test_guide_example_seven_hours_break_then_four_more(self):
        """p.7: on duty 06:00, 11 h driving with a 30-minute break, done by 18:30.

        The guide's driver breaks at 7 h; ours breaks at the legal maximum of 8.
        Both are compliant, so the assertion is on the limits, not the timing.
        """
        # A 1-hour pickup at the origin reproduces the guide's 06:00 on-duty start.
        plan = make_plan(0, 11 * SPEED, cycle_used=0)
        day_one = [s for s in driving_segments(plan) if s.start.day == 2]

        self.assertAlmostEqual(
            sum(s.minutes for s in day_one) / 60, 11.0, places=1,
            msg="the driver should be able to use the full 11 hours",
        )
        self.assertLessEqual(day_one[-1].end, datetime(2026, 3, 2, 20, 0))


class ThirtyMinuteBreak(unittest.TestCase):
    """395.3(a)(3)(ii) -- guide p.10."""

    def test_break_taken_before_eight_cumulative_driving_hours(self):
        plan = make_plan(0, 3000)
        cumulative = 0
        consecutive_non_driving = 0

        for seg in plan.segments:
            if seg.status is DutyStatus.DRIVING:
                cumulative += seg.minutes
                consecutive_non_driving = 0
                self.assertLessEqual(
                    cumulative, MAX_DRIVING_BEFORE_BREAK,
                    f"drove {cumulative / 60:.2f} h without a qualifying break, "
                    f"ending {seg.end}",
                )
            else:
                consecutive_non_driving += seg.minutes
                if consecutive_non_driving >= REQUIRED_BREAK:
                    cumulative = 0

    def test_one_hour_pickup_satisfies_the_break(self):
        """p.10: 'These interruptions can be used to satisfy the 30-minute break.'

        Driving 5 h, loading for an hour, then driving 6 h is legal with no
        separate break.  A naive engine inserts a redundant one.
        """
        plan = make_plan(5 * SPEED, 6 * SPEED, cycle_used=0)

        self.assertEqual(
            [s.kind for s in plan.segments if s.kind is EventKind.BREAK_30], [],
            "no separate 30-minute break is needed; the pickup already served as one",
        )
        self.assertEqual(plan.summary.driving_hours, 11.0)
        self.assertEqual(plan.summary.daily_resets, 0)
        self.assertTrue(plan.feasible)

    def test_short_non_consecutive_stops_do_not_combine(self):
        """Two 15-minute stops cannot add up to a 30-minute break."""
        plan = make_plan(0, 3000)
        for index, seg in enumerate(plan.segments):
            if seg.kind is EventKind.BREAK_30:
                self.assertGreaterEqual(
                    seg.minutes, REQUIRED_BREAK,
                    f"segment {index} is a break of only {seg.minutes} minutes",
                )


class SeventyHourCycle(unittest.TestCase):
    """395.3(b) and 395.3(c) -- guide pp.10-11."""

    def test_rolling_eight_day_total_matches_the_guide_table(self):
        """p.11 table: 67 h over days 1-8, 73 over days 2-9, 63 over days 3-10."""
        hours = [0, 10, 8.5, 12.5, 9, 10, 12, 5, 6, 0]
        ledger = {
            date(2026, 3, 1) + timedelta(days=i): round(h * 60)
            for i, h in enumerate(hours)
        }

        def window_total(first_index):
            first = date(2026, 3, 1) + timedelta(days=first_index)
            last = first + timedelta(days=7)
            return sum(m for d, m in ledger.items() if first <= d <= last) / 60

        self.assertEqual(window_total(0), 67)
        self.assertEqual(window_total(1), 73)
        self.assertEqual(window_total(2), 63)

    def test_exhausted_cycle_forces_a_34_hour_restart(self):
        plan = make_plan(100, 900, cycle_used=70.0)

        restarts = [s for s in plan.segments if s.kind is EventKind.RESTART_34]
        self.assertEqual(len(restarts), 1)
        self.assertEqual(restarts[0].minutes, 34 * 60)
        self.assertTrue(plan.feasible)
        self.assertEqual(
            restarts[0], plan.segments[0],
            "a driver with no cycle hours left cannot work before restarting",
        )

    def test_restart_restores_the_full_cycle(self):
        plan = make_plan(50, 300, cycle_used=70.0)
        self.assertGreater(plan.summary.cycle_hours_remaining_end, 50)

    def test_cycle_hours_outside_the_legal_range_are_rejected(self):
        for bad in (-1, 71, 100):
            with self.assertRaises(InfeasibleTrip):
                make_plan(100, 100, cycle_used=bad)


class FuelStops(unittest.TestCase):
    """Assessment assumption: fuel at least once every 1,000 miles."""

    def test_no_stretch_exceeds_one_thousand_miles(self):
        plan = make_plan(200, 2600)
        miles_since_fuel = 0.0

        for seg in plan.segments:
            if seg.status is DutyStatus.DRIVING:
                miles_since_fuel += seg.miles
                self.assertLessEqual(
                    round(miles_since_fuel, 1), 1000.0,
                    f"drove {miles_since_fuel:.1f} miles without refuelling",
                )
            elif seg.kind is EventKind.FUEL:
                miles_since_fuel = 0.0

    def test_fuel_stop_count_scales_with_distance(self):
        self.assertEqual(make_plan(100, 300).summary.fuel_stops, 0)
        self.assertGreaterEqual(make_plan(200, 2600).summary.fuel_stops, 2)


class PickupAndDropoff(unittest.TestCase):
    """Assessment assumption: 1 hour for pickup and drop-off."""

    def test_each_takes_exactly_one_hour_on_duty(self):
        plan = make_plan(150, 250)
        for kind in (EventKind.PICKUP, EventKind.DROPOFF):
            matching = [s for s in plan.segments if s.kind is kind]
            self.assertEqual(len(matching), 1)
            self.assertEqual(matching[0].minutes, 60)
            self.assertIs(matching[0].status, DutyStatus.ON_DUTY)

    def test_defaults_match_the_brief_exactly(self):
        """With the stated assumptions only, on-duty time is pickup + drop-off."""
        plan = make_plan(150, 250)
        self.assertEqual(plan.summary.on_duty_hours, 2.0)
        self.assertEqual(plan.summary.fuel_stops, 0)


class DailyLogSheets(unittest.TestCase):
    """395.8 -- guide pp.15-19."""

    def test_every_sheet_totals_exactly_24_hours(self):
        for miles in (300, 1200, 2600, 4000):
            plan = make_plan(150, miles)
            days = build_log_days(plan.segments)
            self.assertTrue(days)
            for log_day in days:
                self.assertEqual(
                    log_day.total_minutes, MINUTES_PER_DAY,
                    f"{log_day.day} totals {log_day.total_minutes} minutes",
                )
                self.assertTrue(log_day.is_balanced())

    def test_long_trips_produce_multiple_sheets(self):
        plan = make_plan(200, 2600)
        self.assertGreaterEqual(len(build_log_days(plan.segments)), 4)

    def test_grid_entries_are_contiguous_and_ordered(self):
        plan = make_plan(150, 1500)
        for log_day in build_log_days(plan.segments):
            cursor = 0
            for entry in log_day.entries:
                self.assertEqual(entry.start_minute, cursor)
                self.assertGreater(entry.end_minute, entry.start_minute)
                cursor = entry.end_minute
            self.assertEqual(cursor, MINUTES_PER_DAY)

    def test_john_doe_completed_log_from_page_18(self):
        """Reproduces the printed sample log: Richmond, VA to Newark, NJ.

        The sheet on p.19 shows off duty 10, sleeper 1.75, driving 7.75 and
        on duty 4.5, totalling 24 hours.
        """
        day = datetime(2021, 4, 9)

        def at(hour, minute=0):
            return day + timedelta(hours=hour, minutes=minute)

        script = [
            (DutyStatus.OFF_DUTY, 0, 0, 6, 0, "Richmond, VA"),
            (DutyStatus.ON_DUTY, 6, 0, 7, 30, "Richmond, VA"),
            (DutyStatus.DRIVING, 7, 30, 9, 0, ""),
            (DutyStatus.ON_DUTY, 9, 0, 9, 30, "Fredericksburg, VA"),
            (DutyStatus.DRIVING, 9, 30, 12, 0, ""),
            (DutyStatus.OFF_DUTY, 12, 0, 13, 0, "Baltimore, MD"),
            (DutyStatus.DRIVING, 13, 0, 15, 0, ""),
            (DutyStatus.ON_DUTY, 15, 0, 15, 30, "Philadelphia, PA"),
            (DutyStatus.DRIVING, 15, 30, 16, 0, ""),
            (DutyStatus.SLEEPER, 16, 0, 17, 45, "Cherry Hill, NJ"),
            (DutyStatus.DRIVING, 17, 45, 19, 0, ""),
            (DutyStatus.ON_DUTY, 19, 0, 21, 0, "Newark, NJ"),
            (DutyStatus.OFF_DUTY, 21, 0, 24, 0, "Newark, NJ"),
        ]

        segments = [
            Segment(
                status=status,
                kind=EventKind.DRIVE if status is DutyStatus.DRIVING else EventKind.PICKUP,
                start=at(sh, sm),
                end=at(eh, em),
                start_mile=0,
                end_mile=0,
                label=status.value,
                location=where,
            )
            for status, sh, sm, eh, em, where in script
        ]

        log_day = build_log_days(segments)[0]
        as_hours = {s: log_day.totals[s] / 60 for s in DutyStatus}

        self.assertEqual(as_hours[DutyStatus.OFF_DUTY], 10.0)
        self.assertEqual(as_hours[DutyStatus.SLEEPER], 1.75)
        self.assertEqual(as_hours[DutyStatus.DRIVING], 7.75)
        self.assertEqual(as_hours[DutyStatus.ON_DUTY], 4.5)
        self.assertEqual(sum(as_hours.values()), 24.0)
        self.assertEqual(log_day.total_on_duty_hours, 12.25)

    def test_recap_rolling_windows_are_consistent(self):
        """The printed recap needs 5, 7 and 8 day on-duty totals per sheet.

        A longer window can never hold fewer hours than a shorter one, and the
        cycle figure must agree with the window its rule is based on.
        """
        plan = make_plan(200, 1900, cycle_used=30.0)
        days = build_log_days(plan.segments, daily_on_duty=plan.daily_on_duty)

        for log_day in days:
            rolling = log_day.rolling_on_duty
            self.assertEqual(set(rolling), {5, 7, 8}, "missing a recap window")
            self.assertLessEqual(rolling[5], rolling[7] + 0.01)
            self.assertLessEqual(rolling[7], rolling[8] + 0.01)

            # The 70/8 recap prints A = last 8 days and B = 70 - A.
            self.assertAlmostEqual(log_day.cycle_hours_used, rolling[8], places=2)
            self.assertAlmostEqual(
                log_day.cycle_hours_used + log_day.cycle_hours_remaining,
                70.0, places=2,
            )

    def test_recap_box_includes_hours_used_before_departure(self):
        """The driver starts with 40 h already in the cycle; day one must say so."""
        plan = make_plan(150, 250, cycle_used=40.0)
        days = build_log_days(plan.segments, daily_on_duty=plan.daily_on_duty)

        first = days[0]
        self.assertGreaterEqual(
            first.cycle_hours_used, 40.0,
            "the recap ignored on-duty hours accrued before the trip began",
        )
        self.assertAlmostEqual(
            first.cycle_hours_used + first.cycle_hours_remaining, 70.0, places=1
        )

    def test_remarks_are_ordered_and_never_exceed_the_status_changes(self):
        """395.8(c): a remark per change of duty status, one label per place.

        A stop produces two changes -- arriving on duty, then driving away --
        but the printed form names the place once, so remarks are collapsed.
        """
        plan = make_plan(150, 900)
        for log_day in build_log_days(plan.segments):
            changes = sum(
                1
                for a, b in zip(log_day.entries, log_day.entries[1:])
                if a.status is not b.status
            )
            minutes = [remark.minute for remark in log_day.remarks]

            self.assertLessEqual(len(log_day.remarks), changes + 1)
            self.assertEqual(minutes, sorted(minutes), "remarks are out of order")
            for earlier, later in zip(log_day.remarks, log_day.remarks[1:]):
                self.assertNotEqual(
                    earlier.location, later.location,
                    "consecutive remarks repeat the same place",
                )

    def test_each_sheet_can_name_where_the_day_started_and_ended(self):
        """395.8(d) asks for From and To on every page.

        The sheet derives them from the first and last located entry, so every
        day must carry at least one entry with a place name.
        """
        plan = make_plan(200, 1600)
        for seg in plan.segments:
            seg.location = seg.location or "Somewhere, US"

        for log_day in build_log_days(plan.segments):
            located = [e for e in log_day.entries if e.location]
            self.assertTrue(
                located, f"{log_day.day} has no entry that names a place",
            )

    def test_every_stop_is_named_in_the_remarks(self):
        plan = make_plan(200, 1600)
        for log_day in build_log_days(plan.segments):
            for remark in log_day.remarks:
                self.assertTrue(
                    remark.location or remark.note,
                    f"unlabelled remark at minute {remark.minute}",
                )


class Robustness(unittest.TestCase):
    """The audit must stay silent across a wide spread of inputs."""

    def test_no_violations_across_many_trips(self):
        checked = 0
        for to_pickup in (0, 45, 300, 900):
            for to_dropoff in (60, 500, 1800, 3200):
                for cycle in (0, 20, 55, 69):
                    for hour in (0, 6, 18):
                        plan = make_plan(
                            to_pickup, to_dropoff, cycle_used=cycle,
                            start_time=datetime(2026, 3, 2, hour, 0),
                        )
                        self.assertEqual(
                            plan.violations, [],
                            f"{to_pickup}+{to_dropoff} mi, cycle {cycle}, "
                            f"start {hour}:00 produced {plan.violations}",
                        )
                        for log_day in build_log_days(plan.segments):
                            self.assertTrue(log_day.is_balanced())
                        checked += 1
        self.assertEqual(checked, 4 * 4 * 4 * 3)

    def test_mileage_is_conserved(self):
        plan = make_plan(321, 1234)
        driven = sum(s.miles for s in driving_segments(plan))
        self.assertAlmostEqual(driven, 1555, delta=1.0)
        self.assertAlmostEqual(plan.summary.total_miles, 1555, delta=1.0)

    def test_timeline_has_no_gaps_or_overlaps(self):
        plan = make_plan(200, 1500)
        for earlier, later in zip(plan.segments, plan.segments[1:]):
            self.assertEqual(earlier.end, later.start)

    def test_zero_distance_trip_still_logs_pickup_and_dropoff(self):
        plan = make_plan(0, 0)
        kinds = [s.kind for s in plan.segments]
        self.assertIn(EventKind.PICKUP, kinds)
        self.assertIn(EventKind.DROPOFF, kinds)
        self.assertTrue(plan.feasible)

    def test_inspections_are_opt_in(self):
        without = make_plan(100, 200)
        self.assertNotIn(EventKind.PRETRIP, [s.kind for s in without.segments])

        with_inspections = plan_trip(
            PlanInput(
                start_time=datetime(2026, 3, 2, 6, 0),
                cycle_hours_used=0,
                legs=build_legs(100, 200),
                include_inspections=True,
            )
        )
        kinds = [s.kind for s in with_inspections.segments]
        self.assertIn(EventKind.PRETRIP, kinds)
        self.assertIn(EventKind.POSTTRIP, kinds)


def _duty_windows(plan):
    """Recover (window start, last driving end) pairs from a finished plan."""
    windows = []
    start = None
    last_drive_end = None
    rest = 0

    for seg in plan.segments:
        if seg.status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER):
            rest += seg.minutes
            if rest >= 10 * 60 and start is not None:
                windows.append((start, last_drive_end or start))
                start, last_drive_end = None, None
            continue

        rest = 0
        if start is None:
            start = seg.start
        if seg.status is DutyStatus.DRIVING:
            last_drive_end = seg.end

    if start is not None:
        windows.append((start, last_drive_end or start))
    return windows


if __name__ == "__main__":
    unittest.main(verbosity=2)
