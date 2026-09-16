import { apiKeys, health, root } from "./endpoints";
import type { Connection } from "./http";

/**
 * The setup validation ladder. Each rung has its own message, because "invalid"
 * is useless to an operator who needs to know *which* thing is wrong.
 */

export type Role = "operator" | "buyer";

export type ProbeResult =
  | { ok: true; role: Role; name: string; reportedVersion: string }
  | { ok: false; step: ProbeStep; message: string; hint?: string };

export type ProbeStep = "url" | "reachability" | "identity" | "key";

/**
 * Rung 1. A page served over HTTPS cannot call a plain-HTTP API: the browser
 * blocks it as mixed content and there is no client-side workaround. localhost
 * and 127.0.0.1 are exempt as potentially-trustworthy origins, which is what
 * makes local development against the hosted console work.
 *
 * The check is conditioned on how *this page* is served, not assumed. A dev
 * server on http:// may legitimately talk to an http:// agent, and claiming
 * otherwise would both block it and state something untrue.
 */
export function validateBaseUrl(
  raw: string,
  pageProtocol: string = typeof location === "undefined" ? "https:" : location.protocol,
): { ok: true; baseUrl: string } | { ok: false; message: string; hint?: string } {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed === "") return { ok: false, message: "Enter the address of your seller agent." };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      message: "That is not a valid address.",
      hint: "It should look like https://agent.example.com or http://127.0.0.1:8000.",
    };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, message: `${url.protocol} addresses are not supported.` };
  }

  const isLocal =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";

  if (url.protocol === "http:" && !isLocal && pageProtocol === "https:") {
    return {
      ok: false,
      message: "This console is served over HTTPS, so it cannot call a plain http:// agent.",
      hint:
        "Browsers block mixed content and there is no way around it from here. " +
        "Use an https:// address, or run the agent on localhost.",
    };
  }

  return { ok: true, baseUrl: trimmed };
}

export async function probe(
  rawBaseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const url = validateBaseUrl(rawBaseUrl);
  if (!url.ok) {
    return { ok: false, step: "url", message: url.message, ...(url.hint ? { hint: url.hint } : {}) };
  }

  const anonymous: Connection = { baseUrl: url.baseUrl };

  // Rung 2: reachability and CORS. These are genuinely indistinguishable from
  // a browser — both surface as an opaque TypeError — so one message covers
  // both rather than guessing and misleading.
  const reachable = await health(anonymous, signal);
  if (reachable.kind !== "ok") {
    if (reachable.kind === "unavailable" && reachable.reason === "timeout") {
      return {
        ok: false,
        step: "reachability",
        message: "The agent did not respond in time.",
        hint: "It may be starting up. Try again in a moment.",
      };
    }
    return {
      ok: false,
      step: "reachability",
      message: "Could not reach that address.",
      hint:
        "Either the agent is not running there, or it is not sending CORS headers " +
        "that allow this console's origin.",
    };
  }

  // Rung 3: identity. Confirms this is a seller agent rather than some other
  // service answering /health on that host.
  const identity = await root(anonymous, signal);
  if (identity.kind !== "ok") {
    return {
      ok: false,
      step: "identity",
      message: "That address answered, but does not look like a seller agent.",
    };
  }

  // Rung 4: key validity and role. /auth/api-keys rather than /events because
  // it is metadata-only, cheap, and touches no subsystem.
  const probed = await apiKeys({ baseUrl: url.baseUrl, apiKey }, signal);

  if (probed.kind === "rejected") {
    if (probed.status === 403) {
      return {
        ok: true,
        role: "buyer",
        name: identity.data.name,
        reportedVersion: identity.data.version,
      };
    }
    return {
      ok: false,
      step: "key",
      message: "The agent rejected that key.",
      // A 401 cannot distinguish a wrong key from an agent with no keys
      // configured, so do not accuse the operator of a typo.
      hint:
        "It may be mistyped, revoked or expired — or this agent may have no API keys configured yet.",
    };
  }

  if (probed.kind !== "ok") {
    return {
      ok: false,
      step: "key",
      message: "Could not verify that key.",
      hint: "The agent is reachable but the key check failed. Try again.",
    };
  }

  return {
    ok: true,
    role: "operator",
    name: identity.data.name,
    reportedVersion: identity.data.version,
  };
}
