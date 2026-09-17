import Link from "@mui/material/Link";
import { Link as RouterLink } from "react-router";
import { PageHeader } from "../components/PageHeader";

export default function NotFound() {
  return (
    <section data-screen="not-found">
      <PageHeader
        title="No such screen"
        subtitle={
          <Link component={RouterLink} to="/">
            Back to setup and health
          </Link>
        }
      />
    </section>
  );
}
