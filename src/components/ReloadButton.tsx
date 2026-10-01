import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

/**
 * The small re-read control a card puts top right, in DetailCard's `meta`
 * slot. Hand-drawn for the same reason as MenuIcon: no icon package. Disabled
 * while a read is in flight, so a second click cannot stack a second request
 * on a route that spends someone's quota.
 */
export function ReloadButton({
  onClick,
  busy,
  what,
}: {
  onClick: () => void;
  busy: boolean;
  /** Completes the label: "Reload {what}". */
  what: string;
}) {
  return (
    <Tooltip title={busy ? "Reading…" : `Reload ${what}`} enterDelay={400}>
      {/* A span, so the tooltip still has a target while the button is disabled. */}
      <span>
        <IconButton
          size="small"
          onClick={onClick}
          disabled={busy}
          aria-label={`Reload ${what}`}
          data-action="reload"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M20 11a8 8 0 1 0-2.3 5.7" />
            <polyline points="20 4 20 11 13 11" />
          </svg>
        </IconButton>
      </span>
    </Tooltip>
  );
}
