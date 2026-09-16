import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { CredentialProvider } from "./credentials/context";
import { QueryProvider } from "./query/provider";
import { Router } from "./shell/router";
import { theme } from "./theme/theme";

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CredentialProvider>
        <QueryProvider>
          <Router />
        </QueryProvider>
      </CredentialProvider>
    </ThemeProvider>
  );
}
