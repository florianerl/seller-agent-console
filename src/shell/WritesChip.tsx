import Chip from "@mui/material/Chip";
import { useCredential } from "../credentials/context";
import { palette } from "../theme/palette";

/**
 * Says, in the app bar, that this console can currently change things.
 *
 * The switch that sets it is one click deep in the connection menu, and it
 * changes what every button in the app does. A mode you cannot see without
 * going to look for it is a mode you forget you are in, so the on state is
 * stated where it cannot be missed. There is no chip for the off state: the
 * absence of the chip is the quiet, ordinary case.
 */
export function WritesChip() {
  const { credential, writesEnabled } = useCredential();

  if (!credential || !writesEnabled) return null;

  return (
    <Chip
      size="small"
      label="Writes on"
      data-writes="on"
      sx={{
        mr: 1.5,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        color: palette.brandBlack,
        backgroundColor: palette.attention,
      }}
    />
  );
}
