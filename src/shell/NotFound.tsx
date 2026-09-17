import Link from "@mui/material/Link";
import { Link as RouterLink } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { palette } from "../theme/palette";

export default function NotFound() {
  return (
    <section data-screen="not-found">
      <PageHeader
        title="No such screen"
        subtitle={
          <Link component={RouterLink} to="/" sx={{ color: palette.paper }}>
            Back to setup and health
          </Link>
        }
      />
    </section>
  );
}
