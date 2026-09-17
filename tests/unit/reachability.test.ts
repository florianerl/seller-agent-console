import { beforeEach, describe, expect, it } from "vitest";
import {
  getAgentUnreachable,
  reportResult,
  resetReachability,
  subscribeReachability,
} from "../../src/query/reachability";

describe("the agent-unreachable signal", () => {
  beforeEach(() => resetReachability());

  // A single failing endpoint is the card's business, not the shell's.
  it("stays quiet while only one or two resources fail", () => {
    reportResult("health", true);
    expect(getAgentUnreachable()).toBe(false);
    reportResult("events", true);
    expect(getAgentUnreachable()).toBe(false);
  });

  it("speaks up once several resources agree", () => {
    reportResult("health", true);
    reportResult("events", true);
    reportResult("sync", true);
    expect(getAgentUnreachable()).toBe(true);
  });

  it("counts distinct resources, not repeated failures of one", () => {
    reportResult("health", true);
    reportResult("health", true);
    reportResult("health", true);
    expect(getAgentUnreachable()).toBe(false);
  });

  it("clears as soon as the agent starts answering again", () => {
    for (const name of ["health", "events", "sync"]) reportResult(name, true);
    expect(getAgentUnreachable()).toBe(true);

    reportResult("health", false);
    expect(getAgentUnreachable()).toBe(false);
  });

  it("notifies subscribers only when the answer changes", () => {
    let notifications = 0;
    subscribeReachability(() => {
      notifications += 1;
    });

    reportResult("health", true);
    reportResult("events", true);
    expect(notifications).toBe(0);

    reportResult("sync", true);
    expect(notifications).toBe(1);

    // Still unreachable; no further notification.
    reportResult("orders", true);
    expect(notifications).toBe(1);
  });
});
