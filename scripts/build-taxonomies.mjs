/**
 * Builds the taxonomy lists the package form offers as choices, from the
 * copies the seller agent vendors:
 *
 *   node scripts/build-taxonomies.mjs [../seller-agent]
 *
 * The agent does not serve its taxonomies — no route in openapi.json lists
 * them — so the console carries its own copy, generated from the agent's
 * rather than fetched, which would mean a third-party origin (ADR 10). The
 * output is committed: a build must not need a sibling checkout.
 *
 * Only id and tier path are kept. The TSVs also carry extension notes and
 * cross-mappings the form never shows, and the smaller file is what the
 * picker loads when it opens.
 *
 * Both taxonomies are IAB Tech Lab's, licensed CC BY 3.0; the attribution
 * travels in the output and in README.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const agent = process.argv[2] ?? "../seller-agent";
const root = join(agent, "data/taxonomies");

const SOURCES = [
  {
    out: "content-3.1",
    file: "content-3.1/Content Taxonomy 3.1.tsv",
    title: "IAB Tech Lab Content Taxonomy 3.1",
    // Two header rows; columns: id, parent, name, tier 1..4.
    skip: 2,
    id: 0,
    tiers: [3, 4, 5, 6],
  },
  {
    out: "audience-1.1",
    file: "audience-1.1/Audience Taxonomy 1.1.tsv",
    title: "IAB Tech Lab Audience Taxonomy 1.1",
    // One header row and a blank first column; tiers 1..6.
    skip: 1,
    id: 1,
    tiers: [4, 5, 6, 7, 8, 9],
  },
];

const lock = JSON.parse(readFileSync(join(root, "taxonomies.lock.json"), "utf8"));

for (const src of SOURCES) {
  const rows = readFileSync(join(root, src.file), "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .slice(src.skip)
    .map((line) => line.split("\t"));

  const entries = [];
  for (const row of rows) {
    const id = row[src.id]?.trim();
    if (!id) continue;
    const path = src.tiers
      .map((i) => row[i]?.trim())
      .filter(Boolean)
      .join(" › ");
    entries.push([id, path]);
  }

  const kind = src.out.startsWith("content") ? "content" : "audience";
  const output = {
    title: src.title,
    license: "CC BY 3.0",
    attribution: `"${src.title.replace("IAB Tech Lab ", "")}" by IAB Tech Lab is licensed under CC BY 3.0.`,
    // Ties the copy to the exact file the agent vendors, so a refresh on
    // either side shows up as a diff here.
    sha256: lock[kind]?.sha256 ?? null,
    entries,
  };
  writeFileSync(`src/data/taxonomies/${src.out}.json`, `${JSON.stringify(output)}\n`);
  console.log(`${src.out}: ${entries.length} entries`);
}
