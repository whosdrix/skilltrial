# Contributing

Thanks for helping. Bug reports with a small task file that reproduces the problem are the most useful thing you can send.

## Setup

```sh
git clone https://github.com/whosdrix/skilltrial
cd skilltrial
npm install
npm test
```

Run the CLI from source with `npm run dev -- run <skill-dir>`.

The test suite never calls a real model. It uses `test/fixtures/fake-agent.mjs` and `fake-judge.mjs` through the `command` agent, so it is fast and free. To try a real trial, run the example in `examples/changelog` with Claude Code installed.

## Adding an agent

Agents live in `src/agents`. An agent gets a prepared workspace and a prompt, runs to completion, and reports what it cost. It also says where skills go (`skillPath`), so skilltrial can install the skill for one arm and leave it out of the other. Before writing a new adapter, check whether the `command` agent already covers it.

## Before opening a pull request

```sh
npm run lint
npm run typecheck
npm test
```

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`), because releases and the changelog are generated from them.
