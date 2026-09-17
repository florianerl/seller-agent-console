import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { API } from "../setup/msw";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, loadCredential, saveCredential } from "../../src/credentials/store";
import { resetWritePolicy } from "../../src/api/policy";
import { useMutation } from "../../src/query/useMutation";
import { useResource } from "../../src/query/useResource";
import type { Result } from "../../src/api/errors";
import type { Connection } from "../../src/api/http";

const ok = <T,>(data: T): Result<T> => ({ kind: "ok", data, fetchedAt: Date.now() });

function Harness({ children }: { children: ReactNode }) {
  return (
    <CredentialProvider>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
    </CredentialProvider>
  );
}

describe("useMutation", () => {
  beforeEach(async () => {
    await clearCredential();
    resetWritePolicy();
    await saveCredential({
      baseUrl: API,
      apiKey: "k-operator",
      role: "operator",
      name: "Ad Seller System API",
      reportedVersion: "2.4.2",
      writesEnabled: true,
    });
  });

  it("reports the outcome without throwing, and revalidates what it invalidated", async () => {
    let reads = 0;
    const decide = vi.fn((_c: Connection, args: { id: string }) => Promise.resolve(ok(args)));

    function Screen() {
      const orders = useResource("orders", () => {
        reads += 1;
        return Promise.resolve(ok({ n: reads }));
      });
      const decision = useMutation(decide, { invalidates: ["orders"] });

      return (
        <>
          <span data-testid="reads">{orders.data ? String(orders.data.n) : "-"}</span>
          <span data-testid="pending">{String(decision.pending)}</span>
          <span data-testid="last">{decision.last?.kind ?? "-"}</span>
          <button onClick={() => void decision.run({ id: "A-1" })}>decide</button>
        </>
      );
    }

    const user = userEvent.setup();
    render(
      <Harness>
        <Screen />
      </Harness>,
    );

    await waitFor(() => expect(screen.getByTestId("reads").textContent).toBe("1"));

    await user.click(screen.getByRole("button", { name: "decide" }));

    await waitFor(() => expect(screen.getByTestId("last").textContent).toBe("ok"));
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: API }),
      { id: "A-1" },
    );
    // The read the call invalidated was refetched; nothing patched it by hand.
    await waitFor(() => expect(screen.getByTestId("reads").textContent).toBe("2"));
  });

  it("invalidates every resource whose name matches a trailing-* prefix", async () => {
    let filteredReads = 0;
    const write = vi.fn(() => Promise.resolve(ok({ ok: true })));

    function Screen() {
      const list = useResource("change-requests:approved", () => {
        filteredReads += 1;
        return Promise.resolve(ok({ n: filteredReads }));
      });
      const mutation = useMutation(write, { invalidates: ["change-requests:*"] });

      return (
        <>
          <span data-testid="reads">{list.data ? String(list.data.n) : "-"}</span>
          <button onClick={() => void mutation.run(undefined)}>go</button>
        </>
      );
    }

    const user = userEvent.setup();
    render(
      <Harness>
        <Screen />
      </Harness>,
    );

    await waitFor(() => expect(screen.getByTestId("reads").textContent).toBe("1"));
    await user.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(screen.getByTestId("reads").textContent).toBe("2"));
  });

  /**
   * A double-click is never two intentions. The second attempt is refused
   * rather than queued, so "how many did the agent receive" stays answerable.
   */
  it("refuses a second call while the first is still in flight", async () => {
    let release: (() => void) | undefined;
    const slow = vi.fn(
      () =>
        new Promise<Result<{ done: true }>>((resolve) => {
          release = () => resolve(ok({ done: true as const }));
        }),
    );

    const outcomes: string[] = [];

    function Screen() {
      const m = useMutation(slow);
      return (
        <button
          onClick={() => {
            void m.run(undefined).then((r) => {
              outcomes.push(r.kind === "ok" ? "ok" : `${r.kind}:${"reason" in r ? r.reason : ""}`);
            });
          }}
        >
          go
        </button>
      );
    }

    const user = userEvent.setup();
    render(
      <Harness>
        <Screen />
      </Harness>,
    );

    const button = await screen.findByRole("button", { name: "go" });
    await user.click(button);
    await user.click(button);

    await waitFor(() => expect(outcomes).toContain("unavailable:busy"));
    expect(slow).toHaveBeenCalledTimes(1);

    release?.();
    await waitFor(() => expect(outcomes).toContain("ok"));
  });

  it("reports permitted only when writes are on", async () => {
    const stored = await loadCredential();
    await saveCredential({ ...stored!, writesEnabled: false });

    function Screen() {
      const m = useMutation(() => Promise.resolve(ok(1)));
      return <span data-testid="permitted">{String(m.permitted)}</span>;
    }

    render(
      <Harness>
        <Screen />
      </Harness>,
    );

    await waitFor(() => expect(screen.getByTestId("permitted").textContent).toBe("false"));
  });
});
