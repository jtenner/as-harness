# Scripts

`scripts/` contains the root helper scripts used for validation, smoke coverage, and release-matrix support.

## Main Scripts

- `validate.ts`
  Runs Biome format and lint checks for `cli/`.
- `test.ts`
  Runs the repo-level AssemblyScript-focused test flow and assertion bridge smoke coverage.
- `test-bootstrap.ts`
  Loads the compiled AssemblyScript bootstrap fixture under Bun.
- `assert-bridge-smoke.ts`
  Verifies host-observed assertion behavior against compiled smoke fixtures.
- `release-matrix.ts`
  Emits the release-target matrix consumed by GitHub Actions.
- `release-manifest.ts`
  Emits `release-manifest.json`, `SHA256SUMS.txt`, and release-notes text from the shared release-target metadata.
- `stage-release-legal.ts`
  Copies `THIRD_PARTY_NOTICES.md` and the tracked third-party license texts into a release asset directory.
- `verify-packaged-cli.ts`
  Builds one packaged CLI target, runs its local smoke path with a bounded subprocess timeout, and optionally copies the built asset into a release directory.

## What These Scripts Prove

- the CLI formatting and lint baseline
- the guest runtime still compiles
- the assertion bridge still works
- the packaged CLI path still works locally for a selected release target
- the release workflow can publish explicit artifact metadata instead of relying on inferred platform behavior
- the published release assets have checksums and tag/version consistency checks
- the published release assets now include the tracked third-party legal bundle

## What They Do Not Prove

- that every hosted runner in GitHub Actions is green
- that every target-specific wazero build works in the wild
- that end-user install and troubleshooting flows are polished

Those are still release-proof tasks above the local helper layer.

## Useful Commands

```bash
bun validate
bun test
bun run release:matrix
bun run release:manifest -- --tag v0.1.0 --asset-dir ./dist/release-assets --notes-file ./dist/release-notes.md
bun run verify:packaged-cli --target bun-linux-x64
```

## Related Docs

- Repo overview: [README.md](/home/jtenner/Projects/as-harness/README.md)
- CLI docs: [cli/README.md](/home/jtenner/Projects/as-harness/cli/README.md)
- Release process: [docs/release-process.md](/home/jtenner/Projects/as-harness/docs/release-process.md)
- Third-party notices: [THIRD_PARTY_NOTICES.md](/home/jtenner/Projects/as-harness/THIRD_PARTY_NOTICES.md)
