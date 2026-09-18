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

export function BrandMark({
  asHeading,
  compact = false,
}: {
  asHeading: boolean;
  compact?: boolean;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
      <Box
        aria-hidden
        sx={{
          width: 28,
          height: 28,
          backgroundColor: palette.brandRed,
          flexShrink: 0,
        }}
      />
      <Typography
        variant="h1"
        component={asHeading ? "h1" : "p"}
        sx={{ fontSize: compact ? 15 : 16, lineHeight: 1.15 }}
      >
        Seller Agent Console
      </Typography>
    </Box>
  );
}

function SoonItem({ screen }: { screen: Screen }) {
  return (
    <Box
      component="span"
      data-nav={screen.id}
      data-state="soon"
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, py: 1 }}
    >
      {/* Not a control: a disabled button would be a focus stop that
          does nothing, and announcing it as a button would lie.
          Which is also why these are held to the 4.5:1 text bar and
          not the 3:1 one — WCAG exempts disabled *controls*, and
          having deliberately made these not controls, we do not get
          to claim the exemption. The "soon" is carried by the chip's
          own word, so dimming the label was never doing the work. */}
      <Typography component="span" sx={{ color: palette.textSecondary, fontSize: 14 }}>
        {screen.label}
      </Typography>
      <Chip
        label="soon"
        size="small"
        variant="outlined"
        sx={{
          height: 20,
          fontSize: 11,
          color: palette.textSecondary,
          borderColor: palette.line,
        }}
      />
    </Box>
  );
}

export function ConsoleNav({
  onNavigate,
  stacked = false,
}: {
  onNavigate?: (() => void) | undefined;
  stacked?: boolean;
}) {
  const { pathname } = useLocation();

  if (!stacked) {
    return (
      <nav aria-label="Console sections">
        <Box
          sx={{
            display: "flex",
            flexWrap: "nowrap",
            alignItems: "center",
            columnGap: { md: 1.25, lg: 1.5, xl: 2 },
            rowGap: 0,
            overflowX: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {SCREENS.map((screen) => {
            if (screen.soon) {
              return <SoonItem key={screen.id} screen={screen} />;
            }
            const active = pathname === screen.path;
            return (
              <Box
                key={screen.id}
                component={NavLink}
                to={screen.path}
                end={screen.path === "/"}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                data-nav={screen.id}
                data-state={active ? "active" : "idle"}
                sx={{
                  color: active ? palette.brandRedText : palette.brandBlack,
                  fontSize: { md: 13, lg: 13.5, xl: 14 },
                  fontWeight: 600,
                  textDecoration: "none",
                  borderBottom: active
                    ? `2px solid ${palette.brandRed}`
                    : "2px solid transparent",
                  py: 1.25,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {screen.label}
              </Box>
            );
          })}
        </Box>
      </nav>
    );
  }

  const byId = new Map(SCREENS.map((screen) => [screen.id, screen]));

  return (
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
              if (screen.soon) {
                return (
                  <ListItem key={screen.id} data-nav={screen.id} data-state="soon" sx={{ px: 1 }}>
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
              const active = pathname === screen.path;
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
                      borderRadius: 0,
                      py: 1,
                      px: 1.5,
                      "&.active": {
                        color: palette.brandRedText,
                        fontWeight: 700,
                        backgroundColor: palette.navActiveWash,
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
        </Box>
      ))}
    </nav>
  );
}

export function Sidebar({
  onNavigate,
  asHeading = true,
}: {
  onNavigate?: (() => void) | undefined;
  asHeading?: boolean;
}) {
  return (
    <>
      <Box sx={{ px: 3, pt: 3, pb: 2 }}>
        <BrandMark asHeading={asHeading} />
      </Box>
      <ConsoleNav stacked onNavigate={onNavigate} />
    </>
  );
}
