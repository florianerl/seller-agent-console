import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const srcDir = resolve(repoRoot, "src");

/** The single permitted fetch seam. */
const FETCH_SEAM = resolve(srcDir, "api/http.ts");

/** Anything here can issue a request, so none of it may appear outside the seam. */
const FORBIDDEN_CALLEES = new Set([
  "fetch",
  "XMLHttpRequest",
  "EventSource",
  "WebSocket",
  "sendBeacon",
  "importScripts",
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

type Finding = { file: string; line: number; name: string };

function scan(file: string): Finding[] {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const findings: Finding[] = [];

  const record = (node: ts.Node, name: string) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    findings.push({ file: relative(repoRoot, file), line: line + 1, name });
  };

  const visit = (node: ts.Node): void => {
    // fetch(...) / navigator.sendBeacon(...)
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && FORBIDDEN_CALLEES.has(callee.text)) {
        record(node, callee.text);
      }
      if (ts.isPropertyAccessExpression(callee) && FORBIDDEN_CALLEES.has(callee.name.text)) {
        record(node, callee.name.text);
      }
    }
    // new XMLHttpRequest() / new WebSocket() / new EventSource()
    if (ts.isNewExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && FORBIDDEN_CALLEES.has(callee.text)) {
        record(node, callee.text);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return findings;
}

/**
 * The seam is no longer a read-only boundary — it takes a method, and writes
 * go through it (ADR 11). It is still the only place allowed to issue a
 * request, so that timeouts, the auth header, the redirect policy and the
 * result taxonomy have exactly one implementation.
 */
describe("the fetch seam is the only place that issues requests", () => {
  it("finds no request-issuing API anywhere outside src/api/http.ts", () => {
    const offenders = sourceFiles(srcDir)
      .filter((f) => f !== FETCH_SEAM)
      .flatMap(scan);

    expect(
      offenders,
      offenders.map((o) => `${o.file}:${o.line} uses ${o.name}`).join("\n"),
    ).toEqual([]);
  });

  it("confirms the scanner actually detects a violation", () => {
    // Guards that have only ever been green are guards nobody has tested.
    const fixture = resolve(repoRoot, "tests/fixtures/fetch-seam-violation.ts.txt");
    expect(scan(fixture).map((f) => f.name).sort()).toEqual([
      "EventSource",
      "WebSocket",
      "XMLHttpRequest",
      "fetch",
      "sendBeacon",
    ]);
  });
});

describe("paths never end in a slash", () => {
  it("avoids the 307 that redirect_slashes would produce", () => {
    // Every module in the directory, not just the barrel: the table is split by
    // domain now, and a guard that only read index.ts would pass by reading
    // nothing at all.
    const dir = resolve(srcDir, "api/endpoints");
    const paths = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .flatMap((f) => [
        ...readFileSync(resolve(dir, f), "utf8").matchAll(/^\s+\w+:\s*"(\/[^"]*)"/gm),
      ])
      .map((m) => m[1]!);

    expect(paths.length).toBeGreaterThan(5);
    for (const p of paths) {
      if (p === "/") continue; // the root route legitimately is a slash
      expect(p.endsWith("/"), `${p} ends in a slash and will 307`).toBe(false);
    }
  });
});
