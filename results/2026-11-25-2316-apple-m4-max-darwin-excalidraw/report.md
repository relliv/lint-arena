# excalidraw

> **`oxlint@1.94.0`** is **71.3×** faster than `eslint@10.15.0`: 0.049 s to lint 735 files with 53 shared rules. 1 of 7 other linters report exactly the reference's findings.

| | |
|---|---|
| **Machine** | Apple M4 Max, 16 cores, 48 GiB |
| **System** | macOS 27.0.1 (26A434), Node v26.0.0, local machine |
| **When** | 2026-11-25 23:16 UTC, 2 min |
| **Method** | median of 7 rounds after one warm-up; linter order rotated every round |
| **Files** | 735 linted; 4 folders and 1 files skipped |
| **Rules** | 53 shared rules (rules.json) |
| **Reference** | `eslint@10.15.0`, 938 findings |
| **Run** | `2026-11-25-2316-apple-m4-max-darwin-excalidraw` |

## Speed, as shipped

One lint of the whole file set per round. CPU is user plus sys time over all threads; peak is the largest resident set.

| Linter | Wall | Range | vs reference | CPU | Peak |
|---|--:|--:|--:|--:|--:|
| `oxlint@1.94.0` | **0.049 s** | 0.046 to 0.051 | 71.3× | 0.170 s | 130 MiB |
| `oxlint@1.93.0` | **0.050 s** | 0.047 to 0.060 | 69.4× | 0.170 s | 130 MiB |
| `biome@2.6.8` | **0.169 s** | 0.167 to 0.172 | 20.4× | 0.920 s | 271 MiB |
| `biome@2.6.7` | **0.177 s** | 0.170 to 0.189 | 19.6× | 1.03 s | 270 MiB |
| `deno@2.9.6` | **0.214 s** | 0.210 to 0.226 | 16.2× | 2.61 s | 88 MiB |
| `deno@2.9.5` | **0.214 s** | 0.207 to 0.227 | 16.2× | 2.62 s | 91 MiB |
| `eslint@10.15.0` | **3.46 s** | 3.39 to 3.57 | 1.0× | 6.55 s | 873 MiB |
| `eslint@10.14.0` | **3.48 s** | 3.44 to 3.67 | 1.0× | 6.57 s | 802 MiB |

## Speed, 1 thread

One lint of the whole file set per round. CPU is user plus sys time over all threads; peak is the largest resident set.

| Linter | Wall | Range | vs reference | CPU | Peak |
|---|--:|--:|--:|--:|--:|
| `oxlint@1.94.0` | **0.108 s** | 0.105 to 0.116 | 32.4× | 0.100 s | 77 MiB |
| `oxlint@1.93.0` | **0.110 s** | 0.108 to 0.116 | 32.0× | 0.100 s | 77 MiB |
| `eslint@10.15.0` | **3.51 s** | 3.41 to 3.69 | 1.0× | 6.57 s | 903 MiB |
| `eslint@10.14.0` | **3.53 s** | 3.50 to 3.61 | 1.0× | 6.50 s | 743 MiB |

## Findings

Each linter's findings, compared with `eslint@10.15.0` by file, line and rule.

| Linter | Result | Findings | Files | Agreement | Extra | Missing | Near a directive |
|---|---|--:|--:|--:|--:|--:|--:|
| `eslint@10.15.0` | ✅ identical | 938 | 735 | 100.0% | 0 | 0 | 0 extra, 0 missing |
| `biome@2.6.7` | ⚠️ differs | 993 | 735 | 82.4% | 220 | 165 | 122 extra, 0 missing |
| `biome@2.6.8` | ⚠️ differs | 993 | 735 | 82.4% | 220 | 165 | 122 extra, 0 missing |
| `deno@2.9.5` | ⚠️ differs | 1152 | 735 | 91.3% | 296 | 82 | 137 extra, 0 missing |
| `deno@2.9.6` | ⚠️ differs | 1152 | 735 | 91.3% | 296 | 82 | 137 extra, 0 missing |
| `eslint@10.14.0` | ✅ identical | 938 | 735 | 100.0% | 0 | 0 | 0 extra, 0 missing |
| `oxlint@1.93.0` | ⚠️ differs | 910 | 735 | 96.2% | 8 | 36 | 0 extra, 0 missing |
| `oxlint@1.94.0` | ⚠️ differs | 910 | 735 | 96.2% | 8 | 36 | 0 extra, 0 missing |

Agreement: the share of the reference's findings this linter also reported. Extra: findings only that linter reported. Missing: findings only the reference reported. Near a directive: differences on lines an `eslint-disable`, `oxlint-disable`, `biome-ignore` or `deno-lint-ignore` comment covers; each linter honors only its own. Same lines: every finding matches by line, some at another column. The full lists are in parity/.

## Where they differ

The rules with the most differences per linter.

| Linter | Rule | Extra | Missing |
|---|---|--:|--:|
| `biome@2.6.7` | `no-unused-vars` | 26 | 118 |
| `biome@2.6.7` | `no-empty` | 92 | 0 |
| `biome@2.6.7` | `no-var` | 28 | 0 |
| `biome@2.6.7` | `eqeqeq` | 26 | 0 |
| `biome@2.6.7` | `require-await` | 6 | 15 |
| `biome@2.6.7` | `no-await-in-loop` | 4 | 12 |
| `biome@2.6.7` | `prefer-const` | 2 | 10 |
| `biome@2.6.7` | `no-prototype-builtins` | 11 | 0 |
| `biome@2.6.8` | `no-unused-vars` | 26 | 118 |
| `biome@2.6.8` | `no-empty` | 92 | 0 |
| `biome@2.6.8` | `no-var` | 28 | 0 |
| `biome@2.6.8` | `eqeqeq` | 26 | 0 |
| `biome@2.6.8` | `require-await` | 6 | 15 |
| `biome@2.6.8` | `no-await-in-loop` | 4 | 12 |
| `biome@2.6.8` | `prefer-const` | 2 | 10 |
| `biome@2.6.8` | `no-prototype-builtins` | 11 | 0 |
| `deno@2.9.5` | `no-unused-vars` | 163 | 31 |
| `deno@2.9.5` | `no-case-declarations` | 23 | 23 |
| `deno@2.9.5` | `eqeqeq` | 28 | 2 |
| `deno@2.9.5` | `no-var` | 28 | 0 |
| `deno@2.9.5` | `default-param-last` | 13 | 0 |
| `deno@2.9.5` | `prefer-const` | 2 | 10 |
| `deno@2.9.5` | `require-await` | 6 | 6 |
| `deno@2.9.5` | `no-prototype-builtins` | 11 | 0 |
| `deno@2.9.6` | `no-unused-vars` | 163 | 31 |
| `deno@2.9.6` | `no-case-declarations` | 23 | 23 |
| `deno@2.9.6` | `eqeqeq` | 28 | 2 |
| `deno@2.9.6` | `no-var` | 28 | 0 |
| `deno@2.9.6` | `default-param-last` | 13 | 0 |
| `deno@2.9.6` | `prefer-const` | 2 | 10 |
| `deno@2.9.6` | `require-await` | 6 | 6 |
| `deno@2.9.6` | `no-prototype-builtins` | 11 | 0 |
| `oxlint@1.93.0` | `no-unused-vars` | 0 | 23 |
| `oxlint@1.93.0` | `require-await` | 6 | 6 |
| `oxlint@1.93.0` | `no-irregular-whitespace` | 0 | 7 |
| `oxlint@1.93.0` | `no-redeclare` | 2 | 0 |
| `oxlint@1.94.0` | `no-unused-vars` | 0 | 23 |
| `oxlint@1.94.0` | `require-await` | 6 | 6 |
| `oxlint@1.94.0` | `no-irregular-whitespace` | 0 | 7 |
| `oxlint@1.94.0` | `no-redeclare` | 2 | 0 |

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

- busy process: com.apple.Virtualization.VirtualMachine at 57.9% CPU
