# flow-map

A Claude Code plugin with one skill, `flow-map`. It keeps a feature's whole flow as a living artifact, which holds:

- a state graph of every step: built, partial, not built or mocked;
- the open questions, each pinned to the step it decides;
- test scenarios that walk every branch;
- a change log.

Claude creates the map, updates it after every decision, code change, review or deploy, and reads it back. See [skills/flow-map/SKILL.md](skills/flow-map/SKILL.md) for the workflow and the data shape, and [flow.example.js](skills/flow-map/template/flow.example.js) for a small flow that uses every field.

## Install

In Claude Code:

```
/plugin marketplace add btx1312/flow-map
/plugin install flow-map@flow-map
```

If the repository is private, you need read access to it, and `git clone git@github.com:btx1312/flow-map.git` must work on your machine. For background auto-updates, also set `GITHUB_TOKEN` (or `GH_TOKEN`) to a token that can read the repo.

To update by hand: `/plugin marketplace update flow-map`.

To install from a local checkout instead: `/plugin marketplace add ./path/to/flow-map`.

## Develop

```sh
node --test                                                      # behaviour tests, no network
node skills/flow-map/template/flow.mjs build skills/flow-map/template/flow.example.js /tmp/flow-example
```

Then open `/tmp/flow-example/preview.html`. The page loads ELK from jsDelivr, so it needs a network connection.
