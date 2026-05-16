#!/usr/bin/env python3
"""
Release script for YourProject.

Automates version bumping, changelog generation, and git tagging.

Process:
  1. Run all quality checks via check.py (tests, lint, SQLx, build)
  2. Analyze git history since last tag
  3. Determine version bump using semver
  4. Update version in package.json, Cargo.toml, and tauri.conf.json
  5. Create/update CHANGELOG.md
  6. Format files via just format
  7. Create commit and git tag

Usage:
  python3 release.py [--dry-run] [--preview] [--version X.Y.Z] [-y]

Options:
  --dry-run           Preview release without making changes (still updates files locally + creates local commit/tag)
  --preview           Read-only: print the suggested version and exit. Skips tests, file edits, commits, pushes.
  --version X.Y.Z     Force a specific version instead of auto-calculating from commits
  -y, --yes           Skip confirmation prompt (auto-confirm suggested version)
"""

import argparse
import os
import subprocess
import json
import re
import sys
from check import QualityChecker
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List

# ANSI colors (respect NO_COLOR=1)
if os.environ.get("NO_COLOR"):
    GREEN = YELLOW = RED = BLUE = NC = ""
else:
    GREEN = "\033[0;32m"
    YELLOW = "\033[0;33m"
    RED = "\033[0;31m"
    BLUE = "\033[0;34m"
    NC = "\033[0m"

# Changelog constants
CHANGELOG_INTRO = (
    "All notable changes to this project will be documented in this file.\n\n"
    "The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),\n"
    "and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)."
)

# Default branch this release script targets. Override in a downstream fork
# if the project uses `master` / `trunk` / etc.
MAIN_BRANCH = "main"


class ReleaseManager:
    def __init__(
        self,
        dry_run: bool = False,
        forced_version: Optional[str] = None,
        yes: bool = False,
        preview: bool = False,
    ):
        self.repo_root = Path(__file__).parent.parent
        self.current_version = self.get_current_version()
        self.commits: List[dict] = []
        self.breaking_changes = 0
        self.features = 0
        self.fixes = 0
        self.new_version: Optional[str] = None
        self.dry_run = dry_run
        self.forced_version = forced_version
        self.yes = yes
        self.preview = preview

    def get_current_version(self) -> str:
        """Get current version from package.json."""
        package_json = self.repo_root / "package.json"
        with open(package_json, encoding="utf-8") as f:
            data = json.load(f)
        return data["version"]

    def get_latest_tag(self) -> Optional[str]:
        """Get the latest git tag."""
        try:
            result = subprocess.run(
                ["git", "describe", "--tags", "--abbrev=0"],
                cwd=self.repo_root,
                capture_output=True,
                text=True,
                check=True,
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError:
            return None

    def get_commits_since_tag(self, tag: Optional[str]) -> List[dict]:
        """Get commits since the last tag (subject + body to capture BREAKING CHANGE footers)."""
        commit_range = f"{tag}..HEAD" if tag else "HEAD"

        result = subprocess.run(
            ["git", "log", commit_range, "--pretty=format:%s%n%b%x00"],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=True,
        )

        entries = [e.strip() for e in result.stdout.split("\x00") if e.strip()]
        return [self.parse_commit_message(entry) for entry in entries]

    def parse_commit_message(self, message: str) -> dict:
        """Parse conventional commit message format: type[(scope)][!]: description."""
        match = re.match(
            r"^(feat|fix|docs|chore|refactor|test|ci)(\(.+\))?(!)?: (.+)$",
            message,
            re.DOTALL,
        )

        if not match:
            return {"type": "other", "scope": None, "description": message}

        commit_type, scope, bang, description = match.groups()
        is_breaking = bang == "!" or "BREAKING CHANGE" in message

        return {
            "type": commit_type,
            "scope": scope,
            "description": description,
            "breaking": is_breaking,
            "original": message,
        }

    def analyze_commits(self, commits: List[dict]) -> None:
        """Count breaking changes, features, and fixes."""
        self.commits = commits

        for commit in commits:
            if commit.get("breaking"):
                self.breaking_changes += 1
            elif commit["type"] == "feat":
                self.features += 1
            elif commit["type"] == "fix":
                self.fixes += 1

    def calculate_new_version(self, current: str) -> str:
        """Calculate new version based on semver rules."""
        major, minor, patch = map(int, current.split("."))

        if self.breaking_changes > 0:
            major += 1
            minor = patch = 0
        elif self.features > 0:
            minor += 1
            patch = 0
        elif self.fixes > 0:
            patch += 1

        return f"{major}.{minor}.{patch}"

    def _format_mode_prefix(self) -> str:
        """Return dry-run prefix if applicable."""
        return f"{BLUE}[DRY-RUN]{NC} " if self.dry_run else ""

    def show_analysis(self) -> None:
        """Display release analysis."""
        print(f"\n{BLUE}=== Release Analysis ==={NC}")
        print(f"Current version: {BLUE}{self.current_version}{NC}")
        print(f"Latest tag: {BLUE}{self.get_latest_tag() or 'none'}{NC}")
        print("\nCommits since last release:")
        print(f"  {BLUE}Breaking changes: {self.breaking_changes}{NC}")
        print(f"  {GREEN}Features: {self.features}{NC}")
        print(f"  {BLUE}Fixes: {self.fixes}{NC}")
        print(f"\nSuggested version: {GREEN}{self.new_version}{NC}\n")

    def ask_confirmation(self) -> bool:
        """Ask user to confirm release. 'v' allows version override."""
        while True:
            response = (
                input(f"{BLUE}Confirm release v{self.new_version}? (y/n/v): {NC}")
                .lower()
                .strip()
            )

            if response == "y":
                return True
            elif response == "n":
                return False
            elif response == "v":
                self.ask_version_override()
                self.show_analysis()
            else:
                print("Invalid input. Use y (yes), n (no), or v (version override)")

    def ask_version_override(self) -> None:
        """Prompt user to manually set version."""
        while True:
            version = input(f"{BLUE}Enter version (e.g., 0.2.0): {NC}").strip()
            if re.match(r"^\d+\.\d+\.\d+$", version):
                self.new_version = version
                break
            print("Invalid version format. Use X.Y.Z")

    def _update_json_file(self, file_path: Path, key: str) -> None:
        """Update version key in JSON file."""
        with open(file_path, encoding="utf-8") as f:
            data = json.load(f)
        data[key] = self.new_version
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")

    def update_version_files(self) -> None:
        """Update version in package.json, Cargo.toml, and tauri.conf.json."""
        mode = self._format_mode_prefix()
        print(f"{BLUE}{mode}Updating version files...{NC}")

        if self.dry_run:
            print("  → package.json")
            print("  → src-tauri/Cargo.toml")
            print("  → src-tauri/tauri.conf.json")
            return

        self._update_json_file(self.repo_root / "package.json", "version")
        print("  ✓ package.json")

        cargo_toml = self.repo_root / "src-tauri" / "Cargo.toml"
        content = cargo_toml.read_text(encoding="utf-8")
        # Anchor replacement to the [package] section to avoid patching dependency versions
        content = re.sub(
            r'(\[package\].*?version\s*=\s*")[^"]+(")',
            rf"\g<1>{self.new_version}\2",
            content,
            count=1,
            flags=re.DOTALL,
        )
        cargo_toml.write_text(content, encoding="utf-8")
        print("  ✓ src-tauri/Cargo.toml")

        self._update_json_file(
            self.repo_root / "src-tauri" / "tauri.conf.json", "version"
        )
        print("  ✓ src-tauri/tauri.conf.json")

        if not self.dry_run:
            print(f"{BLUE}  Updating src-tauri/Cargo.lock...{NC}")
            try:
                subprocess.run(
                    ["cargo", "metadata", "--format-version", "1"],
                    cwd=self.repo_root / "src-tauri",
                    capture_output=True,
                    check=True,
                )
            except subprocess.CalledProcessError as e:
                # JSON files are already mutated above; if cargo crashes here
                # the working tree is partial. Surface clearly so the user
                # knows to inspect Cargo.toml (most likely a syntax issue
                # introduced by the version edit) and revert if needed.
                print(
                    f"{RED}❌ cargo metadata failed — Cargo.lock not updated.{NC}",
                    file=sys.stderr,
                )
                print(
                    f"{BLUE}   Version files already edited; inspect Cargo.toml syntax or "
                    f"`git checkout -- package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json` to revert.{NC}",
                    file=sys.stderr,
                )
                raise SystemExit(1) from e
            print("  ✓ src-tauri/Cargo.lock updated")

    def _build_changelog_entry(self) -> str:
        """Build new changelog entry from commits."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        entry = f"## [{self.new_version}] - {today}\n"

        if self.breaking_changes > 0:
            entry += "\n### ⚠️ BREAKING CHANGES\n"
            entry += f"- {self.breaking_changes} breaking change(s)\n"

        if self.features > 0:
            entry += "\n### Added\n"
            for commit in self.commits:
                if commit["type"] == "feat":
                    entry += f"- {commit['description']}\n"

        if self.fixes > 0:
            entry += "\n### Fixed\n"
            for commit in self.commits:
                if commit["type"] == "fix":
                    entry += f"- {commit['description']}\n"

        return entry + "\n"

    def update_changelog(self) -> None:
        """Create or update CHANGELOG.md with new version entry."""
        mode = self._format_mode_prefix()
        print(f"{BLUE}{mode}Updating CHANGELOG.md...{NC}")

        if self.dry_run:
            print("  → CHANGELOG.md")
            return

        changelog = self.repo_root / "CHANGELOG.md"
        new_entry = self._build_changelog_entry()

        if changelog.exists():
            existing = changelog.read_text(encoding="utf-8")
            if existing.startswith("# Changelog"):
                lines = existing.split("\n")
                header_end = next(
                    (i for i, line in enumerate(lines) if line.startswith("## [")), 0
                )

                if header_end > 0:
                    header = "\n".join(lines[:header_end])
                    rest = "\n".join(lines[header_end:])
                    content = f"{header}\n{new_entry}{rest}"
                else:
                    content = existing + new_entry
            else:
                content = new_entry + existing
        else:
            content = f"# Changelog\n\n{CHANGELOG_INTRO}\n\n{new_entry}"

        changelog.write_text(content, encoding="utf-8")
        print("  ✓ CHANGELOG.md")

    def format_files(self) -> bool:
        """Run 'just format' to ensure CHANGELOG and code are clean."""
        mode = self._format_mode_prefix()
        print(f"{BLUE}{mode}Running formatters via just...{NC}")

        if self.dry_run:
            print("  → just format")
            return True

        try:
            subprocess.run(
                ["just", "format"],
                cwd=self.repo_root,
                check=True,
                capture_output=True,
                text=True,
            )
            print("  ✓ Files formatted")
            return True
        except subprocess.CalledProcessError as e:
            print(f"{RED}❌ Error during format: {e.stderr or e.stdout}{NC}")
            return False
        except FileNotFoundError:
            print(f'{YELLOW}⚠ "just" command not found. Skipping format.{NC}')
            return True

    def commit_and_tag(self) -> bool:
        """Commit version changes and create git tag."""
        mode = self._format_mode_prefix()
        print(f"{BLUE}{mode}Creating commit and tag...{NC}")

        if self.dry_run:
            print(f"  → Commit: chore: release v{self.new_version}")
            print(f"  → Tag: v{self.new_version}")
            return True

        try:
            subprocess.run(
                [
                    "git",
                    "add",
                    "package.json",
                    "src-tauri/Cargo.toml",
                    "src-tauri/Cargo.lock",
                    "src-tauri/tauri.conf.json",
                    "CHANGELOG.md",
                ],
                cwd=self.repo_root,
                check=True,
            )

            # --no-verify intentionally skips the commit-msg + pre-commit hooks.
            # Waiver: the commit message is fixed by this script (conventional
            # "chore: release vX.Y.Z") so the commit-msg lint is a no-op, and
            # run_tests() already passed the full quality suite so the pre-commit
            # lint pass would be redundant.
            subprocess.run(
                [
                    "git",
                    "commit",
                    "--no-verify",
                    "-m",
                    f"chore: release v{self.new_version}",
                ],
                cwd=self.repo_root,
                check=True,
            )
            print("  ✓ Commit created")

            subprocess.run(
                [
                    "git",
                    "tag",
                    "-a",
                    f"v{self.new_version}",
                    "-m",
                    f"Version {self.new_version}",
                ],
                cwd=self.repo_root,
                check=True,
            )
            print(f"  ✓ Tag created: v{self.new_version}")

            return True
        except subprocess.CalledProcessError as e:
            print(f"{RED}Error: {e}{NC}")
            return False

    def run_tests(self) -> bool:
        """Run the full test suite via the QualityChecker from check.py."""
        print(f"{BLUE}🚀 Running full quality validation...{NC}")

        if self.dry_run:
            print(f"{BLUE}[DRY-RUN] Simulating test suite (check.py){NC}")
            return True

        checker = QualityChecker(fast_mode=False)

        # run_all() streams output directly to the terminal
        success = checker.run_all()

        if not success:
            print(f"\n{RED}❌ Quality validation failed.{NC}")
            print(f"{RED}Fix the errors before attempting a new release.{NC}")
            return False

        print(f"\n{GREEN}✅ Quality validation passed. Moving to versioning...{NC}")
        return True

    def run(self) -> bool:
        """Execute the release workflow."""
        if self.preview:
            banner = f" {BLUE}[PREVIEW MODE — read-only]{NC}"
        elif self.dry_run:
            banner = f" {BLUE}[DRY-RUN MODE]{NC}"
        else:
            banner = ""
        print(f"\n{BLUE}🚀 Release Manager{banner}{NC}\n")

        if not self.preview and not self.run_tests():
            return False

        latest_tag = self.get_latest_tag()
        commits = self.get_commits_since_tag(latest_tag)

        if not commits:
            print(f"{YELLOW}No commits since last tag. Nothing to release.{NC}")
            # Under --preview, "no work pending" is a successful analysis,
            # not a failure. Returning False here would exit 1 and break
            # any CI step doing `release.py --preview` to detect pending
            # releases. Exit 0 with the current version as the answer.
            if self.preview:
                print(
                    f"{GREEN}✨ Preview: no release pending — current version is v{self.current_version}.{NC}\n"
                )
                return True
            return False

        self.analyze_commits(commits)

        if self.forced_version:
            self.new_version = self.forced_version
            print(
                f"{YELLOW}⚠ Version forced to {self.new_version} via --version flag.{NC}"
            )
        else:
            self.new_version = self.calculate_new_version(self.current_version)
            if self.new_version == self.current_version:
                if self.yes and not self.preview:
                    print(
                        f"{RED}❌ No releasable commits (no feat/fix/breaking change since last tag).{NC}"
                    )
                    print(
                        f"{BLUE}   Use --version X.Y.Z to force a version, or remove --yes to confirm interactively.{NC}"
                    )
                    return False
                print(
                    f"{YELLOW}⚠ No releasable commits found (no feat/fix/breaking change since last tag).{NC}"
                )
                if not self.preview:
                    print(
                        f'{BLUE}  Use "v" at the confirmation prompt or --version X.Y.Z to override, or cancel.{NC}'
                    )

        self.show_analysis()

        if self.preview:
            print(f"\n{GREEN}✨ Preview: next release would be v{self.new_version}{NC}")
            print(f"{BLUE}Run without --preview to actually release.{NC}\n")
            return True

        if self.dry_run and self.yes:
            print(
                f"{BLUE}Note: --yes is redundant with --dry-run (no changes are made regardless).{NC}"
            )

        if self.yes:
            print(f"{BLUE}--yes flag set: auto-confirming v{self.new_version}{NC}")
        elif not self.ask_confirmation():
            print(f"{BLUE}Release cancelled.{NC}")
            return False

        self.update_version_files()
        self.update_changelog()

        if not self.format_files():
            print(f"\n{RED}❌ Formatting failed. Release cancelled.{NC}\n")
            return False

        if not self.commit_and_tag():
            return False

        if self.dry_run:
            print(
                f"\n{GREEN}✨ Dry-run completed! Release would be v{self.new_version}{NC}"
            )
            print(f"Run without {BLUE}--dry-run{NC} to apply changes\n")
        else:
            if not self.push_release():
                return False
            print(f"\n{GREEN}✨ Release v{self.new_version} published!{NC}\n")

        return True

    def push_release(self) -> bool:
        """Push commit and tag to origin."""
        print(f"{BLUE}Pushing to origin...{NC}")

        # Safety: ensure we are on main before pushing
        branch = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        if branch != MAIN_BRANCH:
            print(
                f'{RED}❌ Current branch is "{branch}", not "{MAIN_BRANCH}". Release must be run from {MAIN_BRANCH}.{NC}'
            )
            return False

        try:
            # --no-verify intentionally skips the pre-push hook here.
            # Waiver: run_tests() already executed the full quality suite (check.py,
            # tests, build) earlier in this release flow and would have aborted on
            # any failure. Re-running it in the hook would be redundant and slow.
            #
            # --atomic: push branch + tag in one atomic operation so we never end
            # up with the release commit on the branch and no tag (or vice versa).
            # Either both refs land on origin or neither does — the next release
            # run sees a coherent state.
            subprocess.run(
                [
                    "git",
                    "push",
                    "--atomic",
                    "origin",
                    MAIN_BRANCH,
                    f"refs/tags/v{self.new_version}",
                    "--no-verify",
                ],
                cwd=self.repo_root,
                check=True,
            )
            print(
                f"  ✓ {MAIN_BRANCH} + tag v{self.new_version} pushed atomically → GitHub Action triggered"
            )

            return True
        except subprocess.CalledProcessError as e:
            print(f"{RED}Error: {e}{NC}")
            return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Release manager for YourProject.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate release: update files, create local commit + tag, but skip the push. For a fully read-only check use --preview instead.",
    )
    parser.add_argument(
        "--version", metavar="X.Y.Z", help="Force a specific version (e.g. 0.12.1)"
    )
    parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="Skip confirmation prompt (auto-confirm suggested version)",
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Read-only: print the suggested version and exit. Skips tests, file edits, commits, and pushes.",
    )
    args = parser.parse_args()

    if args.version and not re.match(r"^\d+\.\d+\.\d+$", args.version):
        print(f"{RED}❌ Invalid version format: {args.version}. Expected X.Y.Z{NC}")
        sys.exit(1)

    manager = ReleaseManager(
        dry_run=args.dry_run,
        forced_version=args.version,
        yes=args.yes,
        preview=args.preview,
    )
    success = manager.run()
    sys.exit(0 if success else 1)
