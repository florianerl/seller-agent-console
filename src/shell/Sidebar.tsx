import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { NavLink, useLocation } from "react-router";
import { NAV_GROUPS, SCREENS, type Screen } from "./screens";
import { palette } from "../theme/palette";

export const DRAWER_WIDTH = 272;

function Brand({ asHeading }: { asHeading: boolean }) {
  return (
    <Box sx={{ px: 3, pt: 3, pb: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <Box
          aria-hidden
          sx={{
            width: 10,
            height: 10,
            borderRadius: "3px",
            backgroundColor: palette.brandRed,
            flexShrink: 0,
          }}
        />
        <Typography variant="h1" component={asHeading ? "h1" : "p"}>
          Seller Agent Console
        </Typography>
      </Box>
    </Box>
  );
}

function NavItem({
  screen,
  active,
  onNavigate,
}: {
  screen: Screen;
  active: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  if (screen.soon) {
    return (
      <ListItem key={screen.id} data-nav={screen.id} data-state="soon" sx={{ px: 1 }}>
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
            height: 22,
            fontSize: 11,
            color: palette.textSecondary,
            borderColor: palette.line,
          }}
          variant="outlined"
        />
      </ListItem>
    );
  }

  return (
    <ListItem key={screen.id} disablePadding data-nav={screen.id} sx={{ mb: 0.25 }}>
      <ListItemButton
        component={NavLink}
        to={screen.path}
        end={screen.path === "/"}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        data-state={active ? "active" : "idle"}
        sx={{
          borderRadius: 2,
          py: 1,
          px: 1.5,
          "&.active": {
            color: palette.brandRedText,
            fontWeight: 700,
            backgroundColor: palette.navActiveWash,
          },
        }}
      >
        <ListItemText primary={screen.label} slotProps={{ primary: { sx: { fontSize: 14 } } }} />
      </ListItemButton>
    </ListItem>
  );
}

export function Sidebar({
  onNavigate,
  asHeading = true,
}: {
  onNavigate?: (() => void) | undefined;
  asHeading?: boolean;
}) {
  const { pathname } = useLocation();
  const byId = new Map(SCREENS.map((screen) => [screen.id, screen]));

  return (
    <>
      <Brand asHeading={asHeading} />
      <nav aria-label="Console sections">
        {NAV_GROUPS.map((group) => (
          <Box key={group.label} sx={{ px: 1.5, mb: 2.5 }}>
            <Typography
              variant="caption"
              component="p"
              sx={{
                px: 1.5,
                mb: 0.75,
                fontWeight: 600,
                color: palette.textSecondary,
              }}
            >
              {group.label}
            </Typography>
            <List disablePadding>
              {group.ids.map((id) => {
                const screen = byId.get(id);
                if (!screen) return null;
                return (
                  <NavItem
                    key={screen.id}
                    screen={screen}
                    active={pathname === screen.path}
                    onNavigate={onNavigate}
                  />
                );
              })}
            </List>
          </Box>
        ))}
      </nav>
    </>
  );
}
