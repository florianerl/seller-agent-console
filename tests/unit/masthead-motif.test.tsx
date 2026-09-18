import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, Link } from "react-router";
import { MastheadMotif } from "../../src/components/MastheadMotif";
import { createMesh, getColsForWidth, planSpike } from "../../src/components/mastheadMotifMesh";
import { ConsoleNav } from "../../src/shell/Sidebar";

function Harness({ withButton = false }: { withButton?: boolean }) {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <MastheadMotif />
      <Link to="/orders">Orders</Link>
      {withButton && <button type="button">Mint</button>}
      <Routes>
        <Route path="/" element={<div />} />
        <Route path="/orders" element={<div />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("the header constellation", () => {
  it("spikes when the path changes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const svg = document.querySelector("[data-motif]")!;
    const before = Number(svg.getAttribute("data-burst"));
    await user.click(screen.getByRole("link", { name: "Orders" }));
    expect(Number(svg.getAttribute("data-burst"))).toBeGreaterThan(before);
  });

  it("spikes when a button is clicked without a route change", async () => {
    const user = userEvent.setup();
    render(<Harness withButton />);
    const svg = document.querySelector("[data-motif]")!;
    const before = Number(svg.getAttribute("data-burst"));
    await user.click(screen.getByRole("button", { name: "Mint" }));
    expect(Number(svg.getAttribute("data-burst"))).toBeGreaterThan(before);
  });

  it("staggers the spike instead of firing every neuron at once", () => {
    render(<Harness />);
    const firing = [...document.querySelectorAll(".sac-neuron.is-firing")] as SVGElement[];
    const all = document.querySelectorAll(".sac-neuron").length;
    expect(firing.length).toBeGreaterThan(1);
    expect(firing.length).toBeLessThan(all);
    const delays = new Set(firing.map((el) => el.style.animationDelay));
    expect(delays.size).toBeGreaterThan(1);
  });

  it("draws a different net for a different seed", () => {
    const a = createMesh(1);
    const b = createMesh(99);
    expect(a.nodes).not.toEqual(b.nodes);
    expect(a.edges).not.toEqual(b.edges);
  });

  it("calculates columns based on viewport width", () => {
    // 1200px viewport matches the classic 11-column baseline
    expect(getColsForWidth(1200)).toBe(11);
    // Narrow / mobile viewports clamp to minimum columns
    expect(getColsForWidth(320)).toBe(3);
    expect(getColsForWidth(375)).toBe(3);
    // Wider viewports scale columns up
    expect(getColsForWidth(1728)).toBe(17);
    expect(getColsForWidth(1920)).toBe(19);

    // createMesh scales nodes when cols is specified
    const meshSmall = createMesh(42, 5);
    const meshLarge = createMesh(42, 16);
    expect(meshSmall.nodes.length).toBeLessThan(meshLarge.nodes.length);
  });

  it("propagates secondary neurons to downstream neurons or to the AI chip", () => {
    const mesh = createMesh(42, 11);
    const spike = planSpike(42, mesh);

    // Verify neurons and synapses fired
    expect(spike.neuronDelay.size).toBeGreaterThan(0);
    expect(spike.synapseDelay.size).toBeGreaterThan(0);
    expect(spike.chipDelay).toBeGreaterThan(0);

    // Verify across seeds that both chip connections and secondary neuron chains are produced
    let reachedAlternatePin = false;
    let activatedDownstreamNeuron = false;

    for (let seed = 1; seed <= 20; seed++) {
      const s = planSpike(seed, mesh);
      for (const [edgeIdx] of s.synapseDelay) {
        const edge = mesh.edges[edgeIdx];
        if (
          edge &&
          (edge[0] === mesh.pinBase + 9 ||
            edge[1] === mesh.pinBase + 9 ||
            edge[0] === mesh.pinBase + 11 ||
            edge[1] === mesh.pinBase + 11)
        ) {
          reachedAlternatePin = true;
        }
      }
      if (s.neuronDelay.size > 12) {
        activatedDownstreamNeuron = true;
      }
    }

    expect(reachedAlternatePin).toBe(true);
    expect(activatedDownstreamNeuron).toBe(true);
  });

  it("renders ConsoleNav with nowrap so it does not wrap onto multiple lines", () => {
    const { container } = render(
      <MemoryRouter>
        <ConsoleNav />
      </MemoryRouter>,
    );
    const navBox = container.querySelector('nav[aria-label="Console sections"] > div');
    expect(navBox).not.toBeNull();
    const style = window.getComputedStyle(navBox!);
    expect(style.flexWrap).toBe("nowrap");
  });
});
