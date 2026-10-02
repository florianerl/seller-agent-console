import { useState } from "react";
import Button from "@mui/material/Button";

/**
 * Copies a value to the clipboard. The Clipboard API can refuse (an insecure
 * context, a denied permission, a focus rule), and a button that silently does
 * nothing is worse than none, so a refusal says so and leaves the value on
 * screen to be selected by hand.
 */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <Button
      size="small"
      onClick={() => void copy()}
      aria-label={`${label} ${value}`}
      data-state={state === "idle" ? undefined : state}
      sx={{ minWidth: 0, py: 0, px: 0.75, fontSize: 12 }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed — select it by hand" : label}
    </Button>
  );
}
