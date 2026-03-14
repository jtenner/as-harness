// Current transform entrypoint. This remains a no-op until the strict-equality
// instrumentation is implemented, but it is intentionally shaped as a real
// AssemblyScript transform module so it can be materialized to disk and loaded
// through `asc --transform`.

export { default } from "./emptyTransformer.js";
