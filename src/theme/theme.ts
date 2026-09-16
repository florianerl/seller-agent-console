import { createTheme } from "@mui/material/styles";
import { palette } from "./palette";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      // Fills and accents only.
      main: palette.brandRed,
      // Anything that carries text or sits behind white text.
      dark: palette.brandRedText,
      contrastText: palette.paper,
    },
    text: {
      primary: palette.text,
      secondary: palette.textSecondary,
      disabled: palette.disabled,
    },
    background: {
      default: palette.ground,
      paper: palette.paper,
    },
    divider: palette.line,
    success: { main: palette.ok },
    warning: { main: palette.warning, dark: palette.warningText },
    error: { main: palette.error, light: palette.errorBg },
    action: {
      disabled: palette.disabled,
    },
  },

  typography: {
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },

  shape: { borderRadius: 6 },

  components: {
    MuiButton: {
      styleOverrides: {
        // MUI resolves `contained primary` to palette.primary.main by default,
        // which would reintroduce the 4.12:1 defect on the most prominent
        // control in the console. Force the text-safe red.
        containedPrimary: {
          backgroundColor: palette.brandRedText,
          color: palette.paper,
          "&:hover": { backgroundColor: palette.brandRedText },
        },
        textPrimary: { color: palette.brandRedText },
        outlinedPrimary: { color: palette.brandRedText },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: { color: palette.brandRedText },
      },
    },
  },
});
