# Specification Numbering Scheme

All business rules in feature specs use a consistent numbering scheme: **`TRIG-NNN`**

- **TRIG**: 3-letter code identifying the feature/context
- **NNN**: 3-digit index (010, 020, 030...) with gaps for extensibility

---

## Trigramme Definitions

| Trigramme | Feature                     | Purpose                                                                               |
| --------- | --------------------------- | ------------------------------------------------------------------------------------- |
| **REF**   | Overpayment Management      | Manual refund recording and tracking for overpaid procedures                          |
| **FPA**   | Fund Payment Auto-Match     | Automatic matching of fund payments to procedures                                     |
| **BAS**   | Bank Statement Auto-Match   | Automatic reconciliation of bank statements with transfers                            |
| **BSM**   | Bank Statement Manual Match | Manual matching and exception handling for bank statements                            |
| **POC**   | Procedure Orchestration     | Cross-context procedure workflow coordination                                         |
| **PTY**   | Procedure Type Management   | Procedure type definitions and configurations                                         |
| **DBB**   | Database Backup & Import    | Database backup creation and restoration                                              |
| **EXI**   | Excel Import                | Bulk procedure import from Excel files                                                |
| **THM**   | Theme & Appearance          | UI theme management and styling                                                       |
| **UPD**   | Updater                     | Application version updates and releases                                              |
| **FPR**   | Fund Payment Report         | PDF report generated after fund-payment reconciliation                                |
| **IFC**   | Import Fixture Codec        | Dev-only inverse of import parsers — generates fixtures (Excel + fund-PDF + bank-PDF) |

---

## Reference Format

When referencing a rule in code, documentation, or tests, use the full code:

✅ **Correct**: "REF-010 ensures only eligible procedures can be refunded"
✅ **Correct**: `// Implements REF-012: validate refund date`
❌ **Avoid**: "R1 ensures eligibility" (ambiguous across specs)
