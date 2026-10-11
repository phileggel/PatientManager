"""Tests for scripts/release-notes.py and the lockfile version in scripts/release.py — run with `just test-scripts`."""

import contextlib
import importlib.util
import io
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[1]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


notes = load("release_notes", "release-notes.py")
sys.path.insert(0, str(SCRIPTS))  # release.py imports its sibling check.py
release = load("release", "release.py")

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


class LockfileVersion(unittest.TestCase):
    LOCK = json.dumps(
        {
            "name": "patient-manager",
            "version": "0.22.1",
            "lockfileVersion": 3,
            "packages": {
                "": {"name": "patient-manager", "version": "0.22.1"},
                "node_modules/é": {"version": "4.4.4"},
            },
        },
        indent=2,
        ensure_ascii=False,
    ) + "\n"

    def test_flow_011_the_lockfile_takes_the_release_version_in_both_places(self):
        data = json.loads(release.lockfile_with_version(self.LOCK, "0.25.0"))
        self.assertEqual((data["version"], data["packages"][""]["version"]), ("0.25.0", "0.25.0"))
        self.assertEqual(data["packages"]["node_modules/é"]["version"], "4.4.4")

    def test_flow_011_a_lockfile_of_another_shape_is_refused_not_guessed(self):
        for broken in ('{"version": "1.0.0", "packages": {}}', '{"packages": {"": {"version": "1.0.0"}}}'):
            with self.assertRaises(ValueError):
                release.lockfile_with_version(broken, "0.25.0")

    def test_flow_011_nothing_else_in_the_lockfile_moves(self):
        written = release.lockfile_with_version(self.LOCK, "0.25.0")
        self.assertEqual(written.replace("0.25.0", "0.22.1"), self.LOCK)


class ReleaseEnds(unittest.TestCase):
    """FLOW-045: a release says what it wrote, and answers a missing terminal in one line."""

    def manager(self, mode):
        manager = release.ReleaseManager.__new__(release.ReleaseManager)
        manager.mode = mode
        manager.new_version = "0.25.0"
        manager._changelog_entry = None
        manager.breaking_changes = 0
        manager.features = 1
        manager.fixes = 1
        manager.commits = [
            {"type": "feat", "description": "a statement is validated in one go"},
            {"type": "fix", "description": "a refused validation saves nothing"},
            {"type": "docs", "description": "not in the changelog"},
        ]
        return manager

    def finalize(self, manager):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), mock.patch.object(manager, "push_release", return_value=True, create=True):
            self.assertTrue(manager._finalize())
        return out.getvalue()

    def test_flow_045_a_release_ends_on_the_changelog_section_it_wrote(self):
        text = self.finalize(self.manager(release.Mode.REAL))
        self.assertIn("## [0.25.0]", text)
        self.assertIn("### Added\n- a statement is validated in one go", text)
        self.assertIn("### Fixed\n- a refused validation saves nothing", text)
        self.assertNotIn("not in the changelog", text)
        self.assertLess(text.index("published"), text.index("## [0.25.0]"))

    def test_flow_045_the_section_printed_is_the_one_written(self):
        manager = self.manager(release.Mode.DRY_RUN)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            manager.update_changelog()
        manager._changelog_entry = manager._changelog_entry.replace("## [0.25.0] - ", "## [0.25.0] - written on ")
        self.assertIn("## [0.25.0] - written on ", self.finalize(manager))

    def test_flow_045_a_dry_run_shows_the_section_it_would_write(self):
        text = self.finalize(self.manager(release.Mode.DRY_RUN))
        self.assertIn("### Added\n- a statement is validated in one go", text)

    def test_flow_045_a_release_with_nothing_for_the_changelog_says_so(self):
        manager = self.manager(release.Mode.REAL)
        manager.features = manager.fixes = 0
        self.assertIn("nothing a user notices", self.finalize(manager))

    def test_flow_045_without_a_terminal_the_confirmation_answers_in_one_line(self):
        manager = self.manager(release.Mode.REAL)
        out = io.StringIO()
        with contextlib.redirect_stdout(out), mock.patch("builtins.input", side_effect=EOFError):
            self.assertFalse(manager.ask_confirmation())
        self.assertIn("-y", out.getvalue())
        self.assertNotIn("Traceback", out.getvalue())
        self.assertEqual(len(out.getvalue().strip().splitlines()), 1)


if __name__ == "__main__":
    unittest.main()
