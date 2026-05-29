import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/procedure/api/gateway", () => ({
  readAllProcedures: vi.fn(),
}));

vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import * as procedureGateway from "@/features/procedure/api/gateway";
import { fetchDashboardData } from "./dashboardService";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchDashboardData", () => {
  it("returns success with the procedures list when the gateway succeeds", async () => {
    vi.mocked(procedureGateway.readAllProcedures).mockResolvedValue({
      success: true,
      data: [],
    });
    const result = await fetchDashboardData();
    expect(result).toEqual({ success: true, data: { procedures: [] } });
  });

  it("returns failure result surfacing the gateway error code", async () => {
    vi.mocked(procedureGateway.readAllProcedures).mockResolvedValue({
      success: false,
      error: { code: "DatabaseError" },
    });
    const result = await fetchDashboardData();
    expect(result).toEqual({ success: false, error: "DatabaseError" });
  });
});
