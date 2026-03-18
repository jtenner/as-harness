// Barrel entry point for internal AssemblyScript tests.
export { invoke } from "../internal/trampoline";
import "./internal/assert-bridge";
import "./internal/execution-state";
import "./internal/executor";
import "./internal/events";
import "./internal/failure-state";
import "./internal/node";
import "./internal/node-test";
import "./internal/reflected-value";
import "./internal/strict-equality";
import "./internal/traversal";
