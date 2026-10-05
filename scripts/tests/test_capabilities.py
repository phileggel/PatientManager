"""The capability grants exactly the native calls the frontend makes — run with `just test-scripts`.

A permission the capability lacks fails silently in the installed application: the E2E
suite overrides the native dialogs (ADR-007) and never relaunches. So the link between
what `src/` imports from the dialog and process plugins and what
`src-tauri/capabilities/default.json` grants is checked here (DEBT-027).
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CAPABILITY = ROOT / "src-tauri" / "capabilities" / "default.json"
# The permission each plugin function needs (the plugins' own permission tables).
PERMISSION_OF = {
    ("dialog", "open"): "dialog:allow-open",
    ("dialog", "save"): "dialog:allow-save",
    ("dialog", "message"): "dialog:allow-message",
    ("dialog", "ask"): "dialog:allow-ask",
    ("dialog", "confirm"): "dialog:allow-confirm",
    ("process", "relaunch"): "process:allow-restart",
    ("process", "exit"): "process:allow-exit",
}
IMPORT = re.compile(r'import\s*\{([^}]*)\}\s*from\s*"@tauri-apps/plugin-(dialog|process)"')
MENTION = re.compile(r'["\']@tauri-apps/plugin-(?:dialog|process)["\']')


def calls_made(sources: dict[str, str]) -> set[tuple[str, str]]:
    """Every (plugin, function) the given sources import from the dialog and process plugins."""
    calls = set()
    for text in sources.values():
        for names, plugin in IMPORT.findall(text):
            for name in names.split(","):
                name = name.strip().split(" as ")[0].strip()
                if name and not name.startswith("type "):  # a type is not a call
                    calls.add((plugin, name))
    return calls


def frontend_sources() -> dict[str, str]:
    return {
        str(path): path.read_text(encoding="utf-8")
        for path in (ROOT / "src").rglob("*.ts*")
        if path.suffix in (".ts", ".tsx") and ".test." not in path.name
    }


class Capability(unittest.TestCase):
    def setUp(self):
        self.granted = set(json.loads(CAPABILITY.read_text(encoding="utf-8"))["permissions"])
        self.needed = {PERMISSION_OF[call] for call in calls_made(frontend_sources())}

    def test_debt_027_every_native_call_the_frontend_makes_is_granted(self):
        self.assertEqual(self.needed - self.granted, set(), "the installed application would refuse these calls")

    def test_debt_027_nothing_is_granted_that_the_frontend_does_not_call(self):
        scoped = {p for p in self.granted if p.startswith(("dialog:", "process:"))}
        self.assertEqual(scoped - self.needed, set(), "narrow the capability to what the screens use")

    def test_debt_027_the_plugins_are_only_imported_in_the_form_this_test_can_read(self):
        # `import * as dialog` or `await import(...)` would hide a call from the two tests above.
        unreadable = [
            path for path, text in frontend_sources().items() if len(MENTION.findall(text)) != len(IMPORT.findall(text))
        ]
        self.assertEqual(unreadable, [], "import the plugin functions by name: import { open } from …")
        hidden = 'const dialog = await import("@tauri-apps/plugin-dialog");'
        self.assertNotEqual(len(MENTION.findall(hidden)), len(IMPORT.findall(hidden)))

    def test_debt_027_a_type_import_is_not_a_call_and_an_unknown_function_fails_loudly(self):
        calls = calls_made({"a.ts": 'import { open, type OpenDialogOptions } from "@tauri-apps/plugin-dialog";'})
        self.assertEqual(calls, {("dialog", "open")})
        unknown = calls_made({"a.ts": 'import { pickFolder } from "@tauri-apps/plugin-dialog";'})
        with self.assertRaises(KeyError):  # add the function and its permission to PERMISSION_OF
            {PERMISSION_OF[call] for call in unknown}

    def test_debt_027_imports_are_read_from_both_plugins(self):
        sources = {
            "a.ts": 'import { open, save } from "@tauri-apps/plugin-dialog";',
            "b.ts": 'import { relaunch as restart } from "@tauri-apps/plugin-process";\nimport { check } from "@tauri-apps/plugin-updater";',
        }
        self.assertEqual(calls_made(sources), {("dialog", "open"), ("dialog", "save"), ("process", "relaunch")})


if __name__ == "__main__":
    unittest.main()
