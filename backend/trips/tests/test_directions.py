"""
Turn-by-turn direction tests.

OSRM returns bare maneuvers with no text, and hundreds of them per route. The
planner renders them as sentences and collapses them to one line per road, so
these tests pin both the wording and the collapsing.
"""

import unittest

from trips.services.geo import (
    MAX_DIRECTIONS,
    _osrm_instruction,
    _road_label,
    collapse_directions,
)


def step(kind, modifier="", name="", ref="", **extra):
    return {"maneuver": {"type": kind, "modifier": modifier}, "name": name, "ref": ref, **extra}


class Wording(unittest.TestCase):
    def test_highway_numbers_are_preferred_and_formatted(self):
        self.assertEqual(_road_label("North Stemmons Freeway", "I 35E;US 77"), "I-35E")
        self.assertEqual(_road_label("Main Street", ""), "Main Street")
        self.assertEqual(_road_label("", "US 287"), "US-287")

    def test_turns_name_the_road(self):
        self.assertEqual(
            _osrm_instruction(step("turn", "left", "Elm Street"), 0, 2),
            "Turn left onto Elm Street",
        )

    def test_unnamed_roads_are_not_called_the_road(self):
        """Reading "merge onto the road" looks like a bug to anyone reviewing it."""
        for maneuver in (
            step("merge", "slight right"),
            step("on ramp", "right"),
            step("fork", "right"),
            step("turn", "left"),
            step("continue"),
        ):
            text = _osrm_instruction(maneuver, 0, 2)
            self.assertNotIn("the road", text)
            self.assertTrue(text)

    def test_exits_carry_their_number_and_destination(self):
        text = _osrm_instruction(
            step("off ramp", "right", exits="287", destinations="Fort Worth, Decatur"),
            0, 2,
        )
        self.assertEqual(text, "Take exit 287 toward Fort Worth")

    def test_arrival_names_the_right_stop(self):
        self.assertEqual(_osrm_instruction(step("arrive"), 0, 2), "Arrive at pickup")
        self.assertEqual(_osrm_instruction(step("arrive"), 1, 2), "Arrive at drop-off")


class Collapsing(unittest.TestCase):
    def raw(self, leg, road, miles, kind="straight", text=None):
        return {"leg": leg, "road": road, "miles": miles, "kind": kind,
                "text": text or f"Continue on {road}"}

    def test_consecutive_steps_on_one_road_become_one_line(self):
        steps = [
            self.raw(0, "", 0.1, "depart", "Depart"),
            self.raw(0, "I-40", 120.0, "ramp", "Merge onto I-40"),
            self.raw(0, "I-40", 80.0),
            self.raw(0, "I-40", 60.5),
            self.raw(0, "", 0.0, "arrive", "Arrive at pickup"),
        ]
        collapsed = collapse_directions(steps)
        self.assertEqual([d["text"] for d in collapsed],
                         ["Depart", "Merge onto I-40", "Arrive at pickup"])
        self.assertEqual(collapsed[1]["miles"], 260.5)

    def test_distance_is_conserved(self):
        """Collapsing adds exactly; only the final one-decimal rounding drifts.

        Each displayed figure can be off by at most 0.05 mile, so that is the
        bound -- anything beyond it would mean collapsing had dropped distance.
        """
        steps = [self.raw(0, f"Road {i % 3}", 1.3 + i * 0.73) for i in range(90)]
        steps += [self.raw(0, "I-80", 44.44) for _ in range(12)]  # merges
        collapsed = collapse_directions(steps)

        self.assertLess(len(collapsed), len(steps), "expected some merging")
        self.assertAlmostEqual(
            sum(d["miles"] for d in collapsed),
            sum(s["miles"] for s in steps),
            delta=0.05 * len(collapsed) + 1e-9,
        )

    def test_legs_are_never_merged_across(self):
        steps = [
            self.raw(0, "I-35", 200.0),
            self.raw(0, "", 0.0, "arrive", "Arrive at pickup"),
            self.raw(1, "", 0.1, "depart", "Depart"),
            self.raw(1, "I-35", 300.0),
        ]
        legs = [d["leg"] for d in collapse_directions(steps)]
        self.assertEqual(legs, [0, 0, 1, 1])

    def test_very_long_routes_are_capped_but_keep_every_leg_boundary(self):
        steps = [self.raw(0, "", 0.1, "depart", "Depart")]
        steps += [self.raw(0, f"Street {i}", float(i % 7), "left") for i in range(400)]
        steps += [self.raw(0, "", 0.0, "arrive", "Arrive at pickup")]
        collapsed = collapse_directions(steps)
        self.assertLessEqual(len(collapsed), MAX_DIRECTIONS)
        self.assertEqual(collapsed[0]["kind"], "depart")
        self.assertEqual(collapsed[-1]["kind"], "arrive")


if __name__ == "__main__":
    unittest.main(verbosity=2)
