"""Tests for scripts/privacy-check.py — run with `just test-scripts`.

Planted values are assembled at run time: a valid SSN or IBAN written out in
this file would be caught by the tree check itself.
"""

import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("privacy_check", Path(__file__).resolve().parents[1] / "privacy-check.py")
pc = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pc)


def planted_ssn(spaced=False):
    body = "1" + "85" + "05" + "78" + "006" + "084"
    key = f"{97 - int(body) % 97:02d}"
    return " ".join([body[0], body[1:3], body[3:5], body[5:7], body[7:10], body[10:13], key]) if spaced else body + key


def planted_iban():
    bban = "3000600001" + "1234567890189"
    check = 98 - int("".join(str(int(c, 36)) for c in bban + "FR00")) % 97
    return f"FR{check:02d}{bban}"


class Text(unittest.TestCase):
    def test_a_valid_ssn_is_found_compact_or_spaced(self):
        self.assertEqual(len(pc.text_findings(f"patient {planted_ssn()}", set())), 1)
        self.assertEqual(len(pc.text_findings(f"patient {planted_ssn(spaced=True)}", set())), 1)

    def test_an_ssn_with_a_wrong_key_is_not(self):
        wrong = planted_ssn()[:-2] + f"{(int(planted_ssn()[-2:]) + 1) % 97:02d}"
        self.assertEqual(pc.text_findings(wrong, set()), [])

    def test_a_valid_iban_is_found_and_the_report_masks_it(self):
        findings = pc.text_findings(f"iban: {planted_iban()}", set())
        self.assertEqual(len(findings), 1)
        self.assertNotIn(planted_iban()[4:-4], findings[0][1])

    def test_an_allowlisted_iban_passes(self):
        self.assertEqual(pc.text_findings(planted_iban(), {planted_iban()}), [])


class Logs(unittest.TestCase):
    def test_rust_patient_name_in_a_trace_is_found(self):
        source = 'fn f() {\n    tracing::trace!(\n        id = %p.id,\n        name = ?patient.name,\n        "x"\n    );\n}\n'
        self.assertEqual([line for line, _ in pc.log_findings("a.rs", source)], [2])

    def test_rust_ssn_in_a_format_placeholder_is_found(self):
        self.assertEqual(len(pc.log_findings("a.rs", 'info!("patient {ssn} added");')), 1)

    def test_rust_presence_flags_and_an_iban_tail_pass(self):
        source = 'info!(has_ssn = ssn.is_some(), n = iban.len(), tail = &iban[iban.len() - 4..], "Fetching patient by SSN");'
        self.assertEqual(pc.log_findings("a.rs", source), [])

    def test_ts_patient_name_and_iban_values_are_found(self):
        source = 'logger.info("opened", { patientName: patient.name });\nconsole.log(iban);\n'
        self.assertEqual(len(pc.log_findings("a.tsx", source)), 3)

    def test_ts_presence_checks_pass(self):
        source = 'logger.info(TAG, "created", { hasIban: iban !== null, n: ssn.length, ok: !!ssn });'
        self.assertEqual(pc.log_findings("a.ts", source), [])

    def test_calls_that_are_not_logs_are_ignored(self):
        self.assertEqual(pc.log_findings("a.ts", "commands.createBankAccount(name, iban);"), [])


class Data(unittest.TestCase):
    def test_a_spreadsheet_outside_the_fixtures_is_found(self):
        findings = pc.data_findings(["exports/patients.xlsx"], {"exports/patients.expected.json"})
        self.assertEqual(len(findings), 1)
        self.assertIn("outside", findings[0][1])

    def test_a_fixture_needs_its_expected_json(self):
        fixture = "src-tauri/tests/fixtures/excel/a.xlsx"
        self.assertEqual(len(pc.data_findings([fixture], {fixture})), 1)
        self.assertEqual(pc.data_findings([fixture], {fixture, "src-tauri/tests/fixtures/excel/a.expected.json"}), [])


if __name__ == "__main__":
    unittest.main()
