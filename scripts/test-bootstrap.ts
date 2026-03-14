#!/usr/bin/env bun

import { mkdir, rm, writeFile } from "node:fs/promises";

const stubPackageDir = new URL("../assembly/build/node_modules/as-harness/", import.meta.url);
const moduleUrl = new URL("../assembly/build/test-debug.js", import.meta.url);

await mkdir(stubPackageDir, { recursive: true });
await writeFile(
  new URL("package.json", stubPackageDir),
  JSON.stringify(
    {
      name: "as-harness",
      type: "module",
      exports: "./index.js",
    },
    null,
    2,
  ),
  "utf8",
);
await writeFile(
  new URL("index.js", stubPackageDir),
  'export function write_event() {}\n',
  "utf8",
);

try {
  await import(moduleUrl.href);
} finally {
  await rm(stubPackageDir, { force: true, recursive: true });
}
