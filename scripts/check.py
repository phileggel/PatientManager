#!/usr/bin/env python3
import subprocess
import sys
import os
import re
from collections import defaultdict
from pathlib import Path
from typing import List, Optional

# ANSI Colors (respect NO_COLOR=1)
if os.environ.get("NO_COLOR"):
    BLUE = GREEN = RED = ORANGE = YELLOW = NC = ""
else:
    BLUE = "\033[0;34m"
    GREEN = "\033[0;32m"
    RED = "\033[0;31m"
    ORANGE = "\033[0;33m"
    YELLOW = "\033[0;33m"
    NC = "\033[0m"


class QualityChecker:
    def __init__(self, fast_mode: bool = False, verbose: bool = False):
        self.repo_root = Path(__file__).parent.parent
        self.fast_mode = fast_mode
        self.verbose = verbose
        self.metrics = {
            "react_tests": "SKIPPED",
            "rust_lib": "SKIPPED",
            "rust_beh": "SKIPPED",
            "build": "SKIPPED",
            "sqlx": "Pending",
            "lint": "Pending",
            "biome": "Pending",
            "clippy": "Pending",
            "rust_fmt": "Pending",
            "tsc": "Pending",
        }
        self.suite_failed = False
        self.failures: dict[str, str] = {}

        # Stack markers — presence-of-file gates each check.
        # Partial-stack projects (e.g. no-DB Tauri, FE-only, kit-only bootstrap)
        # skip the gated checks instead of failing.
        # TODO(v4.6): strict mode should treat absent stack as failure.
        # See `docs/TODO.md` § "Partial-stack & strict-mode audit (no-DB Tauri)".
        self.package_json = self.repo_root / "package.json"
        self.cargo_toml = self.repo_root / "src-tauri" / "Cargo.toml"
        self.sqlx_dir = self.repo_root / "src-tauri" / ".sqlx"
        self._skipped_for_stack: list[tuple[str, str]] = []  # (reason, check_name)

    def _vprint(self, *args, **kwargs):
        if self.verbose:
            print(*args, **kwargs)

    def _maybe_skip_for_stack(
        self, metric_key: str, check_name: str, marker: Path, reason: str
    ) -> bool:
        """Return True if the check should be skipped (stack marker absent).
        Records the skip in metrics and in the stack-summary list."""
        if marker.exists():
            return False
        print(f"  {check_name}... {BLUE}⏩ skipped ({reason}){NC}", flush=True)
        self.metrics[metric_key] = "SKIPPED"
        self._skipped_for_stack.append((reason, check_name))
        return True

    def print_header(self, title: str):
        self._vprint(f"\n{BLUE}🚀 {title}{NC}")
        self._vprint(
            f"{BLUE}═══════════════════════════════════════════════════════════{NC}"
        )

    def run_step(
        self,
        name: str,
        cmd: List[str],
        cwd: Optional[Path] = None,
        env_update: Optional[dict] = None,
    ) -> bool:
        print(f"  {name}...", flush=True)
        self._vprint(f"\n{BLUE}▶ Running {name}...{NC}")

        current_env = os.environ.copy()
        if env_update:
            current_env.update(env_update)

        try:
            if self.verbose:
                result = subprocess.run(cmd, cwd=cwd or self.repo_root, env=current_env)
                output = ""
            else:
                result = subprocess.run(
                    cmd,
                    cwd=cwd or self.repo_root,
                    env=current_env,
                    capture_output=True,
                    text=True,
                )
                output = (result.stdout + result.stderr).strip()

            success = result.returncode == 0
            if success:
                self._vprint(f"{GREEN}✓ {name}: Passed{NC}")
            else:
                self._vprint(f"{RED}✗ {name}: Failed (Exit {result.returncode}){NC}")
                self.suite_failed = True
                if output:
                    self.failures[name] = output
            return success
        except Exception as e:
            self._vprint(f"{RED}✗ {name}: Exception: {e}{NC}")
            self.suite_failed = True
            self.failures[name] = str(e)
            return False

    def check_sqlx(self) -> bool:
        if self._maybe_skip_for_stack(
            "sqlx", "SQLx Integrity", self.sqlx_dir, "src-tauri/.sqlx/ absent"
        ):
            return True

        self._vprint(f"\n{BLUE}▶ Checking SQLx Integrity...{NC}")
        result = subprocess.run(
            ["git", "diff", "--name-only", str(self.sqlx_dir)],
            capture_output=True,
            text=True,
            check=True,
        )
        status = result.stdout
        if status.strip():
            self._vprint(
                f"{RED}✗ SQLx: Unstaged changes in .sqlx/. Run 'just prepare-sqlx' and stage the result.{NC}"
            )
            self.metrics["sqlx"] = "Uncommitted"
            self.suite_failed = True
            self.failures["SQLx"] = (
                "Unstaged changes in .sqlx/. Run 'just prepare-sqlx' and stage the result."
            )
            return False

        success = self.run_step(
            "SQLx Prepare Check",
            ["cargo", "sqlx", "prepare", "--check"],
            cwd=self.repo_root / "src-tauri",
        )
        self.metrics["sqlx"] = "Pass" if success else "Stale"
        return success

    def run_all(self):
        self.print_header("Quality Check Suite")

        if not self.fast_mode:
            if not self._maybe_skip_for_stack(
                "react_tests", "React Tests", self.package_json, "package.json absent"
            ):
                if self.run_step("React Tests", ["npm", "test", "--", "--run"]):
                    self.metrics["react_tests"] = "Pass"

            if not self._maybe_skip_for_stack(
                "rust_lib",
                "Rust Lib Tests",
                self.cargo_toml,
                "src-tauri/Cargo.toml absent",
            ):
                if self.run_step(
                    "Rust Lib Tests",
                    ["cargo", "test", "--lib"],
                    cwd=self.repo_root / "src-tauri",
                    env_update={"SQLX_OFFLINE": "1"},
                ):
                    self.metrics["rust_lib"] = "Pass"

            if not self._maybe_skip_for_stack(
                "rust_beh",
                "Rust Behavior Tests",
                self.cargo_toml,
                "src-tauri/Cargo.toml absent",
            ):
                if self.run_step(
                    "Rust Behavior Tests",
                    ["cargo", "test", "--tests"],
                    cwd=self.repo_root / "src-tauri",
                    env_update={"SQLX_OFFLINE": "1"},
                ):
                    self.metrics["rust_beh"] = "Pass"

            if not self._maybe_skip_for_stack(
                "build", "Application Build", self.package_json, "package.json absent"
            ):
                if self.run_step("Application Build", ["npm", "run", "build"]):
                    self.metrics["build"] = "Pass"
        else:
            self._vprint(f"{BLUE}⏩ Fast mode: skipping tests and build.{NC}")

        self.check_sqlx()

        if not self._maybe_skip_for_stack(
            "lint", "Oxlint", self.package_json, "package.json absent"
        ):
            if self.run_step("Oxlint", ["npm", "run", "lint"]):
                self.metrics["lint"] = "Pass"

        if not self._maybe_skip_for_stack(
            "biome", "Biome Check", self.package_json, "package.json absent"
        ):
            if self.run_step("Biome Check", ["npm", "run", "format"]):
                self.metrics["biome"] = "Pass"

        if not self._maybe_skip_for_stack(
            "clippy", "Clippy", self.cargo_toml, "src-tauri/Cargo.toml absent"
        ):
            if self.run_step(
                "Clippy",
                ["cargo", "clippy", "--all-targets", "--", "-D", "warnings"],
                cwd=self.repo_root / "src-tauri",
                env_update={"SQLX_OFFLINE": "1"},
            ):
                self.metrics["clippy"] = "Pass"

        if not self._maybe_skip_for_stack(
            "rust_fmt", "Rust Fmt", self.cargo_toml, "src-tauri/Cargo.toml absent"
        ):
            if self.run_step(
                "Rust Fmt",
                ["cargo", "fmt", "--check"],
                cwd=self.repo_root / "src-tauri",
            ):
                self.metrics["rust_fmt"] = "Pass"

        if not self._maybe_skip_for_stack(
            "tsc", "TSC", self.package_json, "package.json absent"
        ):
            print("  TSC...", flush=True)
            self._vprint(f"\n{BLUE}▶ Running TypeScript Check (TSC)...{NC}")
            tsc_res = subprocess.run(
                ["npx", "tsc", "--noEmit"],
                cwd=self.repo_root,
                capture_output=True,
                text=True,
            )
            if tsc_res.returncode == 0:
                self._vprint(f"{GREEN}✓ TSC: Pass{NC}")
                self.metrics["tsc"] = "Pass"
            else:
                err_count = len(re.findall(r"error TS", tsc_res.stdout))
                self._vprint(f"{ORANGE}⚠️  TSC: {err_count} errors found{NC}")
                self.metrics["tsc"] = f"{err_count} errors"
                self.suite_failed = True
                if not self.verbose and tsc_res.stdout.strip():
                    self.failures["TSC"] = tsc_res.stdout.strip()

        self._print_stack_summary()
        self.print_report()
        return not self.suite_failed

    def _print_stack_summary(self) -> None:
        """Group skipped-for-stack checks by reason and print a consolidated notice.
        Makes "the stack is partial — these checks didn't run" highly visible
        rather than buried in inline output."""
        if not self._skipped_for_stack:
            return

        by_reason: defaultdict[str, list[str]] = defaultdict(list)
        for reason, check in self._skipped_for_stack:
            by_reason[reason].append(check)

        total = len(self._skipped_for_stack)
        print(
            f"\n{BLUE}ℹ Stack components not detected — {total} check{'s' if total != 1 else ''} skipped:{NC}"
        )
        for reason, checks in by_reason.items():
            joined = ", ".join(checks)
            print(f"{BLUE}  • {reason} → {joined} ({len(checks)}){NC}")
        print(
            f"{BLUE}\n  Once you scaffold the stack, these checks will activate automatically.{NC}"
        )

    def print_report(self):
        print(f"\n{BLUE}🚀 Quality Report{NC}")
        print(f"| {'Check':<20} | {'Status':<30} |")
        print(f"|{'-' * 22}|{'-' * 32}|")

        for key, value in self.metrics.items():
            name = key.replace("_", " ").capitalize()
            if value == "Pass":
                status_str = f"{GREEN}✅ Pass{NC}"
            elif value == "SKIPPED":
                status_str = f"{BLUE}⏩ Skipped{NC}"
            elif value == "Pending":
                status_str = f"{RED}❌ Fail{NC}"
            elif (
                "errors" in value
                or "warnings" in value
                or "Uncommitted" in value
                or "Stale" in value
            ):
                status_str = f"{ORANGE}⚠️  {value}{NC}"
            else:
                status_str = f"{RED}❌ {value}{NC}"

            print(f"| {name:<20} | {status_str:<40} |")

        if self.suite_failed:
            print(f"\n{RED}❌ SUITE FAILED{NC}")
            if self.failures:
                print(f"\n{BLUE}— Failure details —{NC}")
                for step, output in self.failures.items():
                    print(f"\n{RED}▶ {step}{NC}")
                    print(output)
        else:
            print(f"\n{GREEN}✨ ALL CHECKS PASSED{NC}\n")


if __name__ == "__main__":
    is_fast = "--fast" in sys.argv
    is_verbose = "--verbose" in sys.argv
    checker = QualityChecker(fast_mode=is_fast, verbose=is_verbose)
    if not checker.run_all():
        sys.exit(1)
