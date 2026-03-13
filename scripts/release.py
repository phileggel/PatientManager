#!/usr/bin/env python3
"""
Release script for PatientManager.

Automates version bumping, changelog generation, and git tagging.

Process:
  1. Run all tests (React + Rust) - stops if tests fail
  2. Analyze git history since last tag
  3. Determine version bump using semver
  4. Update version in package.json, Cargo.toml, and tauri.conf.json
  5. Create/update CHANGELOG.md
  6. Create commit and git tag

Usage:
  python3 release.py [--dry-run]

Options:
  --dry-run   Preview release without making changes
"""

import subprocess
import json
import re
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional, List

# ANSI colors
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
RED = '\033[0;31m'
BLUE = '\033[0;34m'
NC = '\033[0m'

# Changelog constants
CHANGELOG_INTRO = (
    'All notable changes to this project will be documented in this file.\n\n'
    'The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),\n'
    'and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).'
)


class ReleaseManager:
    def __init__(self, dry_run: bool = False):
        self.repo_root = Path(__file__).parent.parent
        self.current_version = self.get_current_version()
        self.commits: List[dict] = []
        self.breaking_changes = 0
        self.features = 0
        self.fixes = 0
        self.new_version: Optional[str] = None
        self.dry_run = dry_run

    def get_current_version(self) -> str:
        """Get current version from package.json."""
        package_json = self.repo_root / 'package.json'
        with open(package_json) as f:
            data = json.load(f)
        return data['version']

    def get_latest_tag(self) -> Optional[str]:
        """Get the latest git tag."""
        try:
            result = subprocess.run(
                ['git', 'describe', '--tags', '--abbrev=0'],
                cwd=self.repo_root,
                capture_output=True,
                text=True,
                check=True
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError:
            return None

    def get_commits_since_tag(self, tag: Optional[str]) -> List[dict]:
        """Get commits since the last tag."""
        commit_range = f'{tag}..HEAD' if tag else 'HEAD'

        result = subprocess.run(
            ['git', 'log', commit_range, '--pretty=format:%s'],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=True
        )

        return [
            self.parse_commit_message(line)
            for line in result.stdout.strip().split('\n')
            if line
        ]

    def parse_commit_message(self, message: str) -> dict:
        """Parse conventional commit message format: type(scope): description."""
        match = re.match(
            r'^(feat|fix|docs|chore|refactor|test|perf|style)(\(.+\))?: (.+)$',
            message
        )

        if not match:
            return {'type': 'other', 'scope': None, 'description': message}

        commit_type, scope, description = match.groups()
        is_breaking = 'BREAKING CHANGE' in message or description.startswith('!')

        return {
            'type': commit_type,
            'scope': scope,
            'description': description,
            'breaking': is_breaking,
            'original': message
        }

    def analyze_commits(self, commits: List[dict]) -> None:
        """Count breaking changes, features, and fixes."""
        self.commits = commits

        for commit in commits:
            if commit.get('breaking'):
                self.breaking_changes += 1
            elif commit['type'] == 'feat':
                self.features += 1
            elif commit['type'] == 'fix':
                self.fixes += 1

    def calculate_new_version(self, current: str) -> str:
        """Calculate new version based on semver rules."""
        major, minor, patch = map(int, current.split('.'))

        if self.breaking_changes > 0:
            major += 1
            minor = patch = 0
        elif self.features > 0:
            minor += 1
            patch = 0
        elif self.fixes > 0:
            patch += 1

        return f'{major}.{minor}.{patch}'

    def _format_mode_prefix(self) -> str:
        """Return dry-run prefix if applicable."""
        return f'{YELLOW}[DRY-RUN]{NC} ' if self.dry_run else ''

    def show_analysis(self) -> None:
        """Display release analysis."""
        print(f'\n{BLUE}=== Release Analysis ==={NC}')
        print(f'Current version: {YELLOW}{self.current_version}{NC}')
        print(f'Latest tag: {YELLOW}{self.get_latest_tag() or "none"}{NC}')
        print(f'\nCommits since last release:')
        print(f'  {YELLOW}Breaking changes: {self.breaking_changes}{NC}')
        print(f'  {GREEN}Features: {self.features}{NC}')
        print(f'  {BLUE}Fixes: {self.fixes}{NC}')
        print(f'\nSuggested version: {GREEN}{self.new_version}{NC}\n')

    def ask_confirmation(self) -> bool:
        """Ask user to confirm release. 'v' allows version override."""
        while True:
            response = input(f'{YELLOW}Confirm release v{self.new_version}? (y/n/v): {NC}').lower().strip()

            if response == 'y':
                return True
            elif response == 'n':
                return False
            elif response == 'v':
                self.ask_version_override()
                self.show_analysis()
            else:
                print('Invalid input. Use y (yes), n (no), or v (version override)')

    def ask_version_override(self) -> None:
        """Prompt user to manually set version."""
        while True:
            version = input(f'{YELLOW}Enter version (e.g., 0.2.0): {NC}').strip()
            if re.match(r'^\d+\.\d+\.\d+$', version):
                self.new_version = version
                break
            print('Invalid version format. Use X.Y.Z')

    def _update_json_file(self, file_path: Path, key: str) -> None:
        """Update version key in JSON file."""
        with open(file_path) as f:
            data = json.load(f)
        data[key] = self.new_version
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
            f.write('\n')

    def update_version_files(self) -> None:
        """Update version in package.json, Cargo.toml, and tauri.conf.json."""
        mode = self._format_mode_prefix()
        print(f'{BLUE}{mode}Updating version files...{NC}')

        if self.dry_run:
            print('  → package.json')
            print('  → src-tauri/Cargo.toml')
            print('  → src-tauri/tauri.conf.json')
            return

        self._update_json_file(self.repo_root / 'package.json', 'version')
        print('  ✓ package.json')

        cargo_toml = self.repo_root / 'src-tauri' / 'Cargo.toml'
        content = cargo_toml.read_text()
        content = re.sub(
            r'version = "[^"]+"',
            f'version = "{self.new_version}"',
            content,
            count=1
        )
        cargo_toml.write_text(content)
        print('  ✓ src-tauri/Cargo.toml')

        self._update_json_file(self.repo_root / 'src-tauri' / 'tauri.conf.json', 'version')
        print('  ✓ src-tauri/tauri.conf.json')

    def _build_changelog_entry(self) -> str:
        """Build new changelog entry from commits."""
        today = datetime.now().strftime('%Y-%m-%d')
        entry = f'## [{self.new_version}] - {today}\n'

        if self.breaking_changes > 0:
            entry += '\n### ⚠️ BREAKING CHANGES\n'
            entry += f'- {self.breaking_changes} breaking change(s)\n'

        if self.features > 0:
            entry += '\n### Added\n'
            for commit in self.commits:
                if commit['type'] == 'feat':
                    entry += f'- {commit["description"]}\n'

        if self.fixes > 0:
            entry += '\n### Fixed\n'
            for commit in self.commits:
                if commit['type'] == 'fix':
                    entry += f'- {commit["description"]}\n'

        return entry + '\n'

    def update_changelog(self) -> None:
        """Create or update CHANGELOG.md with new version entry."""
        mode = self._format_mode_prefix()
        print(f'{BLUE}{mode}Updating CHANGELOG.md...{NC}')

        if self.dry_run:
            print('  → CHANGELOG.md')
            return

        changelog = self.repo_root / 'CHANGELOG.md'
        new_entry = self._build_changelog_entry()

        if changelog.exists():
            existing = changelog.read_text()
            if existing.startswith('# Changelog'):
                lines = existing.split('\n')
                header_end = next(
                    (i for i, line in enumerate(lines) if line.startswith('## [')),
                    0
                )

                if header_end > 0:
                    header = '\n'.join(lines[:header_end])
                    rest = '\n'.join(lines[header_end:])
                    content = f'{header}\n{new_entry}{rest}'
                else:
                    content = existing + new_entry
            else:
                content = new_entry + existing
        else:
            content = f'# Changelog\n\n{CHANGELOG_INTRO}\n\n{new_entry}'

        changelog.write_text(content)
        print('  ✓ CHANGELOG.md')

    def commit_and_tag(self) -> bool:
        """Commit version changes and create git tag."""
        mode = self._format_mode_prefix()
        print(f'{BLUE}{mode}Creating commit and tag...{NC}')

        if self.dry_run:
            print(f'  → Commit: chore: release v{self.new_version}')
            print(f'  → Tag: v{self.new_version}')
            return True

        try:
            subprocess.run(
                ['git', 'add', 'package.json', 'src-tauri/Cargo.toml',
                 'src-tauri/tauri.conf.json', 'CHANGELOG.md'],
                cwd=self.repo_root,
                check=True
            )

            subprocess.run(
                ['git', 'commit', '-m', f'chore: release v{self.new_version}'],
                cwd=self.repo_root,
                check=True
            )
            print('  ✓ Commit created')

            subprocess.run(
                ['git', 'tag', '-a', f'v{self.new_version}',
                 '-m', f'Version {self.new_version}'],
                cwd=self.repo_root,
                check=True
            )
            print(f'  ✓ Tag created: v{self.new_version}')

            return True
        except subprocess.CalledProcessError as e:
            print(f'{RED}Error: {e}{NC}')
            return False

    def _run_test(self, name: str, cmd: List[str], cwd: Optional[Path] = None) -> bool:
        """Run test command and return success status."""
        print(f'\n{BLUE}Running {name}...{NC}')
        result = subprocess.run(cmd, cwd=cwd or self.repo_root, capture_output=False)

        if result.returncode != 0:
            print(f'{RED}❌ {name} failed{NC}')
            return False

        print(f'{GREEN}✓ {name} passed{NC}')
        return True

    def run_tests(self) -> bool:
        """Run React and Rust tests."""
        print(f'{BLUE}Running tests...{NC}')

        if self.dry_run:
            print('  → npm test (React tests)')
            print('  → cargo test (Rust tests)')
            return True

        if not self._run_test('React tests', ['npm', 'test', '--', '--run']):
            return False

        if not self._run_test('Rust tests', ['cargo', 'test'],
                            cwd=self.repo_root / 'src-tauri'):
            return False

        return True

    def run(self) -> bool:
        """Execute the release workflow."""
        dry_run_banner = f' {YELLOW}[DRY-RUN MODE]{NC}' if self.dry_run else ''
        print(f'\n{BLUE}🚀 Release Manager{dry_run_banner}{NC}\n')

        if not self.run_tests():
            print(f'\n{RED}❌ Tests failed. Release EVENT_CANCELled.{NC}\n')
            return False

        latest_tag = self.get_latest_tag()
        commits = self.get_commits_since_tag(latest_tag)

        if not commits:
            print(f'{YELLOW}No commits since last tag. Nothing to release.{NC}')
            return False

        self.analyze_commits(commits)
        self.new_version = self.calculate_new_version(self.current_version)
        self.show_analysis()

        if not self.ask_confirmation():
            print(f'{YELLOW}Release EVENT_CANCELled.{NC}')
            return False

        self.update_version_files()
        self.update_changelog()

        if not self.commit_and_tag():
            return False

        if self.dry_run:
            print(f'\n{GREEN}✨ Dry-run completed! Release would be v{self.new_version}{NC}')
            print(f'Run without {YELLOW}--dry-run{NC} to apply changes\n')
        else:
            print(f'\n{GREEN}✨ Release v{self.new_version} completed!{NC}')
            print(f'Push the tag with: {YELLOW}git push origin v{self.new_version}{NC}\n')

        return True


if __name__ == '__main__':
    dry_run = '--dry-run' in sys.argv
    manager = ReleaseManager(dry_run=dry_run)
    success = manager.run()
    sys.exit(0 if success else 1)
