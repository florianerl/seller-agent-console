import { Suspense, useState } from "react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { Outlet } from "react-router";
import { DRAWER_WIDTH, Sidebar } from "./Sidebar";
import { ConnectivityBanner } from "./ConnectivityBanner";
import { ConnectionMenu } from "./ConnectionMenu";
import { WritesChip } from "./WritesChip";
import { InstallButton } from "../pwa/InstallButton";
import { MenuIcon } from "../components/MenuIcon";
import { palette } from "../theme/palette";

export function Shell() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: "flex", minHeight: "100dvh" }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          backgroundColor: palette.brandBlack,
          zIndex: (t) => t.zIndex.drawer + 1,
          // apple-mobile-web-app-status-bar-style: black-translucent draws the
          // app under the status bar, and MUI does not inset for it.
          pt: "env(safe-area-inset-top)",
        }}
      >
        <Toolbar variant="dense">
          {!isDesktop && (
            <IconButton
              edge="start"
              color="inherit"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography
            variant="h1"
            sx={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.2, flexGrow: 1 }}
          >
            Seller Agent Console
          </Typography>
          <WritesChip />
          <InstallButton />
          <ConnectionMenu />
        </Toolbar>
      </AppBar>

      {isDesktop ? (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
              backgroundColor: palette.ground,
              borderRight: `1px solid ${palette.line}`,
            },
          }}
        >
          <Toolbar variant="dense" sx={{ pt: "env(safe-area-inset-top)" }} />
          <Sidebar />
        </Drawer>
      ) : (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              backgroundColor: palette.ground,
              pb: "env(safe-area-inset-bottom)",
            },
          }}
        >
          <Toolbar variant="dense" />
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, md: 3 },
          pb: "calc(env(safe-area-inset-bottom) + 16px)",
          minWidth: 0,
        }}
      >
        <Toolbar variant="dense" sx={{ pt: "env(safe-area-inset-top)" }} />
        <ConnectivityBanner />
        <Suspense
          fallback={
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
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
