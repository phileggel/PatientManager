"""Tests for scripts/branch.sh — run with `just test-scripts`."""

import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "branch.sh"


class Log(unittest.TestCase):
    def test_log_refuses_any_flag_so_nothing_can_be_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "written"
            result = subprocess.run(
                ["bash", str(SCRIPT), "log", f"--output={target}"],
                capture_output=True, text=True, cwd=SCRIPT.parents[1],
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("usage", result.stderr)
            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
