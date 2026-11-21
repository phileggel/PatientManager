import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCacheStore } from "@/infra/cache/store";
import { makeFund } from "@/tests/fund.factory";
import { ManagementModal } from "./ManagementModal";

const byId = (id: string) => document.getElementById(id) as HTMLElement;

/** #711 — every entry of the window, the menu that holds it, the page it opens. */
const ENTRIES: [menu: string, entry: string, page: string][] = [
  ["mgmt-menu-patients", "mgmt-card-patients", "patient"],
  ["mgmt-menu-patients", "mgmt-card-patient-duplicates", "patient-duplicate"],
  ["mgmt-menu-funds-procedures", "mgmt-card-funds", "funds"],
  ["mgmt-menu-funds-procedures", "mgmt-card-procedure-types", "procedure-types"],
  ["mgmt-menu-payments", "mgmt-card-fund-payment", "fund-payment"],
  ["mgmt-menu-payments", "mgmt-card-direct-payments", "direct-payments"],
  ["mgmt-menu-payments", "mgmt-card-fund-wires", "fund-wires"],
  ["mgmt-menu-bank", "mgmt-card-bank-accounts", "bank-account"],
  ["mgmt-menu-bank", "mgmt-card-bank-statement-labels", "bank-statement-label"],
];

describe("ManagementModal", () => {
  beforeEach(() => {
    useCacheStore.setState({ funds: [makeFund()] });
  });

  it("shows its translated title, not the translation key", () => {
    render(<ManagementModal isOpen onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getAllByText("Management").length).toBeGreaterThan(0);
    expect(screen.queryByText("modalTitle")).not.toBeInTheDocument();
  });

  it("#711: opens on the patients menu, with its two entries only", () => {
    render(<ManagementModal isOpen onClose={vi.fn()} onNavigate={vi.fn()} />);

    expect(byId("mgmt-menu-patients")).toHaveAttribute("aria-current", "true");
    expect(byId("mgmt-card-patients")).toBeInTheDocument();
    expect(byId("mgmt-card-patient-duplicates")).toBeInTheDocument();
    expect(byId("mgmt-card-funds")).toBeNull();
    expect(screen.getByText("Funds and procedures")).toBeInTheDocument();
  });

  it.each(ENTRIES)("#711: %s holds %s, which opens %s", async (menu, entry, page) => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    render(<ManagementModal isOpen onClose={onClose} onNavigate={onNavigate} />);

    await userEvent.click(byId(menu));
    await userEvent.click(byId(entry));

    expect(onNavigate).toHaveBeenCalledWith(page);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("#711: reopens on the patients menu, whatever menu was shown", async () => {
    const { rerender } = render(<ManagementModal isOpen onClose={vi.fn()} onNavigate={vi.fn()} />);
    await userEvent.click(byId("mgmt-menu-bank"));
    expect(byId("mgmt-card-bank-accounts")).toBeInTheDocument();

    rerender(<ManagementModal isOpen={false} onClose={vi.fn()} onNavigate={vi.fn()} />);
    rerender(<ManagementModal isOpen onClose={vi.fn()} onNavigate={vi.fn()} />);

    expect(byId("mgmt-menu-patients")).toHaveAttribute("aria-current", "true");
    expect(byId("mgmt-card-bank-accounts")).toBeNull();
  });
});
