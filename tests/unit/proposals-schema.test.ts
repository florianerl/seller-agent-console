import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "../setup/msw";
import {
  BuiltProposal,
  FieldMap,
  LineItem,
  ManyToOneResult,
  MappedBatch,
  MappedLineItem,
  NegotiationThread,
} from "../../src/api/endpoints";
import { openProposalSupport, probeOpenProposal } from "../../src/api/capabilities";
import { selectable, settable, unresolvedRefs } from "../../src/api/openproposal/shape";
import { FIELD_MARKERS } from "../../src/api/openproposal/fields";
import proposal from "../fixtures/openproposal/proposal.json";
import display from "../fixtures/openproposal/line-item-display.json";
import ctv from "../fixtures/openproposal/line-item-ctv.json";
import audio from "../fixtures/openproposal/line-item-audio.json";
import fieldMap from "../fixtures/openproposal/agent/field-map.json";
import mapped from "../fixtures/openproposal/agent/mapped-line-item.json";
import batch from "../fixtures/openproposal/agent/mapped-batch.json";
import manyToOne from "../fixtures/openproposal/agent/many-to-one.json";
import thread from "../fixtures/openproposal/agent/thread-open.json";

const whole = { ...proposal, line_items: [display, ctv, audio] };
const REF = "examplepub/audiences/smb-decision-makers@3";

describe("the spec's own examples parse", () => {
  it("reads the composed proposal with all three line items", () => {
    const parsed = BuiltProposal.parse(whole);
    expect(parsed.proposal_id).toBe("examplepub-us-q4-2026-omni");
    expect(parsed.line_items.items.map((li) => li.channel)).toEqual(["display", "ctv", "audio"]);
    expect(parsed.line_items.unreadable).toBe(0);
  });

  it("normalises the display example's option spaces", () => {
    const li = LineItem.parse(display);
    expect(li.audiences).toMatchObject({ kind: "selectable", maxSelect: 2 });
    if (li.audiences?.kind !== "selectable") return;
    expect(li.audiences.available[0]).toEqual({ id: null, label: REF, catalogRef: REF });
    expect(li.audiences.pricing["ep:hnw-investors"]?.deltaCpm).toBe(4);
    expect(li.geo).toEqual({ kind: "allowed", allowed: ["US-NY", "US-CA", "US-IL", "US-TX"] });
    // Corrected after the comment period: no priced option is included, so
    // the agreed rate is the gross rate.
    expect(li.pricing[0]).toMatchObject({ gross_rate: 24, agreed_rate: 24, floor: 21 });
  });

  it("reads the CTV hold and the audio item that has no properties at all", () => {
    expect(LineItem.parse(ctv).hold_status).toMatchObject({ state: "held", hold_duration: "P14D" });
    expect(LineItem.parse(audio).properties).toBeNull();
  });

  it("finds the one unresolved catalog reference, on the wire and once parsed", () => {
    expect(unresolvedRefs(whole)).toEqual([REF]);
    expect(unresolvedRefs(BuiltProposal.parse(whole))).toEqual([REF]);
  });
});

describe("the agent's answers parse", () => {
  it("reads all 96 rules of the real field map", () => {
    const parsed = FieldMap.parse(fieldMap);
    expect(parsed).toHaveLength(96);
    // `None` is omitted on the wire, so a rule with no home has no op_field.
    const priority = parsed.find((r) => r.gam_field === "priority");
    expect(priority?.status).toBe("no_home");
    expect(priority?.op_field ?? null).toBeNull();
  });

  it("reads a mapped line item with its provenance, and keeps the zone-bracketed flight as sent", () => {
    const parsed = MappedLineItem.parse(mapped);
    expect(parsed.line_item.line_item_id).toBe("gam-li-7202154879");
    expect(parsed.provenance["channel"]).toBe("inferred");
    expect(parsed.line_item.commitment?.flight_start).toBe("2026-03-01T00:00:00[America/New_York]");
    expect(parsed.field_report.find((e) => e.gam_field === "priority")?.value).toBe(8);
    expect(parsed.line_item).toMatchObject({ ext: { gam: { priority: 8 } } });
  });

  it("reads a batch with an unmappable entry", () => {
    const parsed = MappedBatch.parse(batch);
    expect(parsed.summary).toMatchObject({ total: 2, mapped: 1, unmappable_by_type: { HOUSE: 1 } });
    expect(parsed.results[1]?.mapped ?? null).toBeNull();
    expect(parsed.results[1]?.error).toContain("HOUSE");
  });

  it("reads a many-to-one proposal and its per-line-item report", () => {
    const parsed = ManyToOneResult.parse(manyToOne);
    expect(parsed.proposal.line_items.items).toHaveLength(2);
    expect(parsed.report?.[0]).toMatchObject({ serving_platform: "gam", source_objects: 2 });
  });

  it("reads a thread, with the rate each side named riding in ext", () => {
    const parsed = NegotiationThread.parse(thread);
    expect(parsed).toMatchObject({ version: 2, state: "open" });
    expect(parsed.negotiation_history.map((e) => [e.actor, e.action, e.ext?.rate])).toEqual([
      ["buyer", "proposed", 36],
      ["seller", "countered", 39],
    ]);
  });
});

describe("a draft that moves does not blank the screen", () => {
  it("treats a bare selectable value as seller-set, as §3.1 requires", () => {
    expect(selectable("PROGRAMMATIC_GUARANTEED")).toEqual({ kind: "seller-set", value: "PROGRAMMATIC_GUARANTEED" });
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
    const parsed = BuiltProposal.parse({ ...whole, line_items: [display, { channel: "video" }, audio] });
    expect(parsed.line_items.items).toHaveLength(2);
    expect(parsed.line_items.unreadable).toBe(1);
  });

  it("keeps unknown fields and defaults malformed ones", () => {
    const parsed = LineItem.parse({ ...display, brand_new: { x: 1 }, pricing: "not an array", min_spend: "lots" });
    expect(parsed).toMatchObject({ brand_new: { x: 1 }, pricing: [], min_spend: null });
  });

  it("does not let a reworded upstream vocabulary fail the map", () => {
    const parsed = FieldMap.parse([{ gam_field: "x", status: "brand_new_status", note: "" }]);
    expect(parsed[0]?.status).toBe("brand_new_status");
  });
});

describe("support is asked of the agent", () => {
  const connection = { baseUrl: API, apiKey: "k" };

  it("reads a 404 on the field map as an answer, not an outage", async () => {
    server.use(
      http.get(`${API}/api/v1/op-gam/line-item/field-map`, () =>
        HttpResponse.json({ detail: "Not Found" }, { status: 404 }),
      ),
    );
    const result = await probeOpenProposal(connection);
    expect(result).toMatchObject({ kind: "ok", data: null });
  });

  it("passes any other failure through, so it reads as unknown", async () => {
    server.use(http.get(`${API}/api/v1/op-gam/line-item/field-map`, () => new HttpResponse(null, { status: 500 })));
    const result = await probeOpenProposal(connection);
    expect(result).toMatchObject({ kind: "unavailable", status: 500 });
  });

  it("is supported on any map, not-served on none, unknown before an answer", () => {
    expect(openProposalSupport(FieldMap.parse(fieldMap))).toBe("supported");
    expect(openProposalSupport(null)).toBe("not-served");
    expect(openProposalSupport(undefined)).toBe("unknown");
  });
});

describe("the marker table", () => {
  it("covers the spec's field index", () => {
    expect(FIELD_MARKERS["commitment"]).toBe("settable");
    expect(FIELD_MARKERS["hold_status"]).toBe("requestable");
    const requestable = Object.entries(FIELD_MARKERS).filter(([, m]) => m === "requestable");
    expect(requestable.map(([f]) => f).sort()).toEqual(["committed_metrics", "hold_status", "materials_due"]);
  });
});
