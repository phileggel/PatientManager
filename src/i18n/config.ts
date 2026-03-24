import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import bankEn from "./locales/en/bank.json";
import commonEn from "./locales/en/common.json";
import dashboardEn from "./locales/en/dashboard.json";
import dbBackupEn from "./locales/en/db-backup.json";
import excelImportEn from "./locales/en/excel-import.json";
import fundEn from "./locales/en/fund.json";
import fundPaymentEn from "./locales/en/fund-payment.json";
import fundPaymentMatchEn from "./locales/en/fund-payment-match.json";
import patientEn from "./locales/en/patient.json";
import procedureEn from "./locales/en/procedure.json";
import procedureTypeEn from "./locales/en/procedure-type.json";
import bankFr from "./locales/fr/bank.json";
import commonFr from "./locales/fr/common.json";
import dashboardFr from "./locales/fr/dashboard.json";
import dbBackupFr from "./locales/fr/db-backup.json";
import excelImportFr from "./locales/fr/excel-import.json";
import fundFr from "./locales/fr/fund.json";
import fundPaymentFr from "./locales/fr/fund-payment.json";
import fundPaymentMatchFr from "./locales/fr/fund-payment-match.json";
import patientFr from "./locales/fr/patient.json";
import procedureFr from "./locales/fr/procedure.json";
import procedureTypeFr from "./locales/fr/procedure-type.json";

i18n.use(initReactI18next).init({
  lng: "fr",
  fallbackLng: "en",
  defaultNS: "common",
  ns: [
    "common",
    "patient",
    "fund",
    "fund-payment",
    "procedure",
    "procedure-type",
    "bank",
    "fund-payment-match",
    "dashboard",
    "excel-import",
    "db-backup",
  ],
  resources: {
    fr: {
      common: commonFr,
      patient: patientFr,
      fund: fundFr,
      "fund-payment": fundPaymentFr,
      procedure: procedureFr,
      "procedure-type": procedureTypeFr,
      bank: bankFr,
      "fund-payment-match": fundPaymentMatchFr,
      dashboard: dashboardFr,
      "excel-import": excelImportFr,
      "db-backup": dbBackupFr,
    },
    en: {
      common: commonEn,
      patient: patientEn,
      fund: fundEn,
      "fund-payment": fundPaymentEn,
      procedure: procedureEn,
      "procedure-type": procedureTypeEn,
      bank: bankEn,
      "fund-payment-match": fundPaymentMatchEn,
      dashboard: dashboardEn,
      "excel-import": excelImportEn,
      "db-backup": dbBackupEn,
    },
  },
  interpolation: {
    escapeValue: false, // React already escapes values
  },
});

export default i18n;
