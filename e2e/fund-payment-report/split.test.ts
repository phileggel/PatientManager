/**
 * E2E — splitting a not-found fund PDF line into several procedures
 * (FPA-255 to FPA-258).
 *
 * Approach — direct invoke, as `generate.test.ts`: the screen that shows a
 * not-found line is reached through the native file dialog, outside WebDriver.
 * The commands the card calls go through the real IPC to the real binary: what
 * this adds over the Rust tests is the typed `SplitInvalid` payload and the
 * `SplitIntoProcedures` correction crossing the real serialization. The card
 * itself (FPA-251 to FPA-254E) is covered by its Vitest tests.
 *
 * Coverage:
 *   - a split that does not add up is refused, its reasons per part
 *   - a split that adds up is accepted, then confirmation creates one
 *     procedure per part with its date and amount
 */

import assert from "node:assert";
import { tauriInvoke } from "../helpers/tauri-invoke";

interface Procedure {
  procedure_date: string;
  billed_amount: number;
  procedure_type_id: string;
  fund_id: string | null;
  payment_status: string;
}

interface FundPaymentGroup {
  fund_id: string;
  lines: { procedure_id: string }[];
}

/** A not-found PDF line of a unique patient (E9): one SSN per run. */
function pdfLine(ssn: string, fundLabel: string) {
  return {
    line_index: 0,
    payment_date: "2026-10-05",
    invoice_number: "F-E2E",
    fund_name: fundLabel,
    patient_name: "E2E Split",
    ssn,
    nature: "SEANCE",
    procedure_start_date: "2026-09-01",
    procedure_end_date: "2026-09-30",
    is_period: true,
    amount: 135000,
  };
}

describe("FPA-255 to FPA-258 — split a not-found line into procedures", () => {
  it("refuses a split that does not add up, naming the part outside the period", async () => {
    const run = Date.now().toString();
    const line = pdfLine(`1${run.slice(-12).padStart(12, "0")}`, `CPAM n° ${run.slice(-5)}`);

    const result = await tauriInvoke<null>("check_split_into_procedures", {
      line,
      parts: [
        { procedure_date: "2026-09-04", billed_amount: 45000 },
        { procedure_date: "2026-10-02", billed_amount: 45000 },
      ],
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      // The typed refusal travels as its JSON payload: the split's reason, then each part's.
      const payload = result.error.match(/\{.*\}/s);
      assert.ok(payload, result.error);
      const refusal = JSON.parse(payload[0]);
      assert.strictEqual(refusal.code, "SplitInvalid");
      assert.deepStrictEqual(refusal.reasons, ["TotalMismatch"]);
      assert.deepStrictEqual(refusal.parts, [[], ["DateOutOfRange"]]);
    }
  });

  it("accepts a balanced split, and confirmation creates one procedure per part", async () => {
    const run = (Date.now() + 1).toString();
    const fundLabel = `CPAM n° ${run.slice(-5)}`;
    const line = pdfLine(`2${run.slice(-12).padStart(12, "0")}`, fundLabel);
    const parts = [
      { procedure_date: "2026-09-04", billed_amount: 45000 },
      { procedure_date: "2026-09-11", billed_amount: 90000 },
    ];

    const check = await tauriInvoke<null>("check_split_into_procedures", { line, parts });
    assert.strictEqual(check.ok, true, check.ok ? "" : check.error);

    const created = await tauriInvoke<FundPaymentGroup[]>(
      "create_fund_payment_with_auto_corrections",
      {
        request: {
          candidates: [
            {
              fund_label: fundLabel,
              payment_date: "2026-10-05",
              total_amount: 135000,
              procedure_ids: [],
              matched_amount: 0,
              is_fully_covered: false,
            },
          ],
          auto_corrections: [{ SplitIntoProcedures: { line, parts } }],
        },
      },
    );
    assert.strictEqual(created.ok, true, created.ok ? "" : created.error);
    if (!created.ok) return;

    // FPA-257: the group holds one procedure per part, each the line's fund,
    // an "Import" procedure ending reconciled.
    const group = created.data[0];
    assert.ok(group, "a group was created");
    const ids = group.lines.map((l) => l.procedure_id);
    assert.strictEqual(ids.length, 2);
    const read = await tauriInvoke<Procedure[]>("read_procedures_by_ids", { ids });
    assert.strictEqual(read.ok, true, read.ok ? "" : read.error);
    if (!read.ok) return;
    const procedures = [...read.data].sort((x, y) =>
      x.procedure_date.localeCompare(y.procedure_date),
    );
    assert.deepStrictEqual(
      procedures.map((p) => [p.procedure_date, p.billed_amount]),
      [
        ["2026-09-04", 45000],
        ["2026-09-11", 90000],
      ],
    );
    for (const procedure of procedures) {
      assert.strictEqual(procedure.procedure_type_id, "import-pdf");
      assert.strictEqual(procedure.fund_id, group.fund_id);
      assert.strictEqual(procedure.payment_status, "RECONCILED");
    }
  });
});
