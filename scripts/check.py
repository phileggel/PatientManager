#!/usr/bin/env python3
import argparse
import os
import re
import subprocess
import sys
import threading
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import List, Optional

# Semantic ANSI colors. Use these by *meaning* (INFO, SUCCESS, …), not by hue —
# keeps call sites readable and makes the palette swappable. Respects NO_COLOR=1.
if os.environ.get("NO_COLOR"):
    INFO = SUCCESS = FAILURE = WARNING = RESET = ""
else:
    INFO = "\033[0;34m"  # blue   — neutral/informational
    SUCCESS = "\033[0;32m"  # green  — pass
    FAILURE = "\033[0;31m"  # red    — fail
    WARNING = "\033[0;33m"  # orange — soft fail (errors counted, stale, etc.)
    RESET = "\033[0m"

# Metric status constants. Keep these explicit so call sites can't typo a
# state and silently miscategorise the result in the report.
STATUS_PASS = "Pass"
STATUS_SKIPPED = "SKIPPED"
STATUS_PENDING = "Pending"  # never-ran sentinel — rendered as Fail
STATUS_STALE = "Stale"
STATUS_UNCOMMITTED = "Uncommitted"
# Variable-detail warning values use the suffix " errors" / " warnings"
# (e.g. "3 errors") — recognised by `_format_status`.

# Strip ANSI escape sequences when measuring visible cell width for the
# report table. Needed because `f"{s:<30}"` pads by string length, which
# would over-pad when the string carries color codes and under-pad under
# NO_COLOR=1.
_ANSI_RE = re.compile(r"\033\[[0-9;]*m")


def _pad_visible(s: str, width: int) -> str:
    """Pad `s` to `width` visible columns, ignoring ANSI escape codes."""
    visible_len = len(_ANSI_RE.sub("", s))
    return s + " " * max(0, width - visible_len)


class QualityChecker:
    def __init__(
        self,
        fast_mode: bool = False,
        verbose: bool = False,
        sequential: bool = False,
        frontend_only: bool = False,
        backend_only: bool = False,
        format_only: bool = False,
        skip_tests: bool = False,
    ):
        self.repo_root = Path(__file__).parent.parent
        self.fast_mode = fast_mode
        self.verbose = verbose
        # Full mode runs frontend + backend groups concurrently by default.
        # --sequential forces the old serial order (useful for clean output
        # when debugging a single step's failure). Single-group modes
        # (--frontend / --backend / --format / --fast) imply sequential —
        # there's nothing to parallelise against.
        self.sequential = sequential or fast_mode or frontend_only or backend_only
        self.frontend_only = frontend_only
        self.backend_only = backend_only
        self.format_only = format_only
        # --skip-tests skips ONLY test execution (vitest, cargo test). Build,
        # lint, biome, tsc, sqlx, clippy, fmt still run. Use case: CI that
        # computes coverage separately (e.g. `npm run test:coverage` or
        # `cargo tarpaulin`) — avoids running tests twice. Contrast with
        # --fast which also skips build.
        self.skip_tests = skip_tests
        # Two distinct locks: `_lock` guards mutations to shared state
        # (metrics / failures / skip list); `_print_lock` serialises stdout
        # writes so parallel-mode progress lines don't interleave mid-write.
        # Keeping them separate avoids head-of-line blocking when a worker
        # writes output while another worker mutates state.
        self._lock = threading.Lock()
        self._print_lock = threading.Lock()
        self.metrics = {
            "react_tests": STATUS_SKIPPED,
            "rust_lib": STATUS_SKIPPED,
            "rust_beh": STATUS_SKIPPED,
            "build": STATUS_SKIPPED,
            "sqlx": STATUS_PENDING,
            "lint": STATUS_PENDING,
            "biome": STATUS_PENDING,
            "clippy": STATUS_PENDING,
            "rust_fmt": STATUS_PENDING,
            "tsc": STATUS_PENDING,
        }
        self.suite_failed = False
        self.failures: dict[str, str] = {}

        # Stack markers — presence-of-file gates each check.
        # Partial-stack projects (e.g. no-DB Tauri, FE-only, kit-only bootstrap)
        # skip the gated checks instead of failing.
        self.package_json = self.repo_root / "package.json"
        self.cargo_toml = self.repo_root / "src-tauri" / "Cargo.toml"
        self.sqlx_dir = self.repo_root / "src-tauri" / ".sqlx"
        self._skipped_for_stack: list[tuple[str, str]] = []  # (reason, check_name)

    # --- Thread-safe state mutators -----------------------------------------
    # Every shared-state write goes through one of these. The lock stays
    # invisible at call sites, and the helpers document the only ways the
    # checker is allowed to mutate its results.

    def _set_metric(self, key: str, value: str) -> None:
        with self._lock:
            self.metrics[key] = value

    def _record_failure(self, step: str, output: Optional[str] = None) -> None:
        with self._lock:
            self.suite_failed = True
            if output:
                self.failures[step] = output

    def _record_stack_skip(self, metric_key: str, check_name: str, reason: str) -> None:
        with self._lock:
            self.metrics[metric_key] = STATUS_SKIPPED
            self._skipped_for_stack.append((reason, check_name))

    def _safe_print(self, *args, file=None, **kwargs) -> None:
        """Lock-serialised `print`. Use for any user-visible output that may
        race with a parallel worker — keeps each `print` atomic so a step's
        progress line doesn't get spliced into another step's output."""
        with self._print_lock:
            print(*args, file=file or sys.stdout, **kwargs)

    def _vprint(self, *args, **kwargs):
        if self.verbose:
            self._safe_print(*args, **kwargs)

    def _maybe_skip_for_stack(
        self, metric_key: str, check_name: str, marker: Path, reason: str
    ) -> bool:
        """Return True if the check should be skipped (stack marker absent).
        Records the skip in metrics and in the stack-summary list."""
        if marker.exists():
            return False
        self._safe_print(
            f"  {check_name}... {INFO}⏩ skipped ({reason}){RESET}", flush=True
        )
        self._record_stack_skip(metric_key, check_name, reason)
        return True

    def print_header(self, title: str):
        self._vprint(f"\n{INFO}🚀 {title}{RESET}")
        self._vprint(
            f"{INFO}═══════════════════════════════════════════════════════════{RESET}"
        )

    def run_step(
        self,
        name: str,
        cmd: List[str],
        cwd: Optional[Path] = None,
        env_update: Optional[dict] = None,
    ) -> bool:
        self._safe_print(f"  {name}...", flush=True)
        self._vprint(f"\n{INFO}▶ Running {name}...{RESET}")

        current_env = os.environ.copy()
        if env_update:
            current_env.update(env_update)

        # 10-minute cap on any single step. Cargo builds rarely take more
        # than 5 minutes on a warm cache; vitest the same. A genuine hang
        # (broken workspace, missing binary in a weird state) needs to
        # surface as a clear failure, not consume the CI budget silently.
        try:
            if self.verbose:
                result = subprocess.run(
                    cmd,
                    cwd=cwd or self.repo_root,
                    env=current_env,
                    timeout=600,
                )
                output = ""
            else:
                result = subprocess.run(
                    cmd,
                    cwd=cwd or self.repo_root,
                    env=current_env,
                    capture_output=True,
                    text=True,
                    timeout=600,
                )
                output = (result.stdout + result.stderr).strip()

            success = result.returncode == 0
            if success:
                self._vprint(f"{SUCCESS}✓ {name}: Passed{RESET}")
            else:
                self._vprint(
                    f"{FAILURE}✗ {name}: Failed (Exit {result.returncode}){RESET}"
                )
                self._record_failure(name, output)
            return success
        except FileNotFoundError:
            # Specific path for the most common cause of failure: tool
            # missing on PATH. Generic "[Errno 2] No such file or
            # directory: 'npm'" is unhelpful — point the user at the fix.
            missing = cmd[0] if cmd else "<unknown>"
            hint = {
                "npm": "install Node (https://nodejs.org) and re-run",
                "npx": "install Node (https://nodejs.org) and re-run",
                "cargo": "install Rust (https://rustup.rs) and re-run",
            }.get(missing, "install the tool or remove this step")
            msg = f"{missing} not found on PATH — {hint}"
            self._vprint(f"{FAILURE}✗ {name}: {msg}{RESET}")
            self._record_failure(name, msg)
            return False
        except (OSError, subprocess.SubprocessError) as e:
            # OSError catches PermissionError and similar. SubprocessError
            # covers TimeoutExpired (10-minute cap above) and
            # CalledProcessError. Bare `Exception` would swallow real
            # programming errors (TypeError on bad call shape, etc.) —
            # keep those surfaced as crashes so they get fixed.
            self._vprint(f"{FAILURE}✗ {name}: Exception: {e}{RESET}")
            self._record_failure(name, str(e))
            return False

    def check_sqlx(self) -> bool:
        if self._maybe_skip_for_stack(
            "sqlx", "SQLx Integrity", self.sqlx_dir, "src-tauri/.sqlx/ absent"
        ):
            return True

        self._vprint(f"\n{INFO}▶ Checking SQLx Integrity...{RESET}")
        # check=False so a broken git invocation surfaces as a clean check
        # failure instead of propagating CalledProcessError out of the
        # executor and crashing the suite mid-report.
        result = subprocess.run(
            ["git", "diff", "--name-only", str(self.sqlx_dir)],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            self._set_metric("sqlx", STATUS_STALE)
            self._record_failure("SQLx", f"git diff failed: {result.stderr.strip()}")
            return False
        status = result.stdout
        if status.strip():
            self._vprint(
                f"{FAILURE}✗ SQLx: Unstaged changes in .sqlx/. Run 'just prepare-sqlx' and stage the result.{RESET}"
            )
            self._set_metric("sqlx", STATUS_UNCOMMITTED)
            self._record_failure(
                "SQLx",
                "Unstaged changes in .sqlx/. Run 'just prepare-sqlx' and stage the result.",
            )
            return False

        success = self.run_step(
            "SQLx Prepare Check",
            ["cargo", "sqlx", "prepare", "--check"],
            cwd=self.repo_root / "src-tauri",
        )
        self._set_metric("sqlx", STATUS_PASS if success else STATUS_STALE)
        return success

    def run_all(self):
        self.print_header("Quality Check Suite")

        if self.fast_mode:
            self._vprint(f"{INFO}⏩ Fast mode: skipping tests and build.{RESET}")
        elif self.skip_tests:
            self._vprint(
                f"{INFO}⏩ --skip-tests: skipping test execution; build/lint/format still run.{RESET}"
            )

        # Mark groups that won't run as SKIPPED so the final report doesn't
        # render their "Pending" defaults as failures. These writes run on
        # the main thread before the executor starts, so they're race-free
        # by construction — but go through `_set_metric` anyway to honour
        # the helper-only-writes contract documented above.
        if self.format_only:
            for key in (
                "react_tests",
                "rust_lib",
                "rust_beh",
                "build",
                "sqlx",
                "clippy",
                "tsc",
            ):
                self._set_metric(key, STATUS_SKIPPED)
        elif self.frontend_only:
            for key in ("rust_lib", "rust_beh", "sqlx", "clippy", "rust_fmt"):
                self._set_metric(key, STATUS_SKIPPED)
        elif self.backend_only:
            for key in ("react_tests", "build", "lint", "biome", "tsc"):
                self._set_metric(key, STATUS_SKIPPED)

        if self.format_only:
            self._run_format_only()
        elif self.frontend_only:
            self._run_frontend_group()
        elif self.backend_only:
            self._run_backend_group()
        elif self.sequential:
            self._run_frontend_group()
            self._run_backend_group()
        else:
            # Frontend (no cargo) and backend (cargo) groups don't share any
            # build artifacts or env state — running them on separate threads
            # roughly halves wall time on warm cache. Cargo serialises itself
            # via target/.cargo-lock so two cargo invocations in the same
            # process can't conflict; threads only race on shared Python state
            # (metrics / failures), which the lock guards.
            with ThreadPoolExecutor(max_workers=2) as ex:
                fe = ex.submit(self._run_frontend_group)
                be = ex.submit(self._run_backend_group)
                fe.result()
                be.result()

        self._print_stack_summary()
        self.print_report()
        return not self.suite_failed

    def _run_format_only(self):
        """Format-only: oxlint + biome + cargo fmt --check. Sub-second.
        Useful as a super-fast pre-flight before committing."""
        if not self._maybe_skip_for_stack(
            "lint", "Oxlint", self.package_json, "package.json absent"
        ):
            if self.run_step("Oxlint", ["npm", "run", "lint"]):
                self._set_metric("lint", STATUS_PASS)

        if not self._maybe_skip_for_stack(
            "biome", "Biome Check", self.package_json, "package.json absent"
        ):
            if self.run_step("Biome Check", ["npm", "run", "format"]):
                self._set_metric("biome", STATUS_PASS)

        if not self._maybe_skip_for_stack(
            "rust_fmt", "Rust Fmt", self.cargo_toml, "src-tauri/Cargo.toml absent"
        ):
            if self.run_step(
                "Rust Fmt",
                ["cargo", "fmt", "--check"],
                cwd=self.repo_root / "src-tauri",
            ):
                self._set_metric("rust_fmt", STATUS_PASS)

    def _run_frontend_group(self):
        """Frontend steps: vitest, build, oxlint, biome, tsc."""
        run_tests = not self.fast_mode and not self.skip_tests

        if run_tests:
            if not self._maybe_skip_for_stack(
                "react_tests", "React Tests", self.package_json, "package.json absent"
            ):
                if self.run_step("React Tests", ["npm", "test", "--", "--run"]):
                    self._set_metric("react_tests", STATUS_PASS)

        if not self.fast_mode:
            if not self._maybe_skip_for_stack(
                "build", "Application Build", self.package_json, "package.json absent"
            ):
                if self.run_step("Application Build", ["npm", "run", "build"]):
                    self._set_metric("build", STATUS_PASS)

        if not self._maybe_skip_for_stack(
            "lint", "Oxlint", self.package_json, "package.json absent"
        ):
            if self.run_step("Oxlint", ["npm", "run", "lint"]):
                self._set_metric("lint", STATUS_PASS)

        if not self._maybe_skip_for_stack(
            "biome", "Biome Check", self.package_json, "package.json absent"
        ):
            if self.run_step("Biome Check", ["npm", "run", "format"]):
                self._set_metric("biome", STATUS_PASS)

        if not self._maybe_skip_for_stack(
            "tsc", "TSC", self.package_json, "package.json absent"
        ):
            self._safe_print("  TSC...", flush=True)
            self._vprint(f"\n{INFO}▶ Running TypeScript Check (TSC)...{RESET}")
            tsc_res = subprocess.run(
                ["npx", "tsc", "--noEmit"],
                cwd=self.repo_root,
                capture_output=True,
                text=True,
                timeout=600,
            )
            if tsc_res.returncode == 0:
                self._vprint(f"{SUCCESS}✓ TSC: Pass{RESET}")
                self._set_metric("tsc", STATUS_PASS)
            else:
                err_count = len(re.findall(r"error TS", tsc_res.stdout))
                self._vprint(f"{WARNING}⚠️  TSC: {err_count} errors found{RESET}")
                self._set_metric("tsc", f"{err_count} errors")
                err_output = tsc_res.stdout.strip() if not self.verbose else ""
                self._record_failure("TSC", err_output)

    def _run_backend_group(self):
        """Backend steps: rust tests, sqlx, clippy, fmt."""
        run_tests = not self.fast_mode and not self.skip_tests

        if run_tests:
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
                    env_update={"SQLX_OFFLINE": "true"},
                ):
                    self._set_metric("rust_lib", STATUS_PASS)

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
                    env_update={"SQLX_OFFLINE": "true"},
                ):
                    self._set_metric("rust_beh", STATUS_PASS)

        self.check_sqlx()

        if not self._maybe_skip_for_stack(
            "clippy", "Clippy", self.cargo_toml, "src-tauri/Cargo.toml absent"
        ):
            if self.run_step(
                "Clippy",
                ["cargo", "clippy", "--all-targets", "--", "-D", "warnings"],
                cwd=self.repo_root / "src-tauri",
                env_update={"SQLX_OFFLINE": "true"},
            ):
                self._set_metric("clippy", STATUS_PASS)

        if not self._maybe_skip_for_stack(
            "rust_fmt", "Rust Fmt", self.cargo_toml, "src-tauri/Cargo.toml absent"
        ):
            if self.run_step(
                "Rust Fmt",
                ["cargo", "fmt", "--check"],
                cwd=self.repo_root / "src-tauri",
            ):
                self._set_metric("rust_fmt", STATUS_PASS)

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
            f"\n{INFO}ℹ Stack components not detected — {total} check{'s' if total != 1 else ''} skipped:{RESET}"
        )
        # Sort outer reasons and inner check names so the summary is stable
        # across parallel runs (workers append in non-deterministic order).
        for reason in sorted(by_reason):
            checks = sorted(by_reason[reason])
            joined = ", ".join(checks)
            print(f"{INFO}  • {reason} → {joined} ({len(checks)}){RESET}")
        print(
            f"{INFO}\n  Once you scaffold the stack, these checks will activate automatically.{RESET}"
        )

    def _format_status(self, value: str) -> str:
        """Render a metric value into a coloured status cell.
        Variable-detail warnings (e.g. "3 errors") are recognised by suffix,
        not substring — `endswith` won't false-positive on a step *name* that
        happens to contain the word."""
        if value == STATUS_PASS:
            return f"{SUCCESS}✅ Pass{RESET}"
        if value == STATUS_SKIPPED:
            return f"{INFO}⏩ Skipped{RESET}"
        if value == STATUS_PENDING:
            return f"{FAILURE}❌ Fail{RESET}"
        if (
            value in (STATUS_STALE, STATUS_UNCOMMITTED)
            or value.endswith(" errors")
            or value.endswith(" warnings")
        ):
            return f"{WARNING}⚠️  {value}{RESET}"
        return f"{FAILURE}❌ {value}{RESET}"

    def print_report(self):
        print(f"\n{INFO}🚀 Quality Report{RESET}")
        print(f"| {'Check':<20} | {'Status':<30} |")
        print(f"|{'-' * 22}|{'-' * 32}|")

        for key, value in self.metrics.items():
            name = key.replace("_", " ").capitalize()
            # Pad the status cell to 30 *visible* columns so the table
            # aligns whether ANSI codes are present or stripped (NO_COLOR).
            # `f"{s:<30}"` pads by string length, which under NO_COLOR
            # padded to 30 but with color codes inflated the cell to ~40.
            status_str = _pad_visible(self._format_status(value), 30)
            print(f"| {name:<20} | {status_str} |")

        if self.suite_failed:
            # Failures go to stderr so the report can be redirected /
            # piped without dragging the error block into downstream
            # consumers. Compare merge.py's stderr discipline.
            print(f"\n{FAILURE}❌ SUITE FAILED{RESET}", file=sys.stderr)
            if self.failures:
                print(f"\n{INFO}— Failure details —{RESET}", file=sys.stderr)
                for step, output in self.failures.items():
                    print(f"\n{FAILURE}▶ {step}{RESET}", file=sys.stderr)
                    print(output, file=sys.stderr)
        else:
            print(f"\n{SUCCESS}✨ ALL CHECKS PASSED{RESET}\n")


def _parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Kit quality check — runs lint, format, tests, and build.",
    )
    parser.add_argument(
        "--fast",
        action="store_true",
        help="Lint + format only (skip tests and build); used by pre-commit hook",
    )
    parser.add_argument(
        "--skip-tests",
        dest="skip_tests",
        action="store_true",
        help="Skip only test execution; build, lint, and format still run",
    )
    parser.add_argument(
        "--sequential",
        action="store_true",
        help="Run frontend and backend groups serially (default: parallel)",
    )
    parser.add_argument(
        "--format",
        dest="format_only",
        action="store_true",
        help="Sub-second pre-flight: oxlint + biome + cargo fmt --check only",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Stream subprocess output instead of capturing it",
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--frontend",
        action="store_true",
        help="Run frontend group only (vitest, build, oxlint, biome, tsc)",
    )
    group.add_argument(
        "--backend",
        action="store_true",
        help="Run backend group only (cargo test, sqlx, clippy, fmt)",
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args()
    checker = QualityChecker(
        fast_mode=args.fast,
        verbose=args.verbose,
        sequential=args.sequential,
        frontend_only=args.frontend,
        backend_only=args.backend,
        format_only=args.format_only,
        skip_tests=args.skip_tests,
    )
    if not checker.run_all():
        sys.exit(1)
