import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { http, HttpResponse } from "msw";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import ProposalsScreen from "../../src/screens/Proposals";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetReachability } from "../../src/query/reachability";
import { resetWritePolicy } from "../../src/api/policy";
import fieldMap from "./openproposal/agent/field-map.json";
import threadOpen from "./openproposal/agent/thread-open.json";

/** Shared by the Proposals screen and write tests. */

export const FIELD_MAP = fieldMap;
export const THREAD = threadOpen;
export const THREAD_ID = threadOpen.negotiation_id;

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

/** An agent on the OpenProposal branch: the probe answers with the real field map. */
export function serveOpenProposal() {
  server.use(http.get(`${API}/api/v1/op-gam/line-item/field-map`, () => HttpResponse.json(FIELD_MAP)));
}

/** An agent without it: FastAPI's 404 for a route it does not have. */
export function serveNoOpenProposal() {
  server.use(
    http.get(`${API}/api/v1/op-gam/line-item/field-map`, () =>
      HttpResponse.json({ detail: "Not Found" }, { status: 404 }),
    ),
  );
}

/**
 * Every request, seen at the transport rather than at a handler, so no handler
 * installed later can hide one. "Sends nothing else" is asserted against this.
 */
export function watchWire(): string[] {
  const seen: string[] = [];
  server.events.on("request:start", ({ request }) => {
    seen.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  return seen;
}
