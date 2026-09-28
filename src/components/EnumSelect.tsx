import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import type { SxProps, Theme } from "@mui/material/styles";
import type { Option } from "../api/vocabulary";

/**
 * A select over a closed value set. Where the agent validates a field against
 * an enum, a text box only lets the operator find that out by being refused;
 * this offers the set instead.
 *
 * `any` adds an empty first entry for filters, where "no filter" is a choice.
 */
export function EnumSelect<V extends string>({
  label,
  value,
  options,
  onChange,
  any,
  disabled,
  sx,
}: {
  label: string;
  value: V | "";
  options: readonly Option<V>[];
  onChange: (value: V | "") => void;
  any?: string;
  disabled?: boolean;
  sx?: SxProps<Theme>;
}) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as V | "")}
      disabled={disabled}
      sx={sx ?? { minWidth: 200 }}
    >
      {any !== undefined && <MenuItem value="">{any}</MenuItem>}
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
