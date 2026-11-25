# lint-arena

**How fast are the JavaScript and TypeScript linters, version by version, on your project, and do they report the same problems?**

ESLint, oxlint, Biome and `deno lint`, each pinned to exact versions, timed side by side on any project on disk or on a pinned public corpus, on macOS, Linux and Windows. Every linter lints the same files with the same 53 rules, and every number comes with the raw records behind it. How a run works, and what it does not show: [docs/METHOD.md](docs/METHOD.md).

## Quick start

```sh
pnpm install                       # the arena and every linter version in tools/
pnpm arena tool list               # what is installed, and what has no build here
pnpm arena rules verify            # every linter reports every shared rule in its fixture
pnpm arena corpus setup vite       # the default benchmark project, pinned
pnpm arena run --corpus vite       # benchmark it on this machine
pnpm arena run --target ../my-app  # benchmark a project on this machine
pnpm arena run --target ../my-app --no-save  # same, but print the report and keep no records
pnpm dev                           # the site, with published runs and the data branch
```

A run against a path is written to `results/private/` (gitignored) and stays on this machine. With `--no-save` nothing is kept at all: the report is printed and every record is deleted, which suits private projects. To share one, `pnpm arena publish <run-id> --label <neutral name>` copies it into `results/`, scrubbed of paths and user names, for you to review and commit. Its `parity/` files list the project's file paths, so read them first.

## Linter versions

Each family ([linters.json](linters.json)) is a set of exact versions, one workspace package each, all pinned by one lockfile:

```sh
pnpm arena tool add oxlint@1.94.0 biome@2.6.8
pnpm arena tool remove deno@2.9.5
pnpm arena tool prune              # remove versions past each family's keep count
pnpm arena watch [--write]         # versions on npm older than 7 days that the store lacks (--write adds them)
pnpm arena families                # families, platforms and thread flags
```

Each family keeps its newest 3 versions: adding a newer one removes the oldest, so CI time stays flat as releases pile up. Results of past runs stay on the site.

| Family | Package | Platforms |
|---|---|---|
| eslint | `eslint` >= 9, with `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` | everywhere Node runs |
| oxlint | `oxlint` >= 1 | macOS, Linux, Windows (x64, arm64) |
| biome | `@biomejs/biome` >= 2 | macOS, Linux, Windows (x64, arm64) |
| deno | `deno` >= 2 | macOS, Linux, Windows (x64, arm64) |

The supply chain policy in [pnpm-workspace.yaml](pnpm-workspace.yaml) applies: a version must be 7 days old (`--allow-young` adds a reviewed exception), and a weaker publish trust than an earlier version is refused (`--allow-trust-downgrade`, with the evidence in a comment).

## The shared rule set

[rules.json](rules.json) lists the 53 ESLint core rules that every family implements, under each family's name (`pnpm arena rules list`). Biome's names come from `biome migrate eslint`. Rules that mean different things in different linters are left out, and every rule has a fixture in [fixtures/rules](fixtures/rules) that every linter must flag.

## Running

```sh
pnpm arena run --target <path> \
  --linters eslint@10.15.0,oxlint@1.94.0,biome@2.6.8,deno@2.9.6 \
  --reference eslint@10.15.0 \
  --threads default,1,max \
  --rounds 7 \
  --exclude test/fixtures
```

- **Files:** every `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts` and `.cts` file, minus `node_modules`, `dist`, dot folders, symbolic links, what git ignores and `--exclude`. The arena writes that list into every linter's config as literal paths, then checks each linter's own file count.
- **Configs** are written inside the target in a self-ignoring `.lint-arena/` folder, removed afterwards. Nothing in the project is edited, and the project's own lint config is never read.
- **The reference** defaults to the newest installed ESLint.
- **The gate:** a linter is timed only if it linted exactly the file set and printed output the arena could read.
- **Records:** `results/<run>/run.json`, `timing.csv`, `parity.json`, `parity/`, `summary.json`, `report.md`. `pnpm arena report <dir>` regenerates the summary from the raw records.

## Corpus and CI

[corpus.json](corpus.json) pins public projects to a commit: **vite** (the default, a TypeScript and JavaScript monorepo, about 1,600 files) and **excalidraw** (a React app, mostly TSX). Linting needs no install, so `pnpm arena corpus setup` only clones them into your cache folder.

| Workflow | When | What |
|---|---|---|
| [check](.github/workflows/check.yml) | every push and PR | types, tests (the rule map check included), site build, smoke run on macOS, Linux and Windows |
| [bench](.github/workflows/bench.yml) | when a push to main changes `tools/`, or by hand with projects, rounds, threads and Intel macOS as inputs | the corpus on five runners, six with Intel macOS; results committed to the `data` branch |
| [site](.github/workflows/site.yml) | after bench, on site changes | builds the site with the `data` branch results and deploys GitHub Pages |

CI runners are shared machines: their results are ratios within a run, labeled by runner, and never charted with local runs.

### Where results live

| Location | Holds |
|---|---|
| `results/` on `main` | local runs shared with `pnpm arena publish`, or corpus runs, reviewed and committed by hand |
| `results/` on the `data` branch | every CI run, committed by the bench workflow |
| `results/private/` (gitignored) | runs against a local path and runs under act; they never leave the machine |

## Development

```sh
pnpm typecheck && pnpm test && pnpm build
pnpm arena run --target fixtures/small --smoke
pnpm bench:act                     # the bench workflow's Linux job, locally with nektos/act and Docker
```

## Credits

The measurement method, the run layout and the site come from [ts-check-arena](https://github.com/relliv/ts-check-arena), whose method follows [danfry1/ts-checker-bench](https://github.com/danfry1/ts-checker-bench) (MIT).

## License

MIT
