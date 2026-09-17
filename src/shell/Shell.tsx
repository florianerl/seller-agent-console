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
import { CONTENT_MAX_WIDTH } from "../components/DataPanel";
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
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            flexWrap: "wrap",
            px: { xs: 2, md: 4 },
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
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <ConsoleNav />
            </Box>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, ml: "auto" }}>
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
        <Box sx={{ px: { xs: 2.5, md: 4 }, pt: 1.5 }}>
          <Box sx={{ maxWidth: CONTENT_MAX_WIDTH }}>
            <ConnectivityBanner />
          </Box>
        </Box>
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
