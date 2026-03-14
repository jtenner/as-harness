export { invoke } from "./internal/trampoline";
import { discoverRootNodes, runNodeByIndex } from "./internal/traversal";

let nodeIndexScratch: StaticArray<u32> | null = null;

/**
 * Allocates a `StaticArray<u32>` in guest memory for a host-provided NodeIndex
 * and returns the linear-memory pointer to its first element.
 */
export function allocateNodeIndexBuffer(length: u32): usize {
  nodeIndexScratch = new StaticArray<u32>(length);
  return changetype<usize>(nodeIndexScratch);
}

/**
 * Resolves the currently staged `NodeIndex` against the shared root tree and
 * runs the targeted node when it exists.
 *
 * Return values:
 * - `0`: no staged `NodeIndex` exists or the target node does not exist
 * - `1`: the target node was found and completed without trapping
 */
export function run(): i32 {
  if (nodeIndexScratch === null) {
    return 0;
  }

  const nodeIndex = changetype<StaticArray<u32>>(nodeIndexScratch);
  return runNodeByIndex(nodeIndex) ? 1 : 0;
}

/**
 * Emits `NodeFound` events for the currently registered top-level nodes and
 * returns the number of root children that were discovered.
 */
export function discover(): i32 {
  return discoverRootNodes();
}
