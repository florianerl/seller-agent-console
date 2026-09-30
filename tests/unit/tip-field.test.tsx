import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import MenuItem from "@mui/material/MenuItem";
import { TipField } from "../../src/components/TipField";

/**
 * The hint once reached the DOM as an `aria-label` on the tooltip's wrapping
 * span. That gave a hinted field two elements answering to its label — every
 * e2e `getByLabel` hit a strict-mode violation — while the input itself never
 * carried the hint for a screen reader. These pin it as the input's
 * description, alongside the helper text rather than instead of it.
 */
describe("TipField", () => {
  it("names only the input by its label", () => {
    render(<TipField label="Agent address" hint="Where the agent is served." />);

    expect(screen.getAllByLabelText("Agent address")).toHaveLength(1);
    expect(document.querySelector("span[aria-label]")).toBeNull();
  });

  it("describes the input with its helper text and its hint", () => {
    render(
      <TipField
        label="Agent address"
        hint="Where the agent is served."
        helperText="The origin only — no path."
      />,
    );

    const description = screen
      .getByRole("textbox", { name: "Agent address" })
      .getAttribute("aria-describedby")!
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);

    expect(description).toEqual(["The origin only — no path.", "Where the agent is served."]);
  });

  it("describes a select's combobox, not its hidden native input", () => {
    render(
      <TipField select label="Status" value="" hint="Filters by order status.">
        <MenuItem value="">Any</MenuItem>
      </TipField>,
    );

    const id = screen.getByRole("combobox").getAttribute("aria-describedby");
    expect(id && document.getElementById(id)?.textContent).toBe("Filters by order status.");
  });

  it("adds no description when there is no hint or helper text", () => {
    render(<TipField label="Agent address" />);

    expect(screen.getByRole("textbox").hasAttribute("aria-describedby")).toBe(false);
  });
});
