import { useState } from "react";
import Box from "@mui/material/Box";
import { distributeDeal, pushDeal } from "../api/endpoints";
import { TipField } from "../components/TipField";
import { FormFields, WriteForm } from "../components/WriteForm";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { Optional, SspNameField } from "./dealFields";
import { splitList, useJsonObject, useListField } from "./dealHooks";

/**
 * Handing a deal to a buyer or an SSP, with every field the agent's request
 * takes. Shared by the deal's own card and the wizard's "send it now", so the
 * same call is never offered with two different sets of fields.
 *
 * What is left empty is left out of the request, which is what makes the
 * overrides optional: the agent fills the rest from the deal itself.
 */

const optNumber = (text: string): { value: number | undefined; ok: boolean } => {
  if (text.trim() === "") return { value: undefined, ok: true };
  const n = Number(text);
  return { value: n, ok: Number.isFinite(n) && n > 0 };
};
const optInt = (text: string): { value: number | undefined; ok: boolean } => {
  const r = optNumber(text);
  return { value: r.value, ok: r.ok && (r.value === undefined || Number.isInteger(r.value)) };
};
const datesOk = (a: string, b: string) => (a === "" && b === "") || (a !== "" && b !== "" && b >= a);

export function PushForm({ dealId }: { dealId: string }) {
  const { writesEnabled } = useCredential();
  const blocked = !writesEnabled;
  const [urls, setUrls] = useState("");
  const [keys, setKeys] = useState("");
  const [dealType, setDealType] = useState("");
  const [price, setPrice] = useState("");
  const [name, setName] = useState("");
  const [impressions, setImpressions] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const seats = useListField("Buyer seat ids", "Seat ids the deal is restricted to, separated by commas. Leave empty for any seat.");

  const push = useMutation<Parameters<typeof pushDeal>[1], unknown>((c, a) => pushDeal(c, a), {
    invalidates: ["deals:*"],
  });

  const buyerUrls = splitList(urls);
  const apiKeys = splitList(keys);
  const p = optNumber(price);
  const imp = optInt(impressions);
  const fieldsOk = p.ok && imp.ok && datesOk(start, end) && (apiKeys.length === 0 || apiKeys.length === buyerUrls.length);

  return (
    <Box>
    <WriteForm
      title="Push this deal to buyers?"
      confirmLabel="Push"
      action="push-deal"
      blocked={blocked || buyerUrls.length === 0 || !fieldsOk}
      pending={push.pending}
      last={push.last}
      onConfirm={() =>
        void push.run({
          deal_id: dealId,
          buyer_urls: buyerUrls,
          ...(apiKeys.length ? { buyer_api_keys: apiKeys } : {}),
          ...(dealType.trim() ? { deal_type: dealType.trim() } : {}),
          ...(p.value !== undefined ? { price: p.value } : {}),
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(imp.value !== undefined ? { impressions: imp.value } : {}),
          ...(start ? { flight_start: start, flight_end: end } : {}),
          ...(seats.value ? { buyer_seat_ids: seats.value } : {}),
        })
      }
      consequence="Notifies the named buyer URLs. A retry may notify twice."
    >
      <FormFields>
        <TipField
          hint="Full URL of each buyer agent to notify, for example https://buyer.example. Separate several with commas; each gets the deal."
          size="small"
          label="Buyer URLs"
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          disabled={blocked}
          sx={{ minWidth: 280 }}
        />
      </FormFields>
    </WriteForm>
    <Box sx={{ mt: 1.5 }}>
      <Optional summary="Override what is sent (optional)">
        <TipField
          hint="API keys for buyers that need one, in the same order as the URLs, separated by commas. Sent to the agent, which uses them to call each buyer."
          size="small"
          label="Buyer API keys"
          type="password"
          autoComplete="off"
          value={keys}
          onChange={(e) => setKeys(e.target.value)}
          error={apiKeys.length > 0 && apiKeys.length !== buyerUrls.length}
          helperText={apiKeys.length > 0 && apiKeys.length !== buyerUrls.length ? "Give one key per URL, in the same order." : undefined}
          fullWidth
        />
        <TipField hint="Deal type to send, for example PMP or PD. Left empty, the deal's own is used." size="small" label="Deal type" value={dealType} onChange={(e) => setDealType(e.target.value)} fullWidth />
        <TipField hint="Name the buyer sees. Left empty, the deal's own is used." size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
        <TipField hint="Price in dollars to send instead of the deal's, a plain number." size="small" type="number" label="Price" value={price} onChange={(e) => setPrice(e.target.value)} error={!p.ok} fullWidth />
        <TipField hint="Impressions to send instead of the deal's, a whole number above zero." size="small" type="number" label="Impressions" value={impressions} onChange={(e) => setImpressions(e.target.value)} error={!imp.ok} fullWidth />
        <TipField hint="First day of the flight to send. Give both dates or neither." size="small" type="date" label="Flight start" slotProps={{ inputLabel: { shrink: true } }} value={start} onChange={(e) => setStart(e.target.value)} fullWidth />
        <TipField hint="Last day of the flight to send, on or after the start." size="small" type="date" label="Flight end" slotProps={{ inputLabel: { shrink: true } }} value={end} onChange={(e) => setEnd(e.target.value)} error={!datesOk(start, end) && end !== ""} fullWidth />
        {seats.node}
      </Optional>
    </Box>
    </Box>
  );
}

export function DistributeForm({ dealId }: { dealId: string }) {
  const { writesEnabled } = useCredential();
  const blocked = !writesEnabled;
  const [ssp, setSsp] = useState("");
  const [dealType, setDealType] = useState("");
  const [name, setName] = useState("");
  const [advertiser, setAdvertiser] = useState("");
  const [cpm, setCpm] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [inventory, setInventory] = useState("");
  const seats = useListField("Buyer seat ids", "Seat ids the deal is restricted to, separated by commas. Leave empty for any seat.");
  const targeting = useJsonObject("Targeting (JSON)", "Targeting handed to the SSP, as a JSON object. Left empty, none is sent.");

  const dist = useMutation<Parameters<typeof distributeDeal>[1], unknown>((c, a) => distributeDeal(c, a), {
    invalidates: ["deals:*"],
  });
  const c = optNumber(cpm);
  const fieldsOk = c.ok && datesOk(start, end) && targeting.valid;

  return (
    <Box>
    <WriteForm
      title="Distribute this deal to an SSP?"
      confirmLabel="Distribute"
      action="distribute-deal"
      blocked={blocked || !fieldsOk}
      pending={dist.pending}
      last={dist.last}
      onConfirm={() =>
        void dist.run({
          deal_id: dealId,
          ...(ssp.trim() ? { ssp_name: ssp.trim() } : {}),
          ...(dealType.trim() ? { deal_type: dealType.trim() } : {}),
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(advertiser.trim() ? { advertiser: advertiser.trim() } : {}),
          ...(c.value !== undefined ? { cpm: c.value } : {}),
          ...(seats.value ? { buyer_seat_ids: seats.value } : {}),
          ...(start ? { start_date: start, end_date: end } : {}),
          ...(targeting.value ? { targeting: targeting.value } : {}),
          ...(inventory.trim() ? { inventory_type: inventory.trim() } : {}),
        })
      }
      consequence="A retry may push a second copy to the SSP."
    >
      <FormFields>
        <SspNameField
          label="SSP name (optional)"
          hint="Name of the SSP connector to send the deal to. Pick a known one or type another; leave it empty to let the agent route it. An unknown name is a 400 that lists the configured ones."
          value={ssp}
          onChange={setSsp}
          disabled={blocked}
        />
      </FormFields>
    </WriteForm>
    <Box sx={{ mt: 1.5 }}>
      <Optional summary="Override what is sent (optional)">
        <TipField hint="Deal type for the SSP; the agent defaults it to PMP." size="small" label="Deal type" value={dealType} onChange={(e) => setDealType(e.target.value)} fullWidth />
        <TipField hint="Name the SSP shows for the deal." size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
        <TipField hint="Advertiser the deal is for." size="small" label="Advertiser" value={advertiser} onChange={(e) => setAdvertiser(e.target.value)} fullWidth />
        <TipField hint="CPM in dollars to send instead of the deal's, a plain number." size="small" type="number" label="CPM" value={cpm} onChange={(e) => setCpm(e.target.value)} error={!c.ok} fullWidth />
        <TipField hint="First day the deal runs. Give both dates or neither." size="small" type="date" label="Start date" slotProps={{ inputLabel: { shrink: true } }} value={start} onChange={(e) => setStart(e.target.value)} fullWidth />
        <TipField hint="Last day the deal runs, on or after the start." size="small" type="date" label="End date" slotProps={{ inputLabel: { shrink: true } }} value={end} onChange={(e) => setEnd(e.target.value)} error={!datesOk(start, end) && end !== ""} fullWidth />
        <TipField hint="Inventory type the SSP should use, for example display or video." size="small" label="Inventory type" value={inventory} onChange={(e) => setInventory(e.target.value)} fullWidth />
        {seats.node}
        {targeting.node}
      </Optional>
    </Box>
    </Box>
  );
}
