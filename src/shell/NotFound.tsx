import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import { Link as RouterLink } from "react-router";

export default function NotFound() {
  return (
    <section data-screen="not-found">
      <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 1 }}>
        No such screen
      </Typography>
      <Link component={RouterLink} to="/">
        Back to setup and health
      </Link>
    </section>
  );
}
