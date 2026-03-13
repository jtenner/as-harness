#!/usr/bin/env bun

const moduleUrl = new URL("../assembly/build/test-debug.js", import.meta.url);

await import(moduleUrl.href);
