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
import { CONTENT_MAX_WIDTH } from "../components/DataPanel";
import { palette } from "../theme/palette";

const drawerPaper = {
  width: DRAWER_WIDTH,
  boxSizing: "border-box" as const,
  backgroundColor: palette.paper,
  borderRight: `1px solid ${palette.line}`,
};

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
          borderBottom: `3px solid ${palette.brandRed}`,
          // apple-mobile-web-app-status-bar-style: black-translucent draws the
          // app under the status bar, and MUI does not inset for it.
          pt: "env(safe-area-inset-top)",
        }}
      >
        <Toolbar>
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
          <Typography variant="h1" sx={{ flexGrow: 1 }}>
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
            "& .MuiDrawer-paper": drawerPaper,
          }}
        >
          <Toolbar sx={{ pt: "env(safe-area-inset-top)", minHeight: { xs: 59, sm: 67 } }} />
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
              ...drawerPaper,
              pb: "env(safe-area-inset-bottom)",
            },
          }}
        >
          <Toolbar />
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, md: 3 },
          pb: "calc(env(safe-area-inset-bottom) + 24px)",
          minWidth: 0,
        }}
      >
        <Toolbar sx={{ pt: "env(safe-area-inset-top)", minHeight: { xs: 59, sm: 67 } }} />
        <Box sx={{ maxWidth: CONTENT_MAX_WIDTH }}>
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
    </Box>
  );
}
