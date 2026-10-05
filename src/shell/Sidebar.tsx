import { useId } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { NavLink, useLocation } from "react-router";
import { NAV_GROUPS, NAV_SCREENS, type NavGroup, type Screen } from "./screens";
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

const byId = new Map(NAV_SCREENS.map((screen) => [screen.id, screen]));

function groupScreens(group: NavGroup): Screen[] {
  return group.ids.flatMap((id) => byId.get(id) ?? []);
}

/**
 * The horizontal header draws the lifecycle: each stage is a captioned
 * cluster, consecutive stages are joined by a chevron, and a group that is not
 * a stage (Overview) sits apart behind a divider. Links share one bottom edge
 * so the active underline lines up whether or not a cluster has a caption.
 */
function HeaderNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: (() => void) | undefined;
}) {
  // A hidden screen can empty a group (Proposals alone would); drop the group
  // rather than draw a caption over nothing.
  const groups = NAV_GROUPS.map((group) => ({ group, screens: groupScreens(group) })).filter(
    ({ screens }) => screens.length > 0,
  );

  return (
    <nav aria-label="Console sections">
      <Box
        sx={{
          display: "flex",
          flexWrap: "nowrap",
          alignItems: "flex-end",
          columnGap: { md: 1, lg: 1.25, xl: 1.75 },
          overflowX: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {groups.map(({ group, screens }, i) => {
          const previous = groups[i - 1]?.group;
          return (
            <Box key={group.label} sx={{ display: "contents" }}>
              {previous &&
                (previous.stage && group.stage ? <StageChevron /> : <GroupDivider />)}
              <HeaderGroup
                group={group}
                screens={screens}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            </Box>
          );
        })}
      </Box>
    </nav>
  );
}

function HeaderGroup({
  group,
  screens,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  screens: Screen[];
  pathname: string;
  onNavigate?: (() => void) | undefined;
}) {
  const captionId = useId();
  return (
    <Box
      role="group"
      // The caption names the group when it is shown; Overview has none, so
      // it is named directly and a screen reader still hears where it is.
      {...(group.stage ? { "aria-labelledby": captionId } : { "aria-label": group.label })}
      data-nav-group={group.label}
      sx={{ display: "flex", flexDirection: "column", flexShrink: 0 }}
    >
      {group.stage && (
        <Typography
          id={captionId}
          component="span"
          sx={{ fontSize: 11, lineHeight: 1.2, color: palette.textSecondary, whiteSpace: "nowrap" }}
        >
          {group.label}
        </Typography>
      )}
      <Box sx={{ display: "flex", alignItems: "center", columnGap: { md: 1.25, lg: 1.5, xl: 2 } }}>
        {screens.map((screen) =>
          screen.soon ? (
            <SoonItem key={screen.id} screen={screen} />
          ) : (
            <HeaderLink
              key={screen.id}
              screen={screen}
              active={pathname === screen.path}
              onNavigate={onNavigate}
            />
          ),
        )}
      </Box>
    </Box>
  );
}

function HeaderLink({
  screen,
  active,
  onNavigate,
}: {
  screen: Screen;
  active: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <Box
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
        borderBottom: active ? `2px solid ${palette.brandRed}` : "2px solid transparent",
        py: 1,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {screen.label}
    </Box>
  );
}

function StageChevron() {
  // Decoration: the order is already the reading order, so a screen reader
  // has nothing to gain from hearing "greater than" between stages.
  return (
    <Box
      component="span"
      aria-hidden
      sx={{ color: palette.textSecondary, fontSize: 16, lineHeight: 1, pb: 1.25, flexShrink: 0 }}
    >
      ›
    </Box>
  );
}

function GroupDivider() {
  return (
    <Box
      aria-hidden
      sx={{ alignSelf: "stretch", width: "1px", my: 0.5, backgroundColor: palette.line, flexShrink: 0 }}
    />
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
    return <HeaderNav pathname={pathname} onNavigate={onNavigate} />;
  }

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
