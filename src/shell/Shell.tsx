import { Suspense, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
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
    <Box sx={{ display: "flex", minHeight: "100dvh", backgroundColor: palette.ground }}>
      {isDesktop ? (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              ...drawerPaper,
              pt: "env(safe-area-inset-top)",
            },
          }}
        >
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
              pt: "env(safe-area-inset-top)",
              pb: "env(safe-area-inset-bottom)",
            },
          }}
        >
          <Sidebar asHeading={false} onNavigate={() => setMobileOpen(false)} />
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box
          component="header"
          sx={{
            position: "sticky",
            top: 0,
            zIndex: (t) => t.zIndex.appBar,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: { xs: 2, md: 4 },
            py: 1.25,
            pt: "calc(env(safe-area-inset-top) + 10px)",
            backgroundColor: palette.paper,
            borderBottom: `1px solid ${palette.line}`,
            color: palette.brandBlack,
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
          {!isDesktop && (
            <Typography variant="h1" sx={{ flexGrow: 1, minWidth: 0 }}>
              Seller Agent Console
            </Typography>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, ml: "auto" }}>
            <WritesChip />
            <InstallButton />
            <ConnectionMenu />
          </Box>
        </Box>

        <Box
          sx={{
            flexGrow: 1,
            px: { xs: 2.5, md: 4 },
            py: { xs: 3, md: 4 },
            pb: "calc(env(safe-area-inset-bottom) + 32px)",
          }}
        >
          <Box sx={{ maxWidth: CONTENT_MAX_WIDTH }}>
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
      </Box>
    </Box>
  );
}
