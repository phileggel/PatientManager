import type {
  AmountMismatchRow,
  ContestAmountRow,
  CorrectionGroup,
  CreateProcedureRow,
  DateMismatchRow,
  FundMismatchRow,
  LinkProcedureRow,
  PrintReportViewModel,
} from "./printReportPresenter";
import { formatAmount } from "./utils";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCorrectionGroup(
  group: CorrectionGroup,
  t: (key: string, opts?: object) => string,
): string {
  const heading = t(`print.section2.groups.${group.type}`);
  let headerRow = "";
  let bodyRows = "";

  switch (group.type) {
    case "ContestAmount": {
      headerRow = `<th>${t("print.columns.patient")}</th><th>${t("print.columns.date")}</th><th>${t("print.columns.billed")}</th><th>${t("print.columns.paid")}</th>`;
      bodyRows = (group.rows as ContestAmountRow[])
        .map(
          (r) =>
            `<tr><td>${esc(r.patientName)}</td><td>${r.procedureDate}</td><td>${formatAmount(r.billedAmountThousandths)} €</td><td>${formatAmount(r.paidAmountThousandths)} €</td></tr>`,
        )
        .join("");
      break;
    }
    case "CreateProcedure": {
      headerRow = `<th>${t("print.columns.patient")}</th><th>${t("print.columns.ssn")}</th><th>${t("print.columns.date")}</th><th>${t("print.columns.fund")}</th><th>${t("print.columns.billed")}</th>`;
      bodyRows = (group.rows as CreateProcedureRow[])
        .map(
          (r) =>
            `<tr><td>${esc(r.patientName)}</td><td>${esc(r.ssn)}</td><td>${r.procedureDate}</td><td>${esc(r.fundLabel)}</td><td>${formatAmount(r.billedAmountThousandths)} €</td></tr>`,
        )
        .join("");
      break;
    }
    case "LinkProcedure": {
      headerRow = `<th>${t("print.columns.patient")}</th><th>${t("print.columns.ssn")}</th><th>${t("print.columns.fund")}</th><th>${t("print.columns.paymentDate")}</th>`;
      bodyRows = (group.rows as LinkProcedureRow[])
        .map(
          (r) =>
            `<tr><td>${esc(r.patientName)}</td><td>${esc(r.ssn)}</td><td>${esc(r.fundLabel)}</td><td>${r.paymentDate}</td></tr>`,
        )
        .join("");
      break;
    }
    case "AmountMismatch": {
      headerRow = `<th>${t("print.columns.patient")}</th><th>${t("print.columns.date")}</th><th>${t("print.columns.originalAmount")}</th><th>${t("print.columns.correctedAmount")}</th>`;
      bodyRows = (group.rows as AmountMismatchRow[])
        .map(
          (r) =>
            `<tr><td>${esc(r.patientName)}</td><td>${r.procedureDate}</td><td>${formatAmount(r.originalAmountThousandths)} €</td><td>${formatAmount(r.correctedAmountThousandths)} €</td></tr>`,
        )
        .join("");
      break;
    }
    case "FundMismatch": {
      headerRow = `<th>${t("print.columns.patient")}</th><th>${t("print.columns.date")}</th><th>${t("print.columns.originalFund")}</th><th>${t("print.columns.correctedFund")}</th>`;
      bodyRows = (group.rows as FundMismatchRow[])
        .map(
          (r) =>
            // originalFundId is a UUID (known limitation — fund label not available in session)
            `<tr><td>${esc(r.patientName)}</td><td>${r.procedureDate}</td><td>${esc(r.originalFundId ?? "")}</td><td>${esc(r.correctedFundLabel)}</td></tr>`,
        )
        .join("");
      break;
    }
    case "DateMismatch": {
      headerRow = `<th>${t("print.columns.patient")}</th><th>${t("print.columns.originalDate")}</th><th>${t("print.columns.correctedDate")}</th>`;
      bodyRows = (group.rows as DateMismatchRow[])
        .map(
          (r) =>
            `<tr><td>${esc(r.patientName)}</td><td>${r.originalDate}</td><td>${r.correctedDate}</td></tr>`,
        )
        .join("");
      break;
    }
  }

  return `<div class="correction-group"><h3>${heading}</h3><table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
}

export function buildPrintReportHtml(
  vm: PrintReportViewModel,
  t: (key: string, opts?: object) => string,
): string {
  const { header, unreconciledRows, unreconciledTotalThousandths, correctionGroups } = vm;

  let section1Body: string;
  if (unreconciledRows.length === 0) {
    section1Body = `<p class="empty-message">${t("print.section1.empty")}</p>`;
  } else {
    const tableRows = unreconciledRows
      .map(
        (row) =>
          `<tr><td>${row.date}</td><td>${esc(row.patientName)}</td><td>${esc(row.ssn)}</td><td>${formatAmount(row.amountThousandths)} €</td></tr>`,
      )
      .join("");
    section1Body = `<table><thead><tr><th>${t("print.columns.date")}</th><th>${t("print.columns.patient")}</th><th>${t("print.columns.ssn")}</th><th>${t("print.columns.billed")}</th></tr></thead><tbody>${tableRows}</tbody></table><p class="total"><strong>${t("print.section1.total")}:</strong> ${formatAmount(unreconciledTotalThousandths!)} €</p>`;
  }

  const section2Html =
    correctionGroups.length === 0
      ? ""
      : `<h2>${t("print.section2.heading")}</h2>${correctionGroups.map((g) => renderCorrectionGroup(g, t)).join("")}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${t("print.title")}</title>
<style>
body{font-family:sans-serif;margin:2cm;font-size:12pt}
h1{font-size:16pt}
h2{font-size:13pt;margin-top:1.5em}
h3{font-size:12pt;margin-top:1em}
table{width:100%;border-collapse:collapse;margin-bottom:1em}
th,td{border:1px solid #ccc;padding:4px 8px;text-align:left;font-size:10pt}
th{background:#f0f0f0;font-weight:bold}
.header-meta p{margin:2px 0;font-size:11pt}
.empty-message{font-style:italic;color:#666}
@page{@bottom-right{content:counter(page) " / " counter(pages)}}
</style>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()};};</script>
</head>
<body>
<h1>${t("print.title")}</h1>
<div class="header-meta">
<p>${t("print.header.fileName")}: ${esc(header.pdfFileName)}</p>
<p>${t("print.header.period")}: ${header.periodStart} — ${header.periodEnd}</p>
<p>${t("print.header.generated")}: ${header.generationDate}</p>
</div>
<h2>${t("print.section1.heading")}</h2>
${section1Body}${section2Html}
</body>
</html>`;
}
