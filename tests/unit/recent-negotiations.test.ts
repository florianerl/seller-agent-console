import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { NegotiationThread } from "../../src/api/endpoints";
import { clearCredential } from "../../src/credentials/store";
import { fromThread, readNegotiations, recordNegotiation } from "../../src/credentials/recentNegotiations";
import thread from "../fixtures/openproposal/agent/thread-open.json";

const parsed = NegotiationThread.parse(thread);

describe("the recent-negotiations store", () => {
  beforeEach(async () => {
    await clearCredential();
  });

  it("remembers the state, version and last named rate this browser saw", () => {
    expect(fromThread(parsed, 1000)).toEqual({
      negotiation_id: "opn-1a2b3c4d",
      proposal_id: "examplepub-standard",
      line_item_id: "inv-ctv-apex-series",
      state: "open",
      version: 2,
      rate: 39,
      currency: "USD",
      seen_at: 1000,
    });
  });

  it("keeps one entry per thread, the latest sighting first", async () => {
    await recordNegotiation("cred-a", fromThread(parsed, 1000));
    await recordNegotiation("cred-a", { ...fromThread(parsed, 2000), negotiation_id: "opn-other" });
    await recordNegotiation("cred-a", { ...fromThread(parsed, 3000), state: "accepted" });

    const list = await readNegotiations("cred-a");
    expect(list.map((n) => [n.negotiation_id, n.state])).toEqual([
      ["opn-1a2b3c4d", "accepted"],
      ["opn-other", "open"],
    ]);
  });

  it("keeps one list per credential, and loses it on sign-out", async () => {
    await recordNegotiation("cred-a", fromThread(parsed));
    expect(await readNegotiations("cred-b")).toEqual([]);

    await clearCredential();
    expect(await readNegotiations("cred-a")).toEqual([]);
  });
});
