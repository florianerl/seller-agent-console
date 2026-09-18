import { Suspense, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { Outlet } from "react-router";
import { BrandMark, ConsoleNav, Sidebar } from "./Sidebar";
import { ConnectivityBanner } from "./ConnectivityBanner";
import { ConnectionMenu } from "./ConnectionMenu";
import { WritesChip } from "./WritesChip";
import { InstallButton } from "../pwa/InstallButton";
import { MenuIcon } from "../components/MenuIcon";
import { MastheadMotif } from "../components/MastheadMotif";
import { palette } from "../theme/palette";
import { DRAWER_WIDTH } from "./screens";

export function Shell() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ minHeight: "100dvh", backgroundColor: palette.paper, display: "flex", flexDirection: "column" }}>
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: (t) => t.zIndex.appBar,
          backgroundColor: palette.paper,
          borderBottom: `1px solid ${palette.line}`,
          color: palette.brandBlack,
          pt: "env(safe-area-inset-top)",
          overflow: "hidden",
        }}
      >
        <MastheadMotif />
        <Box
          sx={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: { xs: 1.5, md: 2, xl: 2.5 },
            flexWrap: "nowrap",
            pl: { xs: 2, md: 4 },
            pr: { xs: 8, md: 10.5 },
            py: 1,
            minHeight: 64,
          }}
        >
          {!isDesktop && (
            <IconButton
              edge="start"
              color="inherit"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <MenuIcon />
            </IconButton>
          )}
          <BrandMark asHeading compact={!isDesktop} />
          {isDesktop && (
            <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <ConsoleNav />
            </Box>
          )}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 1, md: 1.25 },
              ml: "auto",
              flexShrink: 0,
            }}
          >
            <WritesChip />
            <InstallButton />
            <ConnectionMenu />
          </Box>
        </Box>
      </Box>

      {!isDesktop && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
              backgroundColor: palette.paper,
              pt: "env(safe-area-inset-top)",
              pb: "env(safe-area-inset-bottom)",
            },
          }}
        >
          <Sidebar asHeading={false} onNavigate={() => setMobileOpen(false)} />
        </Drawer>
      )}

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <ConnectivityBanner />
        <Suspense
          fallback={
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress aria-label="Loading screen" size={28} />
            </Box>
          }
        >
          <Outlet />
        </Suspense>
      </Box>
    </Box>
  );
}
