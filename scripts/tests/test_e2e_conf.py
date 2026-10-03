"""Guards on src-tauri/tauri.e2e.conf.json — run with `just test-scripts`.

The E2E overlay repeats the window of tauri.conf.json (a config overlay replaces
a list whole) to add the browser arguments WebDriver needs on Windows (TL-004).
"""

import json
import unittest
from pathlib import Path

TAURI = Path(__file__).resolve().parents[2] / "src-tauri"
DEBUG_PORT = "--remote-debugging-port"


def load(name):
    return json.loads((TAURI / name).read_text(encoding="utf-8"))


class E2eConf(unittest.TestCase):
    def test_the_e2e_window_is_the_shipped_window_plus_browser_arguments(self):
        shipped = load("tauri.conf.json")["app"]["windows"]
        e2e = [dict(window) for window in load("tauri.e2e.conf.json")["app"]["windows"]]
        for window in e2e:
            window.pop("additionalBrowserArgs")
        self.assertEqual(e2e, shipped)

    def test_the_e2e_window_keeps_the_webview_defaults_and_opens_the_debugging_port(self):
        (window,) = load("tauri.e2e.conf.json")["app"]["windows"]
        arguments = window["additionalBrowserArgs"].split()
        # Setting the key replaces the defaults the webview library would pass.
        self.assertIn("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection", arguments)
        self.assertIn(f"{DEBUG_PORT}=0", arguments)

    def test_no_shipped_configuration_opens_a_debugging_port(self):
        for conf in sorted(TAURI.glob("tauri*.conf.json")):
            if conf.name == "tauri.e2e.conf.json":
                continue
            self.assertNotIn(DEBUG_PORT, conf.read_text(encoding="utf-8"), conf.name)


if __name__ == "__main__":
    unittest.main()
