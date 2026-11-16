# OpenProposal 3.0 fixtures

Two kinds, and they are trusted differently.

## The spec's examples — copied

`proposal.json`, `line-item-display.json`, `line-item-ctv.json` and
`line-item-audio.json` are JSON copies of the worked examples in `examples/`
of [IABTechLab/OpenProposal](https://github.com/IABTechLab/OpenProposal),
spec revision `3.0-draft-1`, commit
`ebb9fb88841ae0b5eda38b017c609fb26b0da3ec` (2026-11-13). Converted from YAML
with no edits, so the schema tests parse exactly what the spec publishes.

That commit postdates the comment period (closed 2026-10-22) but carries no
normative change: the examples were anonymised and the display example's
`agreed_rate` was corrected to 24.00. No post-comment revision and no JSON
Schema have been published yet. When they are, replace these from the new
commit and update the sha above; a test that then fails is the point.

`proposal.json` carries no line items — the spec shows the proposal and its
line items as separate examples. Tests that need a whole proposal compose
them.

## The agent's answers — derived, not captured

`agent/` holds responses from the seller agent's `feat/openproposal-mapping`
branch (commit `e77022e`, unmerged).

- `field-map.json` is the agent's real field map: the 96 `FieldRule`s parsed
  out of `services/openproposal_service.py` at that commit, with `None` fields
  omitted as the route's `response_model_exclude_none` does.
- `mapped-line-item.json`, `mapped-batch.json`, `many-to-one.json` and
  `thread-open.json` are **hand-built** to that commit's pydantic models
  (`models/openproposal.py`). Where the branch's own tests assert a value —
  `gam-li-7202154879`, gross 27.84, the zone-bracketed flight start, a seller
  counter bumping the version — the fixture agrees with them. The rest is
  plausible, not observed.

Nothing here was produced by running the branch. When it merges and the agent
can be run, replace the derived files with captures and say so here.
