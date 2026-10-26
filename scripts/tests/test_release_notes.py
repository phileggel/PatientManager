"""Tests for scripts/release-notes.py — run with `just test-scripts`."""

import importlib.util
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


notes = load("release_notes", "release-notes.py")

CHANGELOG = """# Changelog

All notable changes to this project will be documented in this file.

## [0.24.0] - 2026-10-04

### Added

- save a diagnostic report to send to support

### Fixed

- offer only Excel .xlsx files when importing

## [0.23.0] - 2026-10-03

### Added

- list insurance funds alphabetically everywhere
"""


class ReleaseNotes(unittest.TestCase):
    def test_flow_018_the_notes_are_the_changelog_section_of_the_version(self):
        self.assertEqual(
            notes.section(CHANGELOG, "v0.24.0"),
            "### Added\n\n- save a diagnostic report to send to support\n\n### Fixed\n\n- offer only Excel .xlsx files when importing",
        )

    def test_flow_018_the_last_section_ends_with_the_file(self):
        self.assertEqual(notes.section(CHANGELOG, "0.23.0"), "### Added\n\n- list insurance funds alphabetically everywhere")

    def test_flow_018_a_version_without_a_section_has_no_notes(self):
        self.assertIsNone(notes.section(CHANGELOG, "v0.25.0"))
        self.assertIsNone(notes.section(CHANGELOG, "0.2"), "a prefix of a version is not that version")
        self.assertIsNone(notes.section(CHANGELOG, ""))


if __name__ == "__main__":
    unittest.main()
