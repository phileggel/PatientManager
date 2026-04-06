#!/usr/bin/env python3
import subprocess
import sys
import os
import re
from pathlib import Path
from typing import List, Optional

# ANSI Colors
BLUE = "\033[0;34m"
GREEN = "\033[0;32m"
RED = "\033[0;31m"
ORANGE = "\033[0;33m"
YELLOW = "\033[1;33m"
NC = "\033[0m"


class QualityChecker:
    def __init__(self, fast_mode: bool = False):
        self.repo_root = Path(__file__).parent.parent
        self.fast_mode = fast_mode
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

    def print_header(self, title: str):
        print(f"\n{BLUE}🚀 {title}{NC}")
        print(f"{BLUE}═══════════════════════════════════════════════════════════{NC}")

    def run_step(
        self,
        name: str,
        cmd: List[str],
        cwd: Optional[Path] = None,
        env_update: Optional[dict] = None,
    ) -> bool:
        """Exécute une commande en affichant la sortie en temps réel dans le terminal."""
        print(f"\n{BLUE}▶ Running {name}...{NC}")

        current_env = os.environ.copy()
        if env_update:
            current_env.update(env_update)

        try:
            # On ne capture pas stdout/stderr ici pour laisser le flux défiler en direct
            result = subprocess.run(cmd, cwd=cwd or self.repo_root, env=current_env)

            success = result.returncode == 0
            if success:
                print(f"{GREEN}✓ {name}: Passed{NC}")
            else:
                print(f"{RED}✗ {name}: Failed (Exit {result.returncode}){NC}")
                self.suite_failed = True
            return success
        except Exception as e:
            print(f"{RED}✗ {name}: Exception: {e}{NC}")
            self.suite_failed = True
            return False

    def check_sqlx(self) -> bool:
        """Vérification spécifique SQLx Offline avec affichage."""
        print(f"\n{BLUE}▶ Checking SQLx Integrity...{NC}")
        sqlx_dir = self.repo_root / "src-tauri" / ".sqlx"

        if not sqlx_dir.exists():
            print(f"{YELLOW}ℹ SQLx directory not found, skipping.{NC}")
            self.metrics["sqlx"] = "N/A"
            return True

        # 1. Check unstaged changes (staged changes are fine — they're part of the current commit)
        status = subprocess.run(
            ["git", "diff", "--name-only", str(sqlx_dir)],
            capture_output=True,
            text=True,
        ).stdout
        if status.strip():
            print(
                f"{RED}✗ SQLx: Unstaged changes in .sqlx/. Run 'just prepare-sqlx' and stage the result.{NC}"
            )
            self.metrics["sqlx"] = "Uncommitted"
            self.suite_failed = True
            return False

        # 2. Check prepare --check
        success = self.run_step(
            "SQLx Prepare Check",
            ["cargo", "sqlx", "prepare", "--check"],
            cwd=self.repo_root / "src-tauri",
        )
        self.metrics["sqlx"] = "Pass" if success else "Stale"
        return success

    def run_all(self):
        self.print_header("Quality Check Suite")

        # --- Section Tests & Build ---
        if not self.fast_mode:
            # React
            if self.run_step("React Tests", ["npm", "test", "--", "--run"]):
                self.metrics["react_tests"] = "Pass"

            # Rust Lib
            if self.run_step(
                "Rust Lib Tests",
                ["cargo", "test", "--lib"],
                cwd=self.repo_root / "src-tauri",
                env_update={"SQLX_OFFLINE": "1"},
            ):
                self.metrics["rust_lib"] = "Pass"

            # Rust Behavior
            if self.run_step(
                "Rust Behavior Tests",
                ["cargo", "test", "--tests"],
                cwd=self.repo_root / "src-tauri",
                env_update={"SQLX_OFFLINE": "1"},
            ):
                self.metrics["rust_beh"] = "Pass"

            # Build
            if self.run_step("Application Build", ["npm", "run", "build"]):
                self.metrics["build"] = "Pass"
        else:
            print(f"{YELLOW}⏩ Fast mode: skipping tests and build.{NC}")

        # --- Section Database & Linting ---
        self.check_sqlx()

        if self.run_step("Oxlint", ["npm", "run", "lint"]):
            self.metrics["lint"] = "Pass"

        if self.run_step("Biome Check", ["npm", "run", "format"]):
            self.metrics["biome"] = "Pass"

        if self.run_step(
            "Clippy",
            ["cargo", "clippy", "--all-targets", "--", "-D", "warnings"],
            cwd=self.repo_root / "src-tauri",
        ):
            self.metrics["clippy"] = "Pass"

        if self.run_step(
            "Rust Fmt", ["cargo", "fmt", "--check"], cwd=self.repo_root / "src-tauri"
        ):
            self.metrics["rust_fmt"] = "Pass"

        # TypeScript (TSC) - On capture juste celui-là pour compter les erreurs sans polluer
        print(f"\n{BLUE}▶ Running TypeScript Check (TSC)...{NC}")
        tsc_res = subprocess.run(
            ["npx", "tsc", "--noEmit"],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
        )
        if tsc_res.returncode == 0:
            print(f"{GREEN}✓ TSC: Pass{NC}")
            self.metrics["tsc"] = "Pass"
        else:
            err_count = len(re.findall(r"error TS", tsc_res.stdout))
            print(f"{ORANGE}⚠️  TSC: {err_count} errors found{NC}")
            self.metrics["tsc"] = f"{err_count} errors"

        self.print_report()
        return not self.suite_failed

    def print_report(self):
        self.print_header("Final Quality Report")
        print(f"| {'Check':<20} | {'Status':<30} |")
        print(f"|{'-' * 22}|{'-' * 32}|")

        for key, value in self.metrics.items():
            name = key.replace("_", " ").capitalize()
            if value == "Pass":
                status_str = f"{GREEN}✅ Pass{NC}"
            elif value == "SKIPPED":
                status_str = f"{YELLOW}⏩ Skipped{NC}"
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

            print(f"| {name:<20} | {status_str:<40} |")  # Ajusté pour les codes couleur

        if self.suite_failed:
            print(f"\n{RED}❌ SUITE FAILED - Check logs above{NC}\n")
        else:
            print(f"\n{GREEN}✨ ALL CHECKS PASSED{NC}\n")


if __name__ == "__main__":
    is_fast = "--fast" in sys.argv
    checker = QualityChecker(fast_mode=is_fast)
    if not checker.run_all():
        sys.exit(1)
