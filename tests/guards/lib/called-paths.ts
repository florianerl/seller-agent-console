import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const endpointsDir = resolve(repoRoot, "src/api/endpoints");

export type CalledPath = {
  /** The path as written, with interpolations replaced by `{}`. */
  readonly path: string;
  readonly method: string;
  readonly file: string;
  readonly line: number;
};

/**
 * Every request the endpoint layer can issue, read out of the source rather
 * than out of a hand-kept list.
 *
 * A list would be the obvious approach and the wrong one: it is a second
 * place to update, so it drifts, and a guard whose input drifts reports on
 * code that no longer exists while missing the code that does. Reading the
 * call sites means a new endpoint is covered the moment it is written.
 *
 * Deliberate limitation: query parameters are not extracted. They are almost
 * always passed as a variable (`query` forwarded from the caller) rather than
 * an object literal, so a static reader sees nothing useful. Claiming to check
 * them and checking a third of them would be worse than not claiming it.
 */
export function calledPaths(): CalledPath[] {
  return files(endpointsDir).flatMap(scanFile);
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) return files(full);
    return /\.ts$/.test(entry) ? [full] : [];
  });
}

/** Collects `const NAME = { key: "literal" }` so `NAME.key` can be resolved. */
function constantStrings(sf: ts.SourceFile): Map<string, string> {
  const found = new Map<string, string>();

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const name = node.name.text;
      // `as const` wraps the object literal in an assertion.
      const init = ts.isAsExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;

      if (ts.isStringLiteral(init)) found.set(name, init.text);

      if (ts.isObjectLiteralExpression(init)) {
        for (const prop of init.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const key = ts.isIdentifier(prop.name)
            ? prop.name.text
            : ts.isStringLiteral(prop.name)
              ? prop.name.text
              : undefined;
          if (key && ts.isStringLiteral(prop.initializer)) {
            found.set(`${name}.${key}`, prop.initializer.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return found;
}

function resolveText(node: ts.Expression, constants: Map<string, string>): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;

  if (ts.isIdentifier(node)) return constants.get(node.text);

  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    return constants.get(`${node.expression.text}.${node.name.text}`);
  }

  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) {
      // A resolvable constant contributes its text; anything else is a path
      // parameter, which is what the spec spells `{name}`.
      out += resolveText(span.expression, constants) ?? "{}";
      out += span.literal.text;
    }
    return out;
  }

  return undefined;
}

function scanFile(file: string): CalledPath[] {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const constants = constantStrings(sf);
  const out: CalledPath[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      if (callee === "get" || callee === "request") {
        // (connection, path, options)
        const pathArg = node.arguments[1];
        const optionsArg = node.arguments[2];
        if (pathArg) {
          const path = resolveText(pathArg, constants);
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          out.push({
            path: path ?? "<unresolved>",
            method: callee === "get" ? "GET" : methodOf(optionsArg),
            file: relative(repoRoot, file),
            line: line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return out;
}

function methodOf(options: ts.Expression | undefined): string {
  if (!options || !ts.isObjectLiteralExpression(options)) return "GET";
  for (const prop of options.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = ts.isIdentifier(prop.name) ? prop.name.text : undefined;
    if (key === "method" && ts.isStringLiteral(prop.initializer)) {
      return prop.initializer.text;
    }
  }
  // `request` defaults to GET, same as the seam does.
  return "GET";
}

/** `/api/v1/orders/{order_id}` and `/api/v1/orders/{}` compare equal. */
export function shape(path: string): string {
  return path.replace(/\{[^}]*\}/g, "{}");
}
