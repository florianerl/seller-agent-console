# OpenProposal 3.0 examples

JSON copies of the worked examples in `examples/` of
[IABTechLab/OpenProposal](https://github.com/IABTechLab/OpenProposal), spec
revision `3.0-draft-1`, commit `cd63a32914b8ab8876a59cb64751edb98d83dd69`
(2026-09-20). Converted from YAML once, with no edits, so the schema tests
parse exactly what the spec publishes rather than a shape written to pass.

The spec publishes no JSON Schema yet (`schema/README.md` there), so these
examples are the closest thing to a reference for shape. When the spec is
revised, replace them from the new commit and update the sha above; a test
that then fails is the point.

`proposal.json` carries no line items — the spec shows the proposal and its
line items as separate examples. Tests that need a whole proposal compose
them.
