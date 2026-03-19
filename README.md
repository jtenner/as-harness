# as-harness

`as-harness` compiles AssemblyScript tests to Wasm and runs them through a stable host contract.

The repo ships:

- `assembly/`: guest runtime, adapters, and fixtures
- `cli/`: Bun CLI for discovery, compilation, execution, and packaging
- `harness/js/`, `harness/wazero/`, `harness/wasmtime/`: host runtimes
- `docs/`: ABI, runtime, and release docs

## Current Scope

What works today:

- `as-harness list` discovers test entry files
- `as-harness run` compiles and executes them
- guest authoring through synchronous `node:test`
- guest assertions through `node:assert` and `node:assert/strict`
- built-in source harnesses: `js`, `wazero`, `wasmtime`
- merged coverage output in `text`, `json`, `yaml`, `csv`, `lcov`, or `cobertura`
- coverage filtering with `--coverage-include`, `--coverage-exclude`, and repeated `--coverage-point-type`
- a bundled thin Jest-shaped guest adapter available through `import ... from "jest"`
- a bundled thin Vitest-shaped guest adapter available through `import ... from "vitest"`

Current limits:

- async or Promise-based test APIs are not part of the current surface
- the Jest adapter is intentionally small and not full Jest parity
- the Vitest adapter is intentionally small and not full Vitest parity, even though it now includes low-risk `sequential` aliases
- packaged releases include `js` and target-specific `wazero`; `wasmtime` is source-only
- official distribution is packaged Bun executables, not `npm`

## Quick Start

In-repo examples use `bun run ./cli/index.ts`. Packaged releases use the same arguments through the `as-harness` executable.

Write a test:

```ts
import { test } from "node:test";

test("adds numbers", (t) => {
	t.assert.strictEqual<i32>(1 + 1, 2);
});
```

Run it:

```bash
bun run ./cli/index.ts list
bun run ./cli/index.ts run ./example.test.ts
```

Switch harnesses when needed:

```bash
bun run ./cli/index.ts run --harness js ./example.test.ts
bun run ./cli/index.ts run --harness wazero ./example.test.ts
bun run ./cli/index.ts run --harness wasmtime ./example.test.ts
```

## Examples

Coverage:

```bash
bun run ./cli/index.ts run --coverage ./example.test.ts
bun run ./cli/index.ts run --harness js --coverage --coverage-format lcov ./example.test.ts
bun run ./cli/index.ts run --coverage --coverage-include "src/**/*.ts" --coverage-exclude "**/*.generated.ts" --coverage-point-type function ./example.test.ts
```

Glob-based discovery:

```bash
bun run ./cli/index.ts list --glob "assembly/**/*.test.ts"
bun run ./cli/index.ts run --glob "test/**/*.ts" --ignore "**/fixtures/**"
```

Thin Jest-shaped guest API:

```ts
import { describe, expect, test } from "jest";

describe("math", () => {
	test("adds numbers", () => {
		expect<i32>(1 + 1).toBe(2);
	});
});
```

```bash
bun run ./cli/index.ts run ./example-jest.test.ts
```

For the exact supported Jest surface, see [docs/Jest.md](./docs/Jest.md).

Thin Vitest-shaped guest API:

```ts
import { describe, expect, test } from "vitest";

describe("math", () => {
	test("adds numbers", () => {
		expect<i32>(1 + 1).toBe(2);
	});
});
```

```bash
bun run ./cli/index.ts run ./example-vitest.test.ts
```

For the exact supported Vitest surface, see [docs/Vitest.md](./docs/Vitest.md).

## Release Targets

Source execution supports `js`, `wazero`, and `wasmtime` on the current Node.js 22 validation matrix.

Packaged release artifacts currently ship as:

- `bun-darwin-arm64`: `js`, `wazero`
- `bun-darwin-x64`: `js`, `wazero`
- `bun-linux-arm64`: `js`
- `bun-linux-x64`: `js`, `wazero`
- `bun-windows-x64`: `js`

`wasmtime` remains source-only and is not bundled into packaged artifacts.

## Validation

Primary repo validation from the root:

```bash
bun validate
bun test
cd harness/js && npm test
cd harness/wazero && npm test
cd harness/wasmtime && npm test
```

Useful additional checks:

```bash
bun run host:matrix
bun run verify:source-hosts -- --target linux-x64 --report-dir ./dist/source-host-reports
cd cli && bun run build:list-release-targets
cd cli && bun run build:release
bun run verify:packaged-cli -- --target bun-linux-x64 --report-dir ./dist/packaged-cli-reports
```

## Docs

- CLI details: [cli/README.md](./cli/README.md)
- Guest runtime details: [assembly/README.md](./assembly/README.md)
- Harness ABI: [docs/harness-abi.md](./docs/harness-abi.md)
- Host runner contract: [docs/host-runner-contract.md](./docs/host-runner-contract.md)
- Guest runtime contracts: [docs/guest-runtime-contracts.md](./docs/guest-runtime-contracts.md)
- Release process: [docs/release-process.md](./docs/release-process.md)
- Host-specific notes: [harness/js/README.md](./harness/js/README.md), [harness/wazero/README.md](./harness/wazero/README.md), [harness/wasmtime/README.md](./harness/wasmtime/README.md)
- Current backlog: [agent-todo.md](./agent-todo.md)

## License

MIT. See [LICENSE](./LICENSE), [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md), and [licenses/](./licenses).
