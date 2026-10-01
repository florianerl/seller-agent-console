import { useMemo, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Typography from "@mui/material/Typography";
import { bookDeal, createCuratedDeal, dealFromTemplate, generateDeal } from "../api/endpoints";
import { describe } from "../api/errors";
import { DEAL_TYPES, type DealTypeCode } from "../api/vocabulary";
import { EnumSelect } from "../components/EnumSelect";
import { TipField } from "../components/TipField";
import { useCredential } from "../credentials/context";
import { useMutation } from "../query/useMutation";
import { palette } from "../theme/palette";
import { CuratorPicker, ProductPicker } from "./pickers";

type Method = "quote" | "proposal" | "template" | "curated";

/**
 * The four routes that make a deal, as a choice. They were four unrelated
 * forms in a column, and which one an operator wants depends on what they are
 * holding (a quote, a proposal, a product) — so the first question is that,
 * and each form shrinks to the one or two fields its route needs.
 */
const METHODS: readonly { value: Method; title: string; description: string }[] = [
  {
    value: "quote",
    title: "Book a quote",
    description: "You have a quote. Binds it into a deal. This is the commit point.",
  },
  {
    value: "proposal",
    title: "From a proposal",
    description: "A buyer's proposal was accepted. Turns it into a deal.",
  },
  {
    value: "template",
    title: "From a template",
    description: "Start from a product. Prices it and books a deal in one step.",
  },
  {
    value: "curated",
    title: "For a curator",
    description: "Make a deal on behalf of a registered curator.",
  },
];

const STEPS = ["Choose", "Details", "Review"] as const;

/** What the agent does on each route, said before the operator commits. */
const CONSEQUENCE: Record<Method, string> = {
  quote:
    "The quote becomes bound and a deal is created. Retrying with the same quote returns the same deal; a different body is refused with a 409.",
  proposal:
    "Creates a deal from the accepted proposal. This is not the route that books a quote, and it is not idempotent: a retry after an unclear failure may create a second deal.",
  template:
    "Prices the product and books the deal immediately. Refused with a 422 if the maximum CPM is below the floor. A retry after an unclear failure may create a second deal.",
  curated: "Not idempotent: each call creates another curated deal.",
};

function newKey(): string {
  return crypto.randomUUID();
}

export function DealWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { writesEnabled } = useCredential();
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<Method>("quote");
  const [quoteId, setQuoteId] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [productId, setProductId] = useState("");
  // Short code: the template route maps PG/PD/PA and 400s on anything else.
  const [dealType, setDealType] = useState<DealTypeCode>("PD");
  const [curatorId, setCuratorId] = useState("");

  // One idempotency key per quote id: a retry of the same booking replays, and
  // a different quote is a different body, which the agent refuses under a key
  // it has already seen.
  const bookingKey = useMemo(() => newKey(), [quoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidates = ["deals:*"];
  const book = useMutation<{ quote_id: string; idempotency_key: string }, unknown>(
    (c, a) => bookDeal(c, a),
    { invalidates },
  );
  const gen = useMutation<{ proposal_id: string }, unknown>((c, a) => generateDeal(c, a), {
    invalidates,
  });
  const template = useMutation<{ deal_type: DealTypeCode; product_id: string }, unknown>(
    (c, a) => dealFromTemplate(c, a),
    { invalidates },
  );
  const curated = useMutation<{ curator_id: string }, unknown>(
    (c, a) => createCuratedDeal(c, a),
    { invalidates },
  );

  const active = { quote: book, proposal: gen, template, curated }[method];
  const last = active.last;
  const done = last?.kind === "ok";

  const q = quoteId.trim();
  const p = proposalId.trim();
  const prod = productId.trim();
  const cur = curatorId.trim();
  const ready = {
    quote: q !== "",
    proposal: p !== "",
    template: prod !== "",
    curated: cur !== "",
  }[method];

  const summary: readonly [string, string][] = {
    quote: [["Quote", q]] as [string, string][],
    proposal: [["Proposal", p]] as [string, string][],
    template: [
      ["Product", prod],
      ["Deal type", DEAL_TYPES.find((t) => t.value === dealType)?.label ?? dealType],
    ] as [string, string][],
    curated: [["Curator", cur]] as [string, string][],
  }[method];

  function create() {
    switch (method) {
      case "quote":
        return void book.run({ quote_id: q, idempotency_key: bookingKey });
      case "proposal":
        return void gen.run({ proposal_id: p });
      case "template":
        return void template.run({ deal_type: dealType, product_id: prod });
      case "curated":
        return void curated.run({ curator_id: cur });
    }
  }

  function close() {
    if (active.pending) return;
    onClose();
    // Reset after the dialog has gone, so a closing dialog does not flash back
    // to its first step. A finished wizard starts clean; an abandoned one too.
    setTimeout(() => {
      setStep(0);
      setQuoteId("");
      setProposalId("");
      setProductId("");
      setCuratorId("");
      book.reset();
      gen.reset();
      template.reset();
      curated.reset();
    }, 200);
  }

  let body: ReactNode;
  if (step === 0) {
    body = (
      <RadioGroup
        value={method}
        onChange={(e) => setMethod(e.target.value as Method)}
        aria-label="How to create the deal"
        sx={{ gap: 1 }}
      >
        {METHODS.map((m) => (
          <Box
            key={m.value}
            sx={{
              border: `1px solid ${method === m.value ? palette.brandRedText : palette.line}`,
              borderRadius: 1,
              px: 1.5,
              py: 0.5,
            }}
          >
            <FormControlLabel
              value={m.value}
              control={<Radio size="small" />}
              sx={{ alignItems: "flex-start", m: 0, width: "100%" }}
              label={
                <Box sx={{ pt: 0.75 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {m.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="p">
                    {m.description}
                  </Typography>
                </Box>
              }
            />
          </Box>
        ))}
      </RadioGroup>
    );
  } else if (step === 1) {
    body = (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        {method === "quote" && (
          <TipField
            hint="Id of the quote to book, from the Quotes screen. Quotes expire after 24 hours."
            size="small"
            label="Quote id"
            value={quoteId}
            onChange={(e) => setQuoteId(e.target.value)}
            autoFocus
            fullWidth
          />
        )}
        {method === "proposal" && (
          <TipField
            hint="Id of an accepted proposal. Copy it from the Proposals screen."
            size="small"
            label="Proposal id"
            value={proposalId}
            onChange={(e) => setProposalId(e.target.value)}
            autoFocus
            fullWidth
          />
        )}
        {method === "template" && (
          <>
            <ProductPicker
              value={productId}
              onChange={setProductId}
              hint="The product to price and book. Pick one, or type or paste an id."
              sx={{ width: "100%" }}
            />
            <EnumSelect
              hint="Deal type for the template: PG, PD or PA. The route rejects anything else with a 400."
              label="Deal type"
              value={dealType}
              options={DEAL_TYPES}
              onChange={(v) => v && setDealType(v)}
              sx={{ width: "100%" }}
            />
          </>
        )}
        {method === "curated" && (
          <CuratorPicker value={curatorId} onChange={setCuratorId} sx={{ width: "100%" }} />
        )}
      </Box>
    );
  } else {
    body = (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          {METHODS.find((m) => m.value === method)?.title}
        </Typography>
        <Box
          component="dl"
          sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.5 }}
        >
          {summary.map(([k, v]) => (
            <Box key={k} sx={{ display: "contents" }}>
              <Typography component="dt" variant="body2" color="text.secondary">
                {k}
              </Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, fontFamily: "monospace" }}>
                {v}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {CONSEQUENCE[method]}
        </Typography>
        {!writesEnabled && (
          <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
            Writes are switched off for this key. Turn them on from the connection menu to create
            the deal.
          </Alert>
        )}
        {last && last.kind !== "ok" && (
          <Typography variant="body2" sx={{ mt: 2, color: palette.error }} data-state="write-failed">
            {describe(last)}
          </Typography>
        )}
        {done && (
          <Alert severity="success" variant="outlined" sx={{ mt: 2 }} data-state="write-ok">
            The agent accepted this call. The new deal will appear in the list.
          </Alert>
        )}
      </Box>
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" data-block="deal-wizard">
      <DialogTitle>New deal</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3, mt: 0.5 }}>
          {STEPS.map((label) => (
            <Step key={label} completed={done || STEPS.indexOf(label) < step}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        {body}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {done ? (
          <Button variant="contained" onClick={close} data-action="wizard-done">
            Done
          </Button>
        ) : (
          <>
            <Button onClick={close} disabled={active.pending}>
              Cancel
            </Button>
            <Box sx={{ flex: 1 }} />
            {step > 0 && (
              <Button onClick={() => setStep(step - 1)} disabled={active.pending}>
                Back
              </Button>
            )}
            {step < 2 ? (
              <Button
                variant="contained"
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && !ready}
                data-action="wizard-next"
              >
                Next
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={create}
                disabled={!writesEnabled || active.pending}
                data-action="wizard-create"
              >
                {active.pending ? "Creating…" : "Create deal"}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
