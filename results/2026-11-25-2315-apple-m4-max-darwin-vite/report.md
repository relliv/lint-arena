# vite

> **`oxlint@1.94.0`** is **30.6×** faster than `eslint@10.15.0`: 0.070 s to lint 1623 files with 53 shared rules. 1 of 7 other linters report exactly the reference's findings.

| | |
|---|---|
| **Machine** | Apple M4 Max, 16 cores, 48 GiB |
| **System** | macOS 27.0.1 (26A434), Node v26.0.0, local machine |
| **When** | 2026-11-25 23:15 UTC, 1 min |
| **Method** | median of 7 rounds after one warm-up; linter order rotated every round |
| **Files** | 1623 linted; 19 folders and 15 files skipped |
| **Rules** | 53 shared rules (rules.json) |
| **Reference** | `eslint@10.15.0`, 817 findings |
| **Run** | `2026-11-25-2315-apple-m4-max-darwin-vite` |

## Speed, as shipped

One lint of the whole file set per round. CPU is user plus sys time over all threads; peak is the largest resident set.

| Linter | Wall | Range | vs reference | CPU | Peak |
|---|--:|--:|--:|--:|--:|
| `oxlint@1.94.0` | **0.070 s** | 0.068 to 0.076 | 30.6× | 0.470 s | 109 MiB |
| `oxlint@1.93.0` | **0.073 s** | 0.068 to 0.124 | 29.3× | 0.480 s | 109 MiB |
| `biome@2.6.8` | **0.094 s** | 0.093 to 0.103 | 22.9× | 0.780 s | 146 MiB |
| `biome@2.6.7` | **0.098 s** | 0.096 to 0.102 | 21.8× | 0.820 s | 145 MiB |
| `deno@2.9.5` | **0.143 s** | 0.139 to 0.153 | 14.9× | 1.30 s | 57 MiB |
| `deno@2.9.6` | **0.148 s** | 0.145 to 0.153 | 14.5× | 1.34 s | 56 MiB |
| `eslint@10.15.0` | **2.14 s** | 2.09 to 2.32 | 1.0× | 4.25 s | 702 MiB |
| `eslint@10.14.0` | **2.15 s** | 2.08 to 2.25 | 1.0× | 4.27 s | 705 MiB |

## Speed, 1 thread

One lint of the whole file set per round. CPU is user plus sys time over all threads; peak is the largest resident set.

| Linter | Wall | Range | vs reference | CPU | Peak |
|---|--:|--:|--:|--:|--:|
| `oxlint@1.93.0` | **0.112 s** | 0.103 to 0.121 | 19.6× | 0.110 s | 73 MiB |
| `oxlint@1.94.0` | **0.113 s** | 0.103 to 0.115 | 19.5× | 0.100 s | 73 MiB |
| `eslint@10.14.0` | **2.19 s** | 2.14 to 2.27 | 1.0× | 4.33 s | 699 MiB |
| `eslint@10.15.0` | **2.20 s** | 2.12 to 2.34 | 1.0× | 4.36 s | 718 MiB |

## Findings

Each linter's findings, compared with `eslint@10.15.0` by file, line and rule.

| Linter | Result | Findings | Files | Agreement | Extra | Missing | Near a directive |
|---|---|--:|--:|--:|--:|--:|--:|
| `eslint@10.15.0` | ✅ identical | 817 | 1623 | 100.0% | 0 | 0 | 0 extra, 0 missing |
| `biome@2.6.7` | ⚠️ differs | 790 | 1623 | 83.7% | 106 | 133 | 49 extra, 2 missing |
| `biome@2.6.8` | ⚠️ differs | 790 | 1623 | 83.7% | 106 | 133 | 49 extra, 2 missing |
| `deno@2.9.5` | ⚠️ differs | 841 | 1623 | 94.4% | 70 | 46 | 52 extra, 1 missing |
| `deno@2.9.6` | ⚠️ differs | 841 | 1623 | 94.4% | 70 | 46 | 52 extra, 1 missing |
| `eslint@10.14.0` | ✅ identical | 817 | 1623 | 100.0% | 0 | 0 | 0 extra, 0 missing |
| `oxlint@1.93.0` | ⚠️ differs | 777 | 1623 | 94.6% | 4 | 44 | 0 extra, 2 missing |
| `oxlint@1.94.0` | ⚠️ differs | 777 | 1623 | 94.6% | 4 | 44 | 0 extra, 2 missing |

Agreement: the share of the reference's findings this linter also reported. Extra: findings only that linter reported. Missing: findings only the reference reported. Near a directive: differences on lines an `eslint-disable`, `oxlint-disable`, `biome-ignore` or `deno-lint-ignore` comment covers; each linter honors only its own. Same lines: every finding matches by line, some at another column. The full lists are in parity/.

## Where they differ

The rules with the most differences per linter.

| Linter | Rule | Extra | Missing |
|---|---|--:|--:|
| `biome@2.6.7` | `no-unused-vars` | 1 | 80 |
| `biome@2.6.7` | `no-empty` | 52 | 1 |
| `biome@2.6.7` | `no-await-in-loop` | 3 | 20 |
| `biome@2.6.7` | `no-var` | 22 | 0 |
| `biome@2.6.7` | `require-await` | 1 | 17 |
| `biome@2.6.7` | `no-func-assign` | 2 | 9 |
| `biome@2.6.7` | `no-console` | 5 | 3 |
| `biome@2.6.7` | `eqeqeq` | 6 | 0 |
| `biome@2.6.8` | `no-unused-vars` | 1 | 80 |
| `biome@2.6.8` | `no-empty` | 52 | 1 |
| `biome@2.6.8` | `no-await-in-loop` | 3 | 20 |
| `biome@2.6.8` | `no-var` | 22 | 0 |
| `biome@2.6.8` | `require-await` | 1 | 17 |
| `biome@2.6.8` | `no-func-assign` | 2 | 9 |
| `biome@2.6.8` | `no-console` | 5 | 3 |
| `biome@2.6.8` | `eqeqeq` | 6 | 0 |
| `deno@2.9.5` | `no-unused-vars` | 5 | 42 |
| `deno@2.9.5` | `no-var` | 25 | 0 |
| `deno@2.9.5` | `default-param-last` | 15 | 0 |
| `deno@2.9.5` | `prefer-const` | 6 | 2 |
| `deno@2.9.5` | `eqeqeq` | 6 | 0 |
| `deno@2.9.5` | `no-console` | 5 | 0 |
| `deno@2.9.5` | `no-control-regex` | 3 | 0 |
| `deno@2.9.5` | `guard-for-in` | 2 | 0 |
| `deno@2.9.6` | `no-unused-vars` | 5 | 42 |
| `deno@2.9.6` | `no-var` | 25 | 0 |
| `deno@2.9.6` | `default-param-last` | 15 | 0 |
| `deno@2.9.6` | `prefer-const` | 6 | 2 |
| `deno@2.9.6` | `eqeqeq` | 6 | 0 |
| `deno@2.9.6` | `no-console` | 5 | 0 |
| `deno@2.9.6` | `no-control-regex` | 3 | 0 |
| `deno@2.9.6` | `guard-for-in` | 2 | 0 |
| `oxlint@1.93.0` | `no-unused-vars` | 0 | 38 |
| `oxlint@1.93.0` | `no-class-assign` | 3 | 3 |
| `oxlint@1.93.0` | `require-await` | 1 | 1 |
| `oxlint@1.93.0` | `no-console` | 0 | 1 |
| `oxlint@1.93.0` | `no-redeclare` | 0 | 1 |
| `oxlint@1.94.0` | `no-unused-vars` | 0 | 38 |
| `oxlint@1.94.0` | `no-class-assign` | 3 | 3 |
| `oxlint@1.94.0` | `require-await` | 1 | 1 |
| `oxlint@1.94.0` | `no-console` | 0 | 1 |
| `oxlint@1.94.0` | `no-redeclare` | 0 | 1 |

## Linters

| Linter | Package | Default threads | Version output | Binary sha256 |
|---|---|---|---|---|
| eslint@10.15.0 | eslint@10.15.0, @typescript-eslint/parser@8.73.0, @typescript-eslint/eslint-plugin@8.73.0 | 1 | v10.15.0 | bb07a179294caee1 |
| biome@2.6.7 | @biomejs/biome@2.6.7 | per-core | Version: 2.6.7 | 5ea2cd7d212b1013 |
| biome@2.6.8 | @biomejs/biome@2.6.8 | per-core | Version: 2.6.8 | 16c2a522889a6797 |
| deno@2.9.5 | deno@2.9.5 | per-core | deno 2.9.5 (stable, release, aarch64-apple-darwin) | b5bd08edab254d42 |
| deno@2.9.6 | deno@2.9.6 | per-core | deno 2.9.6 (stable, release, aarch64-apple-darwin) | b3ac3bd206e48c26 |
| eslint@10.14.0 | eslint@10.14.0, @typescript-eslint/parser@8.73.0, @typescript-eslint/eslint-plugin@8.73.0 | 1 | v10.14.0 | bb07a179294caee1 |
| oxlint@1.93.0 | oxlint@1.93.0 | per-core | Version: 1.93.0 | ecab4e2f1bebaab1 |
| oxlint@1.94.0 | oxlint@1.94.0 | per-core | Version: 1.94.0 | ecab4e2f1bebaab1 |

## Conditions

- busy process: Opera at 83.8% CPU
- busy process: Opera Helper at 34.1% CPU
- busy process: com.apple.Virtualization.VirtualMachine at 70.8% CPU
- busy process: Opera Helper (Renderer) at 51.3% CPU
