# Scripts

- `validate.ts`: runs Biome format and lint validation for the `cli/` package.
- `test.ts`: compiles `assembly/assembly/test/index.ts` with AssemblyScript debug settings and ESM bindings, writing the generated test artifacts to `assembly/build/test-debug.*`, then runs the bootstrap script.
- `test-bootstrap.ts`: imports the generated `assembly/build/test-debug.js` ESM binding so Bun instantiates the compiled Wasm test module and executes the AssemblyScript test entrypoint.
