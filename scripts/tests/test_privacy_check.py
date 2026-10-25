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

    def test_ticket_545_a_rust_log_debug_formatting_a_parsed_line_or_row_is_found(self):
        for source in ("debug!(target: BACKEND, line = ?l);", 'debug!(?virsepa_lines, "found");', 'debug!("rows {rows:?}");', "info!(row = ?self.row);", "debug!(line = ?&line);", 'debug!("{line:#?}");', 'debug!("parsed row: {:?}", line);', 'debug!("{} {:#?}", count, &rows);'):
            self.assertEqual(len(pc.log_findings("a.rs", source)), 1, source)

    def test_ticket_545_an_error_an_id_or_a_status_may_be_debug_formatted(self):
        source = 'error!(error = ?e, id = ?procedure.id, fund = ?fund_id, s = ?procedure.payment_status, "x");'
        self.assertEqual(pc.log_findings("a.rs", source), [])

    def test_ticket_545_a_question_mark_in_a_message_or_the_try_operator_is_not_a_debug_format(self):
        for source in ('debug!("is this a line? rows ok");', "debug!(x = foo()?.row);", 'debug!("failed: {:?}", e);'):
            self.assertEqual(pc.log_findings("a.rs", source), [], source)

    def test_ts_patient_name_and_iban_values_are_found(self):
        source = 'logger.info("opened", { patientName: patient.name });\nconsole.log(iban);\n'
        self.assertEqual(len(pc.log_findings("a.tsx", source)), 3)

    def test_ts_presence_checks_pass(self):
        source = 'logger.info(TAG, "created", { hasIban: iban !== null, n: ssn.length, ok: !!ssn });'
        self.assertEqual(pc.log_findings("a.ts", source), [])

    def test_calls_that_are_not_logs_are_ignored(self):
        self.assertEqual(pc.log_findings("a.ts", "commands.createBankAccount(name, iban);"), [])

    def test_debt_060_a_message_may_interpolate_a_constant_a_length_an_id_or_the_entity_name(self):
        source = "logger.info(TAG, `${TAG} loaded ${rows.length} rows for ${patientId} ${id} (${entityName})`, { id });"
        self.assertEqual(pc.log_findings("src/a.ts", source), [])

    def test_debt_060_a_message_interpolating_anything_else_is_found(self):
        for expr in ("result.data", "issueCount", "label"):
            source = "logger.info(TAG, `done: ${%s} entries`);" % expr
            self.assertEqual(pc.log_findings("src/a.ts", source), [(1, f"log message interpolates a value: ${{{expr}}}")], expr)
        # A private value in the message is found twice: once as an interpolation, once by name.
        self.assertEqual(len(pc.log_findings("src/a.ts", "logger.info(TAG, `done: ${patient.name}`);")), 2)

    def test_debt_060_a_value_after_the_message_that_is_not_an_object_literal_is_found(self):
        self.assertEqual(pc.log_findings("src/a.ts", 'logger.error(TAG, "failed", result.error);'), [(1, "log call hands a value after its message that is not an object literal: result.error")])
        self.assertEqual(len(pc.log_findings("src/a.tsx", 'logger.error("failed", e);')), 1)
        self.assertEqual(len(pc.log_findings("src/a.ts", 'logger.debug(TAG, "parsing", `${text.length} chars`);')), 1)
        self.assertEqual(pc.log_findings("src/a.ts", 'logger.info(TAG, "ok", { id, count: rows.length });'), [])
        self.assertEqual(pc.log_findings("src/a.ts", 'logger.error(TAG, "failed", {\n  code: result.error.code,\n});'), [])
        self.assertEqual(pc.log_findings("wdio.conf.ts", 'console.error("failed", error);'), [], "tooling outside src/ prints to a terminal")

    def test_debt_060_a_test_may_hand_the_logger_an_object_variable(self):
        self.assertEqual(pc.log_findings("src/infra/logger.test.ts", 'logger.info("patient form: Submitting", form);'), [])


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
