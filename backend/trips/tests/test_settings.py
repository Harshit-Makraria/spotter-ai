"""
Configuration parsing tests.

A URL copied out of a browser address bar carries a trailing slash, and Django
rejects an origin that has a path -- as a hard SystemCheckError that fails the
whole deploy. These tests keep that class of typo harmless.
"""

import unittest
from unittest import mock

from config.settings import env_bool, env_list, env_origins


class EnvOrigins(unittest.TestCase):
    def parse(self, raw: str) -> list[str]:
        with mock.patch.dict("os.environ", {"TEST_ORIGINS": raw}, clear=False):
            return env_origins("TEST_ORIGINS")

    def test_trailing_slash_is_stripped(self):
        """The exact value that failed a Render build."""
        self.assertEqual(
            self.parse("https://spotter-ai-test.vercel.app/"),
            ["https://spotter-ai-test.vercel.app"],
        )

    def test_a_deeper_path_is_stripped(self):
        self.assertEqual(
            self.parse("https://example.vercel.app/some/page?x=1"),
            ["https://example.vercel.app"],
        )

    def test_port_is_preserved(self):
        self.assertEqual(
            self.parse("http://localhost:5173/"), ["http://localhost:5173"]
        )

    def test_several_origins_with_untidy_spacing(self):
        self.assertEqual(
            self.parse(" https://a.vercel.app/ , http://localhost:5173 ,, "),
            ["https://a.vercel.app", "http://localhost:5173"],
        )

    def test_wildcard_host_survives(self):
        """CSRF_TRUSTED_ORIGINS uses wildcards and must not be mangled."""
        self.assertEqual(
            self.parse("https://*.onrender.com"), ["https://*.onrender.com"]
        )

    def test_already_clean_origin_is_unchanged(self):
        self.assertEqual(
            self.parse("https://example.com"), ["https://example.com"]
        )

    def test_empty_value_yields_no_origins(self):
        self.assertEqual(self.parse(""), [])

    def test_no_origin_keeps_a_path(self):
        for origin in self.parse("https://a.vercel.app/,https://b.vercel.app/x"):
            self.assertNotIn("/", origin.split("//", 1)[1])


class EnvHelpers(unittest.TestCase):
    def test_env_list_trims_and_drops_blanks(self):
        with mock.patch.dict("os.environ", {"T": " a , b ,, c "}, clear=False):
            self.assertEqual(env_list("T"), ["a", "b", "c"])

    def test_env_bool_accepts_the_usual_spellings(self):
        for raw in ("1", "true", "TRUE", "yes", "on", " True "):
            with mock.patch.dict("os.environ", {"T": raw}, clear=False):
                self.assertTrue(env_bool("T"), raw)
        for raw in ("0", "false", "no", "off", ""):
            with mock.patch.dict("os.environ", {"T": raw}, clear=False):
                self.assertFalse(env_bool("T"), raw)


if __name__ == "__main__":
    unittest.main(verbosity=2)
