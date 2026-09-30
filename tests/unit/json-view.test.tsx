import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { JsonView } from "../../src/components/JsonView";
import { palette } from "../../src/theme/palette";

const colours = (el: Element) =>
  [...el.querySelectorAll("span")].map((s) => [s.textContent, (s as HTMLElement).style.color]);

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe("JsonView", () => {
  it("colours keys, strings, numbers and keywords apart, and keeps the text intact", () => {
    const { container } = render(<JsonView value={{ a: "x", n: 1.5, ok: true, none: null }} data-payload="t" />);
    const pre = container.querySelector('[data-payload="t"]')!;

    expect(pre.textContent).toBe(JSON.stringify({ a: "x", n: 1.5, ok: true, none: null }, null, 2));
    expect(colours(pre)).toEqual([
      ['"a"', rgb(palette.jsonKey)],
      ['"x"', rgb(palette.jsonString)],
      ['"n"', rgb(palette.jsonKey)],
      ["1.5", rgb(palette.jsonNumber)],
      ['"ok"', rgb(palette.jsonKey)],
      ["true", rgb(palette.jsonKeyword)],
      ['"none"', rgb(palette.jsonKey)],
      ["null", rgb(palette.jsonKeyword)],
    ]);
  });

  it("does not read a value that looks like a token as markup or as a key", () => {
    const { container } = render(<JsonView value={{ s: '<b>"k": 1</b>', t: "true" }} />);

    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain('"<b>\\"k\\": 1</b>"');
    // A string that merely contains "true" stays one string-coloured token.
    expect(colours(container).filter(([, c]) => c === rgb(palette.jsonKeyword))).toEqual([]);
  });

  it("shows a value JSON cannot express instead of throwing", () => {
    const { container } = render(<JsonView value={undefined} />);
    expect(container.textContent).toBe("undefined");
  });
});
