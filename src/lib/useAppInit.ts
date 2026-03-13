import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { commands } from "@/bindings";
import { useAppStore } from "./appStore";
import { logger } from "./logger";

/**
 * Hook to initialize app state and event listeners
 *
 * EXCEPTION: This hook directly calls Tauri commands to bootstrap the store on first load.
 * All other code must use gateways which read from the store.
 *
 * Flow:
 * 1. useAppInit loads initial data via DIRECT Tauri commands (exception)
 * 2. Data is stored in Zustand store
 * 3. Event listeners listen for backend updates
 * 4. Event listeners trigger store updates via gateway setters
 * 5. All other code reads from store via gateway readAll functions
 */
export function useAppInit() {
  const setPatients = useAppStore((state) => state.setPatients);
  const setFunds = useAppStore((state) => state.setFunds);
  const setProcedureTypes = useAppStore((state) => state.setProcedureTypes);
  const setBankAccounts = useAppStore((state) => state.setBankAccounts);
  const setFundPaymentGroups = useAppStore((state) => state.setFundPaymentGroups);
  const setLoading = useAppStore((state) => state.setLoading);

  useEffect(() => {
    // Load initial data
    const initializeAppData = async () => {
      try {
        // EXCEPTION: Direct Tauri calls for bootstrap (store is empty on first load)
        // Load patients
        setLoading("patients", true);
        const patientsResult = await commands.readAllPatients();
        if (patientsResult.status === "ok") {
          setPatients(patientsResult.data);
          logger.info("Patients loaded and cached", { count: patientsResult.data.length });
        }
        setLoading("patients", false);

        // Load funds
        setLoading("funds", true);
        const fundsResult = await commands.readAllFunds();
        if (fundsResult.status === "ok") {
          setFunds(fundsResult.data);
          logger.info("Funds loaded and cached", { count: fundsResult.data.length });
        }
        setLoading("funds", false);

        // Load procedure types
        setLoading("procedureTypes", true);
        const typesResult = await commands.readAllProcedureTypes();
        if (typesResult.status === "ok") {
          setProcedureTypes(typesResult.data);
          logger.info("Procedure types loaded and cached", { count: typesResult.data.length });
        }
        setLoading("procedureTypes", false);

        // Load bank accounts
        setLoading("bankAccounts", true);
        const accountsResult = await commands.readAllBankAccounts();
        if (accountsResult.status === "ok") {
          setBankAccounts(accountsResult.data);
          logger.info("Bank accounts loaded and cached", { count: accountsResult.data.length });
        }
        setLoading("bankAccounts", false);

        // Load fund payment groups
        setLoading("fundPaymentGroups", true);
        const groupsResult = await commands.readAllFundPaymentGroups();
        if (groupsResult.status === "ok") {
          setFundPaymentGroups(groupsResult.data);
          logger.info("Fund payment groups loaded and cached", { count: groupsResult.data.length });
        }
        setLoading("fundPaymentGroups", false);
      } catch (error) {
        logger.error("Failed to initialize app data", { error });
      }
    };

    // Set up event listeners
    const setupEventListeners = async () => {
      try {
        // Listen for patients updated event
        const unlistenPatients = await listen("patient_updated", async () => {
          logger.info("Patients updated event received");
          // Reload all patients from backend and update store
          const result = await commands.readAllPatients();
          if (result.status === "ok") {
            setPatients(result.data);
          }
        });

        // Listen for funds updated event
        const unlistenFunds = await listen("fund_updated", async () => {
          logger.info("Funds updated event received");
          // Reload all funds from backend and update store
          const result = await commands.readAllFunds();
          if (result.status === "ok") {
            setFunds(result.data);
          }
        });

        // Listen for procedures updated event
        const unlistenProcedures = await listen("procedure_updated", async () => {
          logger.info("Procedures updated event received");
          // Emit custom event so procedure page can refresh
          window.dispatchEvent(new Event("procedure_updated"));
        });

        // Listen for procedure types updated event
        const unlistenProcedureTypes = await listen("procedure_type_updated", async () => {
          logger.info("Procedure types updated event received");
          // Reload all procedure types from backend and update store
          const result = await commands.readAllProcedureTypes();
          if (result.status === "ok") {
            setProcedureTypes(result.data);
          }
        });

        // Listen for fund payment groups updated event
        const unlistenFundPaymentGroups = await listen("fund_payment_group_updated", async () => {
          logger.info("Fund payment groups updated event received");
          // Reload all fund payment groups from backend and update store
          const result = await commands.readAllFundPaymentGroups();
          if (result.status === "ok") {
            setFundPaymentGroups(result.data);
          }
          // Also emit custom event for local UI triggers if needed
          window.dispatchEvent(new Event("fundpaymentgroup_updated"));
        });

        // Listen for bank transfers updated event
        const unlistenBankTransfers = await listen("banktransfer_updated", async () => {
          logger.info("Bank transfers updated event received");
          // Emit custom event so bank transfer page can refresh locally
          window.dispatchEvent(new Event("banktransfer_updated"));
        });

        // Listen for bank accounts updated event
        const unlistenBankAccounts = await listen("bankaccount_updated", async () => {
          logger.info("Bank accounts updated event received");
          // Reload all bank accounts from backend and update store
          const result = await commands.readAllBankAccounts();
          if (result.status === "ok") {
            setBankAccounts(result.data);
          }
        });

        // Return cleanup function
        return () => {
          unlistenPatients();
          unlistenFunds();
          unlistenProcedures();
          unlistenProcedureTypes();
          unlistenFundPaymentGroups();
          unlistenBankTransfers();
          unlistenBankAccounts();
        };
      } catch (error) {
        logger.error("Failed to set up event listeners", { error });
        return () => {}; // Return empty cleanup function on error
      }
    };

    // Initialize data and listeners
    initializeAppData();
    let cleanup: (() => void) | undefined;
    setupEventListeners().then((fn) => {
      cleanup = fn;
    });

    // Cleanup function
    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [setPatients, setFunds, setProcedureTypes, setBankAccounts, setLoading, setFundPaymentGroups]);
}
