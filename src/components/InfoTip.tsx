import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { palette } from "../theme/palette";

/**
 * An (i) that holds the explanation a section needs but a reader only wants
 * once. The Orders row had grown a caption under every control; moving the
 * background into these keeps the facts one hover, focus or tap away without
 * each one competing with the action it explains.
 *
 * A real button, so it is reachable by keyboard and a tap opens it
 * (`enterTouchDelay` 0). MUI names it with the tooltip's text, so a screen
 * reader hears the explanation itself rather than "info". `data-*` props are
 * passed through for tests and styling hooks.
 */
export function InfoTip({ title, ...rest }: { title: string } & { [key: `data-${string}`]: string }) {
  return (
    <Tooltip title={title} arrow placement="top" enterTouchDelay={0} leaveTouchDelay={8000}>
      <IconButton
        size="small"
        {...rest}
        // 28px keeps it a comfortable target without crowding a heading.
        sx={{ width: 28, height: 28, color: palette.textSecondary }}
      >
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
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <line x1="12" y1="8" x2="12" y2="8" />
        </svg>
      </IconButton>
    </Tooltip>
  );
}
