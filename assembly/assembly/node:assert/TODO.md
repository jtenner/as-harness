# `node:assert` Adapter TODO

## Scope

Build the first assertion-library adapter pair under:

- `assembly/assembly/node:assert`
- `assembly/assembly/node:assert/strict`

## Structure

- [ ] Define the shared files and boundaries between `node:assert` and `node:assert/strict`.
- [ ] Decide which implementation can be shared and which behavior must differ for `strict`.
- [ ] Confirm how these folders will be exposed as AssemblyScript `--lib` entry points.

## Assertion Surface

- [ ] List the `node:assert` APIs that the adapter must support first.
- [ ] Identify which APIs should lower directly into the shared assertion bridge.
- [ ] Identify which APIs require message handling before failure emission.
- [ ] Identify which APIs need strict-only behavior differences.

## Runtime Integration

- [ ] Define the internal assertion primitive this adapter should call.
- [ ] Define how assertion failures emit `FailMessage` before becoming unreachable.
- [ ] Ensure the adapter works the same inside tests and lifecycle callbacks.
- [ ] Keep adapter code thin and free of host-side policy.

## Initial Deliverables

- [ ] Add the first source files for `node:assert`.
- [ ] Add the first source files for `node:assert/strict`.
- [ ] Add a minimal fixture that proves an assertion failure reaches the shared Wasm failure path.
