import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { palette } from "../theme/palette";

/** Hand-drawn for the same reason as MenuIcon: no icon package. */
function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

/**
 * The list screens' free-text filter. One component so Orders and Deals search
 * the same way: a type-search box that Escape empties. The matching itself
 * stays with each screen, since what an operator pastes differs by list.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  field,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** `data-field` on the input, for tests and styling hooks. */
  field: string;
}) {
  return (
    <TextField
      type="search"
      size="small"
      label="Search"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onChange("");
      }}
      sx={{ flex: "1 1 260px", maxWidth: 420 }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start" sx={{ color: palette.textSecondary }}>
              <SearchIcon />
            </InputAdornment>
          ),
        },
        htmlInput: { "data-field": field },
      }}
    />
  );
}
