<!-- markdownlint-disable -->

# Hardening Report: Sloppers--Slopper/v0.0.1

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **Sloppers--Slopper/v0.0.1** was hardened automatically. 2 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

Both workflow files reference GitHub Actions using mutable version tags (@v4) instead of immutable 40-character commit SHA digests. This exposes the workflow to supply-chain attacks if the upstream action tag is moved or compromised. Affected references: actions/checkout@v4 and actions/setup-node@v4 in both ci.yml and release.yml.

Locations:

- `.github/workflows/ci.yml:12`
- `.github/workflows/ci.yml:13`
- `.github/workflows/ci.yml:24`
- `.github/workflows/ci.yml:25`
- `.github/workflows/ci.yml:47`
- `.github/workflows/ci.yml:48`
- `.github/workflows/release.yml:13`
- `.github/workflows/release.yml:14`

### missing-permissions (severity: medium)

ci.yml has no top-level `permissions:` block, and the `lint` and `build` jobs also have no job-level `permissions:` block. Only the `test` job defines permissions (`contents: write`). Without explicit permissions, the remaining jobs inherit the default token permissions, which may be broader than necessary. Every job must declare its own `permissions:` block, or a restrictive top-level `permissions:` block must be added.

Locations:

- `.github/workflows/ci.yml:1`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, missing-permissions

**Notes:**

Fixed all 8 unpinned action references in ci.yml and release.yml by pinning actions/checkout@v4 to SHA 34e114876b0b11c390a56381ad16ebd13914f8d5 and actions/setup-node@v4 to SHA 49933ea5288caeca8642d1e84afbd3f7d6820020, with original tags preserved as comments. Added a restrictive top-level `permissions: {}` block to ci.yml, and added job-level `permissions: contents: read` to the lint and build jobs (the test job already had `contents: write` for pushing the coverage badge). release.yml already had a top-level `permissions: contents: write` block.

