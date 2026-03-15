# Scripts

- `validate.ts`: runs Biome format and lint validation for the `cli/` package.
- `test.ts`: compiles `assembly/assembly/test/index.ts` with AssemblyScript debug settings and ESM bindings, writes the generated test artifacts to `assembly/build/test-debug.*`, runs the bootstrap script, compiles the `node:assert` and `node:assert/strict` smoke fixtures, and then runs the shared assert-bridge smoke checks.
- `test-bootstrap.ts`: imports the generated `assembly/build/test-debug.js` ESM binding so Bun instantiates the compiled Wasm test module and executes the AssemblyScript test entrypoint.
- `assert-bridge-smoke.ts`: instantiates the compiled `node:assert` and `node:assert/strict` smoke fixtures under Node's WebAssembly runtime and verifies host-observed `FailMessage` emission plus trampoline-backed trap handling.

Host-package smoke suites are package-local:

- `harness/js`: `npm test`
- `harness/wazero`: `npm test`
