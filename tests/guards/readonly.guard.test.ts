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

describe("read-only: layer 1, the fetch seam is the only one", () => {
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
    const fixture = resolve(repoRoot, "tests/fixtures/readonly-violation.ts.txt");
    expect(scan(fixture).map((f) => f.name).sort()).toEqual([
      "EventSource",
      "WebSocket",
      "XMLHttpRequest",
      "fetch",
      "sendBeacon",
    ]);
  });
});

describe("read-only: the seam exposes no mutating verb", () => {
  const seam = readFileSync(FETCH_SEAM, "utf8");

  it("exports get and no other request function", () => {
    const sf = ts.createSourceFile(FETCH_SEAM, seam, ts.ScriptTarget.ES2022, true);
    const exportedFunctions: string[] = [];

    ts.forEachChild(sf, (node) => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        exportedFunctions.push(node.name.text);
      }
    });

    expect(exportedFunctions).toEqual(["get"]);
    for (const verb of ["post", "put", "patch", "del", "remove", "request"]) {
      expect(exportedFunctions).not.toContain(verb);
    }
  });

  it("hardcodes the method rather than taking it as a parameter", () => {
    expect(seam).toContain('method: "GET"');
    expect(seam).not.toMatch(/method:\s*(?!"GET")[a-zA-Z_]/);
  });
});

describe("paths never end in a slash", () => {
  it("avoids the 307 that redirect_slashes would produce", () => {
    const endpoints = readFileSync(resolve(srcDir, "api/endpoints/index.ts"), "utf8");
    const paths = [...endpoints.matchAll(/^\s+\w+:\s*"(\/[^"]*)"/gm)].map((m) => m[1]!);

    expect(paths.length).toBeGreaterThan(5);
    for (const p of paths) {
      if (p === "/") continue; // the root route legitimately is a slash
      expect(p.endsWith("/"), `${p} ends in a slash and will 307`).toBe(false);
    }
  });
});
