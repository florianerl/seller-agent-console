import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@mui/material/styles";
import { SWRConfig } from "swr";
import { API, server } from "../setup/msw";
import { theme } from "../../src/theme/theme";
import MediaKitScreen from "../../src/screens/MediaKit";
import { CredentialProvider } from "../../src/credentials/context";
import { clearCredential, saveCredential } from "../../src/credentials/store";
import { sameResult } from "../../src/query/freshness";
import { resetWritePolicy } from "../../src/api/policy";
import { resetReachability } from "../../src/query/reachability";

/**
 * The media kit routes are read-only upstream; its writes go to `/packages`,
 * the same routes the Catalog's package table calls. What these tests pin is
 * that an edit sends only what changed (the PUT is partial, and the kit's
 * view has no prices to send back), and that device types travel as the
 * AdCOM integers the agent stores — the shape the live agent returns.
 */

const PACKAGE = {
  package_id: "pkg-a",
  name: "Homepage Takeover",
  description: "Full-page homepage placement.",
  ad_formats: ["banner", "video"],
  device_types: [2, 4],
  geo_targets: ["US"],
  tags: ["premium"],
  cat: ["IAB17"],
  cattax: 2,
  price_range: "$10-$20 CPM",
  rate_type: "cpm",
  is_featured: false,
  audience_capabilities: null,
};

function mount() {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, compare: sameResult }}
    >
      <ThemeProvider theme={theme}>
        <CredentialProvider>
          <MediaKitScreen />
        </CredentialProvider>
      </ThemeProvider>
    </SWRConfig>,
  );
}

function capture(method: "post" | "put" | "delete", path: string, reply: unknown = {}) {
  const bodies: unknown[] = [];
  server.use(
    http[method](`${API}${path}`, async ({ request }) => {
      bodies.push(method === "delete" ? null : await request.json());
      return HttpResponse.json(reply as Record<string, unknown>);
    }),
  );
  return bodies;
}

async function credential(writesEnabled: boolean) {
  await saveCredential({
    baseUrl: API,
    apiKey: "k",
    role: "operator",
    name: "Ad Seller System API",
    reportedVersion: "2.4.2",
    writesEnabled,
  });
}

function enabled(action: string) {
  return waitFor(() => {
    const el = document.querySelector(`[data-action="${action}"]`);
    expect(el).toBeEnabled();
    return el as HTMLElement;
  });
}

async function confirm(user: ReturnType<typeof userEvent.setup>, action: string, label: string) {
  await user.click(await enabled(action));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: label }));
}

describe("media kit writes", () => {
  beforeEach(async () => {
    resetReachability();
    await clearCredential();
    resetWritePolicy();
    server.use(
      http.get(`${API}/media-kit`, () =>
        HttpResponse.json({ total_packages: 1, featured_count: 0, featured: [], all_packages: [PACKAGE] }),
      ),
      http.get(`${API}/media-kit/packages`, () => HttpResponse.json({ packages: [PACKAGE] })),
      // The audience match's package picker, and the create form's product picker.
      http.get(`${API}/packages`, () => HttpResponse.json({ packages: [] })),
      http.get(`${API}/products`, () =>
        HttpResponse.json({ products: [], total_count: 0, limit: 200, offset: 0 }),
      ),
    );
  });

  it("reads device types as AdCOM names rather than dropping the integers", async () => {
    await credential(false);
    mount();
    const row = await waitFor(() => {
      const el = document.querySelector('[data-row="media-kit-package"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(row.textContent).toContain("PC, phone");
  });

  it("sends only the fields that changed, prices never among them", async () => {
    await credential(true);
    const sent = capture("put", "/packages/pkg-a", PACKAGE);
    const user = userEvent.setup();
    mount();

    await user.click(await enabled("media-kit-edit-package"));
    expect(document.querySelector('[data-action="media-kit-update-package"]')).toBeDisabled();
    expect(screen.queryByLabelText("Base price")).toBeNull();

    const description = screen.getByLabelText("Description");
    await user.clear(description);
    await user.type(description, "Above the fold.");
    await user.type(screen.getByLabelText("Tags"), "sports{Enter}");
    await user.click(screen.getByLabelText("Featured"));
    await confirm(user, "media-kit-update-package", "Save");

    await waitFor(() =>
      expect(sent).toEqual([
        { description: "Above the fold.", tags: ["premium", "sports"], is_featured: true },
      ]),
    );
    await waitFor(() => expect(document.querySelector('[data-block="media-kit-edit-package"]')).toBeNull());
  });

  it("creates a package with its lists and prices, device types as integers", async () => {
    await credential(true);
    const sent = capture("post", "/packages", PACKAGE);
    const user = userEvent.setup();
    mount();

    await user.click(await enabled("media-kit-new-package"));
    expect(document.querySelector('[data-action="media-kit-create-package"]')).toBeDisabled();

    const form = document.querySelector('[data-block="media-kit-create-package"]') as HTMLElement;
    await user.type(within(form).getByLabelText("Name"), "Sports bundle");
    await user.type(within(form).getByLabelText("Base price"), "12");
    await user.type(within(form).getByLabelText("Floor"), "6");
    await user.type(within(form).getByLabelText("Geo targets"), "US, US-NY{Enter}");
    await user.click(within(form).getByRole("combobox", { name: "Device types" }));
    await user.click(await screen.findByRole("option", { name: "connected TV" }));
    await user.keyboard("{Escape}");
    await confirm(user, "media-kit-create-package", "Create package");

    await waitFor(() =>
      expect(sent).toEqual([
        {
          name: "Sports bundle",
          base_price: 12,
          floor_price: 6,
          is_featured: false,
          device_types: [3],
          geo_targets: ["US", "US-NY"],
        },
      ]),
    );
  });

  it("edits content categories and taxonomy, and sends a seasonal label only when typed", async () => {
    await credential(true);
    const sent = capture("put", "/packages/pkg-a", PACKAGE);
    const user = userEvent.setup();
    mount();

    await user.click(await enabled("media-kit-edit-package"));
    const form = document.querySelector('[data-block="media-kit-edit-package"]') as HTMLElement;
    // Prefilled from the stored values, so an untouched form changes nothing.
    expect(within(form).getByLabelText("Content taxonomy")).toHaveValue("2");
    expect(within(form).getByLabelText("Seasonal label")).toHaveValue("");
    // Audience capabilities and placements are not on the edit form: the PUT
    // would replace them with what the public view cannot show.
    expect(within(form).queryByLabelText("Audience capabilities")).toBeNull();

    await user.type(within(form).getByLabelText("Content categories"), "IAB19{Enter}");
    const cattax = within(form).getByLabelText("Content taxonomy");
    await user.clear(cattax);
    await user.type(cattax, "3");
    await user.type(within(form).getByLabelText("Seasonal label"), "Q4 holiday");
    await confirm(user, "media-kit-update-package", "Save");

    await waitFor(() =>
      expect(sent).toEqual([{ cat: ["IAB17", "IAB19"], cattax: 3, seasonal_label: "Q4 holiday" }]),
    );
  });

  it("creates with every PackageCreateRequest field the form was given", async () => {
    await credential(true);
    const sent = capture("post", "/packages", PACKAGE);
    const user = userEvent.setup();
    mount();

    await user.click(await enabled("media-kit-new-package"));
    const form = document.querySelector('[data-block="media-kit-create-package"]') as HTMLElement;
    await user.type(within(form).getByLabelText("Name"), "Q4 bundle");
    await user.type(within(form).getByLabelText("Base price"), "20");
    await user.type(within(form).getByLabelText("Floor"), "10");
    await user.type(within(form).getByLabelText("Content categories"), "IAB17{Enter}");
    await user.type(within(form).getByLabelText("Content taxonomy"), "3");
    await user.type(within(form).getByLabelText("Seasonal label"), "Q4 holiday");
    await user.type(within(form).getByLabelText("Audience segment ids"), "3-7{Enter}");
    await user.click(within(form).getByLabelText("Audience capabilities"));
    await user.paste('{"supports_standard": true}');
    await confirm(user, "media-kit-create-package", "Create package");

    await waitFor(() =>
      expect(sent).toEqual([
        {
          name: "Q4 bundle",
          base_price: 20,
          floor_price: 10,
          is_featured: false,
          cat: ["IAB17"],
          cattax: 3,
          audience_capabilities: { supports_standard: true },
          audience_segment_ids: ["3-7"],
          seasonal_label: "Q4 holiday",
        },
      ]),
    );
  });

  it("archives through DELETE /packages/{id}", async () => {
    await credential(true);
    const sent = capture("delete", "/packages/pkg-a", { package_id: "pkg-a", status: "archived" });
    const user = userEvent.setup();
    mount();

    await confirm(user, "media-kit-archive-package", "Archive package");
    await waitFor(() => expect(sent).toHaveLength(1));
  });

  it("leaves every write control disabled while writes are off", async () => {
    await credential(false);
    mount();
    await waitFor(() => expect(document.querySelector('[data-row="media-kit-package"]')).toBeTruthy());
    for (const action of [
      "media-kit-new-package",
      "media-kit-edit-package",
      "media-kit-archive-package",
    ]) {
      const els = document.querySelectorAll(`[data-action="${action}"]`);
      expect(els.length, action).toBeGreaterThan(0);
      for (const el of els) expect(el, action).toBeDisabled();
    }
  });
});
