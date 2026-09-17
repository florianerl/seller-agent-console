import { createTheme } from "@mui/material/styles";
import { palette } from "./palette";

const fontFamily =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

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
    fontFamily,
    h1: {
      fontFamily,
      fontSize: 16,
      fontWeight: 700,
      letterSpacing: -0.4,
      lineHeight: 1.2,
      color: palette.brandBlack,
    },
    h2: {
      fontFamily,
      fontSize: 40,
      fontWeight: 700,
      letterSpacing: -0.9,
      lineHeight: 1.1,
      color: palette.brandBlack,
    },
    h3: {
      fontFamily,
      fontSize: 15,
      fontWeight: 600,
      letterSpacing: -0.2,
      lineHeight: 1.3,
      color: palette.brandBlack,
    },
    overline: {
      fontFamily,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1.2,
      lineHeight: 1.4,
      textTransform: "uppercase",
      color: palette.brandRedText,
    },
    body1: {
      fontSize: 15,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: 14,
      lineHeight: 1.5,
    },
    caption: {
      fontSize: 12,
      lineHeight: 1.4,
    },
    button: {
      fontWeight: 600,
      letterSpacing: 0.1,
      textTransform: "none",
    },
  },

  shape: { borderRadius: 4 },

  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          minHeight: 44,
          paddingInline: 20,
          borderRadius: 4,
        },
        sizeSmall: {
          // Match MUI outlined TextField size="small" so FormRow flex-end
          // sits on the input, not a shorter chip.
          minHeight: 40,
          paddingInline: 14,
        },
        // MUI resolves `contained primary` to palette.primary.main by default,
        // which would reintroduce the 4.12:1 defect on the most prominent
        // control in the console. Force the text-safe red.
        containedPrimary: {
          backgroundColor: palette.brandRedText,
          color: palette.paper,
          "&:hover": { backgroundColor: palette.brandRedText },
        },
        textPrimary: { color: palette.brandRedText },
        outlinedPrimary: {
          color: palette.brandRedText,
          borderColor: palette.brandRedText,
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: { color: palette.brandRedText },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        outlined: {
          borderColor: palette.line,
          borderRadius: 4,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 4,
        },
        outlined: {
          backgroundColor: palette.paper,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 2,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: 14,
          borderColor: palette.line,
          padding: "14px 16px",
        },
        sizeSmall: {
          padding: "12px 16px",
        },
        head: {
          fontWeight: 600,
          fontSize: 12,
          letterSpacing: 0.04,
          textTransform: "uppercase",
          color: palette.textSecondary,
          backgroundColor: palette.paper,
          borderBottom: `1px solid ${palette.line}`,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&:last-of-type td": { borderBottom: 0 },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: "medium",
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: -0.2,
          color: palette.brandBlack,
        },
      },
    },
    MuiDialogContentText: {
      styleOverrides: {
        root: {
          fontSize: 15,
          color: palette.text,
        },
      },
    },
  },
});
