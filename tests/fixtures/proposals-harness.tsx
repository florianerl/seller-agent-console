import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import ProposalsScreen from "../../src/screens/Proposals";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";
import { resetWritePolicy } from "../../src/api/policy";
import proposal from "./openproposal/proposal.json";
import display from "./openproposal/line-item-display.json";
import ctv from "./openproposal/line-item-ctv.json";
import audio from "./openproposal/line-item-audio.json";

/** Shared by the Proposals screen and write tests. */

export const card = (protocols: string[]) => ({
  name: "Ad Seller",
  description: null,
  url: "http://localhost:8000",
  version: "1.0.0",
  provider: { name: "Seller", url: null },
  capabilities: { protocols, streaming: false, push_notifications: false },
  skills: [],
});

/** The spec's own examples, with the CTV line item sold out under a live proposal. */
export const WHOLE = { ...proposal, line_items: [display, { ...ctv, status: "sold_out" }, audio] };

export function renderScreen() {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <ProposalsScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

export async function connect(writesEnabled = false) {
  resetReachability();
  resetWritePolicy();
  await clearCredential();
  await saveCredential({
    baseUrl: API,
    apiKey: "k",
    role: "operator",
    name: "Ad Seller System API",
    reportedVersion: "2.4.2",
    writesEnabled,
  });
}
