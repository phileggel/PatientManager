"""Tests for scripts/check.py — run with `just test-scripts`."""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("check", Path(__file__).resolve().parents[1] / "check.py")
check = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = check
SPEC.loader.exec_module(check)

REPO = Path("/repo")


class SqlxDatabaseUrl(unittest.TestCase):
    def test_defaults_to_the_check_database_of_the_clone(self):
        self.assertEqual(check.sqlx_database_url(REPO, {}), "sqlite:/repo/src-tauri/.local/dev_check.sqlite")

    def test_an_empty_variable_counts_as_unset(self):
        self.assertEqual(
            check.sqlx_database_url(REPO, {"DATABASE_URL": ""}), "sqlite:/repo/src-tauri/.local/dev_check.sqlite"
        )

    def test_the_caller_s_database_url_wins(self):
        self.assertEqual(check.sqlx_database_url(REPO, {"DATABASE_URL": "sqlite:/ci/db.sqlite"}), "sqlite:/ci/db.sqlite")


class SqlxCheckDbMissing(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.repo = Path(tmp.name)

    def create_check_db(self):
        path = self.repo / check.SQLX_CHECK_DB
        path.parent.mkdir(parents=True)
        path.touch()

    def test_a_fresh_clone_has_no_check_database(self):
        self.assertTrue(check.sqlx_check_db_missing(self.repo, {}))

    def test_a_created_check_database_is_found(self):
        self.create_check_db()
        self.assertFalse(check.sqlx_check_db_missing(self.repo, {}))

    def test_the_caller_s_database_is_not_second_guessed(self):
        self.assertFalse(check.sqlx_check_db_missing(self.repo, {"DATABASE_URL": "sqlite:/ci/db.sqlite"}))


if __name__ == "__main__":
    unittest.main()
