import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Autocomplete from "@mui/material/Autocomplete";
import type { ReactNode } from "react";
import Typography from "@mui/material/Typography";
import { SSP_NAMES } from "../api/vocabulary";
import { TipField } from "../components/TipField";

/** Small shared pieces of the deal forms: a folded "optional" section and the SSP name field. */

export function Optional({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <Accordion disableGutters variant="outlined" sx={{ "&:before": { display: "none" } }}>
      <AccordionSummary
        expandIcon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        }
      >
        <Typography variant="body2">{summary}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ display: "flex", flexDirection: "column", gap: 2 }}>{children}</AccordionDetails>
    </Accordion>
  );
}


/**
 * Which connectors exist is deployment settings, not code, so the known
 * names are suggestions and anything can be typed. An unknown name is a 400
 * that lists the configured ones.
 */
export function SspNameField({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Autocomplete
      freeSolo
      size="small"
      options={SSP_NAMES}
      inputValue={value}
      onInputChange={(_, next) => onChange(next)}
      disabled={disabled}
      sx={{ minWidth: 200 }}
      renderInput={(params) => <TipField {...params} hint={hint} label={label} />}
    />
  );
}
