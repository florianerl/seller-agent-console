import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import { NavLink, useLocation } from "react-router";
import { SCREENS } from "./screens";
import { palette } from "../theme/palette";

export const DRAWER_WIDTH = 240;

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();

  return (
    <nav aria-label="Console sections">
      <List sx={{ py: 1 }}>
        {SCREENS.map((screen) => {
          if (screen.soon) {
            return (
              <ListItem key={screen.id} data-nav={screen.id} data-state="soon">
                {/* Not a control: a disabled button would be a focus stop that
                    does nothing, and announcing it as a button would lie.
                    Which is also why these are held to the 4.5:1 text bar and
                    not the 3:1 one — WCAG exempts disabled *controls*, and
                    having deliberately made these not controls, we do not get
                    to claim the exemption. The "soon" is carried by the chip's
                    own word, so dimming the label was never doing the work. */}
                <ListItemText
                  primary={screen.label}
                  slotProps={{
                    primary: { sx: { color: palette.textSecondary, fontSize: 14 } },
                  }}
                />
                <Chip
                  label="soon"
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: 11,
                    color: palette.textSecondary,
                    borderColor: palette.line,
                  }}
                  variant="outlined"
                />
              </ListItem>
            );
          }

          const active = pathname === screen.path;

          return (
            <ListItem key={screen.id} disablePadding data-nav={screen.id}>
              <ListItemButton
                component={NavLink}
                to={screen.path}
                end={screen.path === "/"}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                data-state={active ? "active" : "idle"}
                sx={{
                  "&.active": {
                    color: palette.brandRedText,
                    fontWeight: 600,
                    backgroundColor: "transparent",
                    borderLeft: `3px solid ${palette.brandRed}`,
                  },
                }}
              >
                <ListItemText
                  primary={screen.label}
                  slotProps={{ primary: { sx: { fontSize: 14 } } }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </nav>
  );
}
