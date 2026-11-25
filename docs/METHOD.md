# Method

What a run measures, how, and what it does not show. This document has no numbers, so it stays true from run to run; the numbers are in each run's `report.md`. Everything a run does is in [`src/lib/run.ts`](../src/lib/run.ts), and everything a report computes is in [`src/lib/report.ts`](../src/lib/report.ts) and [`src/lib/stats.ts`](../src/lib/stats.ts).

The measurement method is the one of [ts-check-arena](https://github.com/relliv/ts-check-arena), which follows [danfry1/ts-checker-bench](https://github.com/danfry1/ts-checker-bench) (MIT). This arena applies it to linters, which raise two questions type checkers do not: which files a linter reads, and which rules it runs.

## Principles

1. **Every number has a record behind it.** A run keeps the timing of every single lint, the full list of findings where a linter disagrees with the reference, the exact version and binary checksum of every linter, and the machine and conditions it ran under.
2. **A linter is a version, not a name.** `oxlint@1.94.0` is a result; "oxlint" is not. Every linter, and every package it needs (ESLint's TypeScript parser and plugin), is pinned to an exact version in one lockfile.
3. **Same question for every linter.** Every linter lints the same files with the same rules, from a config the arena writes. The project's own lint config is never read.
4. **Fast and wrong is not fast.** A linter's time counts only where its output was read and compared. A linter that crashes, prints something unreadable or lints another number of files is not timed.
5. **Shipped defaults first, matched settings second.** Every linter runs as it ships. Thread counts are matched only through flags a linter documents.
6. **The project is never edited.** The generated configs live in a self-ignoring `.lint-arena/` folder inside the target, removed after the run.
7. **Nothing identifying leaves the machine.** Absolute paths, the home directory and the user name are scrubbed from every record. A run against a local path stays in `results/private/` until someone publishes it under a neutral name.
8. **Noise is recorded, not hidden.** Load, busy processes, speed limits and the run's source (a local machine or a shared CI runner) are part of the record, and runs from different sources are never mixed on one axis.

## Linters and versions

A family ([`linters.json`](../linters.json)) describes what stays the same across versions: the npm package, the platform packages that hold the native executable, the arguments that lint with a given config, the environment, and thread flags.

| Family | Package | What it is | Runs as |
|---|---|---|---|
| eslint | `eslint`, with `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` | The JavaScript linter, the reference | JavaScript on the current Node |
| oxlint | `oxlint` | The Oxc project's linter, in Rust | A Node native addon behind a JavaScript launcher, so Node starts too |
| biome | `@biomejs/biome` | Biome's `biome lint`, in Rust | The native executable from the platform package |
| deno | `deno` | Deno's built-in `deno lint`, in Rust | The native executable from the platform package |

Each version is a workspace package, `tools/<family>@<version>/`, added with `pnpm arena tool add`. The repository's supply chain policy in `pnpm-workspace.yaml` applies to them: a version must be 7 days old, and a version whose publish trust is weaker than an earlier one is refused. The store keeps the newest 3 versions of each family; past runs keep their results.

## The rule set

[`rules.json`](../rules.json) is the shared rule set: the ESLint core rules that oxlint, Biome and Deno also implement, under each family's own name.

- **Where the names come from.** ESLint's built-in rule list; `oxlint --rules` (ESLint scope, rules that need no type information); `deno lint --rules`; and Biome's own mapping, asked of `biome migrate eslint` one rule at a time. Where typescript-eslint has an extension rule (`no-unused-vars`, `no-redeclare`, `no-dupe-class-members`, `no-array-constructor`, `default-param-last`), ESLint runs that, as a TypeScript project would.
- **Options.** Every rule runs with its defaults. For Biome, the options `biome migrate eslint` writes to match ESLint's defaults are used (`noDoubleEquals` with `ignoreNull: false`, for one).
- **Left out.** Rules Biome has no counterpart for (`no-cond-assign`, `no-throw-literal`, `no-invalid-regexp`); `no-undef`, since every linter has its own idea of globals; rules that only apply to sloppy-mode scripts (`no-with`, `no-delete-var`); and two rules the fixtures showed to mean different things, `no-inner-declarations` and `constructor-super`. The reasons are in `rules.json`.
- **Proof.** Every rule has a fixture, `fixtures/rules/<id>.js`, written to break it. `pnpm arena rules verify` lints the folder with every family, and each must report every fixture's rule in that fixture; the unit tests run the same check against the newest installed version of each family. A rule a linter misses does not belong in the shared set.

## The file set

Linters disagree about what a folder contains: which extensions count, whether `.gitignore` applies, whether dot folders are skipped, and each has its own glob dialect. So the arena decides once ([`src/lib/fileset.ts`](../src/lib/fileset.ts)):

- **Linted:** `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`.
- **Skipped:** `node_modules`, `dist`, dot folders and dot files, symbolic links (so no file is linted twice), what git ignores, and a corpus project's `exclude` list. `.vue`, `.svelte` and `.astro` files are skipped too: oxlint reads their script blocks by default, the others do not.

Every config names the skipped folders and files as literal paths. Each linter is written the way it accepts them: ESLint through global `ignores` with an absolute `basePath` (a relative one applies to `files` but not to global ignores), oxlint through `--ignore-pattern` arguments (its config resolves patterns from its own folder and refuses `..`; on Windows a run is refused rather than cut if the arguments would pass 30,000 characters), Biome through `files.includes` negations, Deno through `lint.exclude`. Biome's file size limit is raised so no large file is skipped.

Every linter reports how many files it linted (ESLint lists them; oxlint, Biome and Deno print a count), and the gate below checks it.

## A run

`pnpm arena run` writes `results/<date>-<time>-<cpu>-<os>-<label>/`, with the start time in UTC (local paths: `results/private/...`; a run under act adds `-act` after the OS). CI runs are committed to the `data` branch, not to `main`.

1. **Preflight.** It refuses to start without a timer, on battery or under Rosetta, or with a linter not installed.
2. **File set and configs.** The file set is computed, and one config per linter is written to `.lint-arena/<linter>/`.
3. **Gate.** The reference, by default the newest installed ESLint, lints once. It must exit 0 or 1 and lint exactly the file set, file by file. Otherwise the run stops: the arena itself would be wrong.
4. **Findings.** Every other linter lints once and is compared with the reference (see [Findings](#findings)). A linter that exits with any other code, prints output the arena cannot read, or lints another number of files is recorded as failed and not timed.
5. **Timing.** For each thread setting: one warm-up round, then the given number of rounds (odd, 7 by default). A round lints the file set once with every linter, each round starting one linter further along than the round before. The exit code of every timed lint must match the one recorded in step 4.
6. **Records.** `run.json`, `timing.csv` (one row per lint, warm-ups marked), `parity.json`, `parity/<linter>.txt` for every linter whose findings differ, `summary.json` and `report.md`. With `--no-save` they are written to a temporary folder, the report is printed, and the folder is deleted.

Deno keeps an incremental lint cache in `DENO_DIR`; every Deno invocation gets a new empty `DENO_DIR`, so every lint starts cold, like the others. No linter is run with a cache flag.

The machine is kept awake with `caffeinate -dis` on macOS and `SetThreadExecutionState` on Windows, and power is checked before every round.

## Measurement

| OS | CPU time and peak memory | Wall time |
|---|---|---|
| macOS | `/usr/bin/time -l`: rusage of the process and its children; maximum resident set size | a nanosecond clock around the timer's process |
| Linux | GNU `/usr/bin/time -f`: the same fields | a nanosecond clock around the timer's process |
| Windows | [`windows-time.ps1`](../src/lib/windows-time.ps1): `GetProcessTimes` and the peak working set of the process alone | a stopwatch around the process |

- **Wall time** is the median of the timed rounds, with their min and max. Medians are only taken of odd-length sets.
- **"vs reference"** is the reference's median divided by the linter's: above 1 is faster.
- **CPU** is user plus sys time over all threads, as a median. **Peak** is the median peak memory, in MiB.
- ESLint and oxlint start Node; Biome and Deno do not. That is how each ships, so it is part of the time.

## Threads

`--threads default,1,4,max` times each setting. `default` runs every linter as it ships. A number uses each linter's documented flag:

| Family | Default, as documented | Flags | Source |
|---|---|---|---|
| eslint | one thread | `--concurrency off`, `--concurrency N` | `eslint --help` |
| oxlint | one per core | `--threads N` | `oxlint --help` |
| biome | one per core | none for `biome lint` | `BIOME_THREADS` is documented for `biome ci` only and does not apply to `biome lint` |
| deno | one per core | none | `deno lint --help` |

A family without a thread flag runs only in the `default` setting.

## Findings

Each linter's output becomes a list of findings: file, line, column and the canonical rule id ([`src/lib/findings.ts`](../src/lib/findings.ts)). A file that does not parse is one `parse-error` finding without a position: linters disagree on where a syntax error is, and each stops linting that file there. Findings of rules outside the shared set are counted but not compared; ESLint, for one, reports a disable comment that names a plugin rule its config does not load.

Two lists are compared as multisets:

- **Identical:** the same findings at the same file, line and column.
- **Same lines:** the same findings by file, line and rule, some at another column. Linters anchor some rules differently (Deno reports `eqeqeq` where the comparison starts, ESLint at the operator).
- **Differs:** some findings only one side reported. **Extra** counts by-line findings only that linter reported, **missing** those only the reference reported. **Agreement** is the share of the reference's findings the linter also reported.

Every linter honors its own disable comments, since that is how it ships: ESLint reads `eslint-disable`, oxlint reads `eslint-disable` and `oxlint-disable`, Biome reads `biome-ignore`, and Deno reads `deno-lint-ignore`. A difference on a line such a comment covers is a migration cost rather than a disagreement about the code, so reports count it apart as **near a directive** ([`src/lib/directives.ts`](../src/lib/directives.ts)).

## Sources: local and CI

A run records where it ran: `local`, or `ci` with the runner label, image and workflow run link.

- **Local runs** on a quiet machine are the precise numbers, in seconds.
- **CI runs** are breadth: five runners (Linux x64 and arm64, macOS arm64, Windows x64 and arm64), started by a push that changes `tools/` or by hand. Hosted runners are shared virtual machines, so CI results are read as ratios against the reference within one run, never as seconds across runs.

The site never puts local and CI runs on one axis.

## Projects

Any project on disk can be a target (`--target <path>`). For results that are comparable over time and across machines, [`corpus.json`](../corpus.json) pins public projects to a commit. Linting reads source only, so a corpus project is cloned and never installed or built. Checkouts live outside the repository, in the user's cache folder.

## Caveats

- **One machine per run.** Results from other hardware or operating systems may differ.
- **Background activity** is recorded, not controlled.
- **A shared rule set is a narrow question.** Real configs run many more rules, plugins (React, import, Node) and, with typescript-eslint, rules that need type information. Those are not measured; neither is oxlint's type-aware mode.
- **Default options.** Rules run with their defaults, and defaults differ (oxlint and Deno skip unused names starting with `_`, typescript-eslint does not). Those differences are real, and they show up as extra and missing findings.
- **Scope.** Linting only: no fixes, no formatting, no cache, no editor or watch mode.
- **Platform coverage differs.** A family without a build for a platform is recorded as not available there.

## What this does not show

Why one linter is faster than another, or which one is right where they differ. A report shows the time and memory each used and where their findings differ, rule by rule; the full lists are in `parity/` for anyone to judge.
