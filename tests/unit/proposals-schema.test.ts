import { describe, expect, it } from "vitest";
import { LineItem, Proposal, ProposalList } from "../../src/api/endpoints";
import { openProposalSupport, OPENPROPOSAL_PROTOCOL } from "../../src/api/capabilities";
import { selectable, settable, unresolvedRefs } from "../../src/api/openproposal/shape";
import { FIELD_MARKERS } from "../../src/api/openproposal/fields";
import proposal from "../fixtures/openproposal/proposal.json";
import display from "../fixtures/openproposal/line-item-display.json";
import ctv from "../fixtures/openproposal/line-item-ctv.json";
import audio from "../fixtures/openproposal/line-item-audio.json";

const whole = { ...proposal, line_items: [display, ctv, audio] };

describe("the spec's own examples parse", () => {
  it("reads the composed proposal with all three line items", () => {
    const parsed = Proposal.parse(whole);
    expect(parsed.proposal_id).toBe("newscorp-us-q4-2026-omni");
    expect(parsed.best_for).toContain("B2B");
    expect(parsed.line_items.items.map((li) => li.channel)).toEqual(["display", "ctv", "audio"]);
    expect(parsed.line_items.unreadable).toBe(0);
  });

  it("normalises the display example's option spaces", () => {
    const li = LineItem.parse(display);
    expect(li.audiences).toMatchObject({ kind: "selectable", maxSelect: 2 });
    if (li.audiences?.kind !== "selectable") return;
    expect(li.audiences.available[0]).toEqual({
      id: null,
      label: "newscorp/audiences/smb-decision-makers@3",
      catalogRef: "newscorp/audiences/smb-decision-makers@3",
    });
    expect(li.audiences.pricing["nc:hnw-investors"]?.deltaCpm).toBe(4);
    expect(li.geo).toEqual({ kind: "allowed", allowed: ["US-NY", "US-CA", "US-IL", "US-TX"] });
    expect(li.commitment?.idempotency_key).toBe("wpp-volt2-wsj-display-8f42c1a9");
    expect(li.pricing[0]).toMatchObject({ gross_rate: 24, agreed_rate: 25.5, floor: 21 });
  });

  it("reads the CTV hold and the audio item that has no properties at all", () => {
    expect(LineItem.parse(ctv).hold_status).toMatchObject({ state: "held", hold_duration: "P14D" });
    expect(LineItem.parse(audio).properties).toBeNull();
  });

  it("finds the one unresolved catalog reference, on the wire and once parsed", () => {
    expect(unresolvedRefs(whole)).toEqual(["newscorp/audiences/smb-decision-makers@3"]);
    expect(unresolvedRefs(Proposal.parse(whole))).toEqual(["newscorp/audiences/smb-decision-makers@3"]);
  });
});

describe("a draft that moves does not blank the screen", () => {
  it("treats a bare selectable value as seller-set, as §3.1 requires", () => {
    expect(selectable("PROGRAMMATIC_GUARANTEED")).toEqual({
      kind: "seller-set",
      value: "PROGRAMMATIC_GUARANTEED",
    });
  });

  it("treats a settable field with no bounds as seller-set, as §3.2 requires", () => {
    expect(settable({ value: "US" })).toEqual({ kind: "seller-set", value: { value: "US" } });
    expect(settable({ min: "2026-10-01", max: "2026-12-31" })).toMatchObject({ kind: "range" });
  });

  it("keys an id-less option by its first string field, as included[] does", () => {
    const parsed = selectable({ available: [{ vendor: "IAS", attribution_window: "30d" }], included: ["IAS"] });
    expect(parsed).toMatchObject({ kind: "selectable", available: [{ id: "IAS" }], included: ["IAS"] });
  });

  it("degrades one malformed line item to a count, keeping its siblings", () => {
    const parsed = Proposal.parse({ ...whole, line_items: [display, { channel: "video" }, audio] });
    expect(parsed.line_items.items).toHaveLength(2);
    expect(parsed.line_items.unreadable).toBe(1);
  });

  it("keeps unknown fields and defaults malformed ones", () => {
    const parsed = LineItem.parse({ ...display, brand_new: { x: 1 }, pricing: "not an array", min_spend: "lots" });
    expect(parsed).toMatchObject({ brand_new: { x: 1 }, pricing: [], min_spend: null });
  });

  it("accepts a summary with no status, since §2.1 does not require one", () => {
    const list = ProposalList.parse({
      proposals: [{ proposal_id: "p-1", description: "d", line_items: [display] }, { nope: true }],
      total: 2,
    });
    expect(list.proposals.items[0]?.status).toBeNull();
    expect(list.proposals.unreadable).toBe(1);
  });
});

describe("OpenProposal support is read off the agent card", () => {
  const card = (protocols: string[]) => ({
    name: "seller",
    description: null,
    url: null,
    version: "",
    provider: null,
    capabilities: { protocols, streaming: false, push_notifications: false },
    skills: [],
  });

  it("is only supported when the protocol is advertised", () => {
    expect(openProposalSupport(card([OPENPROPOSAL_PROTOCOL, "opendirect21"]))).toBe("supported");
    expect(openProposalSupport(card(["opendirect21"]))).toBe("not-advertised");
    expect(openProposalSupport({ ...card([]), capabilities: null })).toBe("not-advertised");
  });

  it("is unknown, not unsupported, when there is no card to read", () => {
    expect(openProposalSupport(undefined)).toBe("unknown");
  });
});

describe("the marker table", () => {
  /** Appendix B of 3.0-draft-1 counts 71 fields; the table splits two of them. */
  it("covers the spec's field index", () => {
    expect(FIELD_MARKERS["commitment"]).toBe("settable");
    expect(FIELD_MARKERS["hold_status"]).toBe("requestable");
    const requestable = Object.entries(FIELD_MARKERS).filter(([, m]) => m === "requestable");
    expect(requestable.map(([f]) => f).sort()).toEqual(["committed_metrics", "hold_status", "materials_due"]);
  });
});
