import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetWritePolicy } from "../../src/api/policy";
import { resetReachability } from "../../src/query/reachability";
import { DealWizard } from "../../src/screens/DealWizard";

// The frame is shared by every wizard (WizardDialog), so the deal wizard stands
// for all of them.
describe("dismissing a wizard", () => {
  beforeEach(async () => {
    resetReachability();
    await clearCredential();
    resetWritePolicy();
    await saveCredential({
      baseUrl: API,
      apiKey: "k",
      role: "operator",
      name: "Ad Seller System API",
      reportedVersion: "2.4.2",
      writesEnabled: true,
    });
  });

  it("ignores Escape and a backdrop click, and closes from Cancel", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <SWRConfig
        value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}
      >
        <ThemeProvider theme={theme}>
          <CredentialProvider>
            <DealWizard open onClose={onClose} />
          </CredentialProvider>
        </ThemeProvider>
      </SWRConfig>,
    );

    await user.click(await screen.findByRole("button", { name: "Next" }));
    const products = screen.getByRole("combobox", { name: "Products" });
    await user.type(products, "prod-1{Enter}");
    expect(await screen.findByText("prod-1")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(document.querySelector(".MuiBackdrop-root")!);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("prod-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
