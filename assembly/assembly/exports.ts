let nodeIndexScratch: StaticArray<u32> | null = null;

/**
 * Allocates a `StaticArray<u32>` in guest memory for a host-provided NodeIndex
 * and returns the linear-memory pointer to its first element.
 */
export function allocateNodeIndexBuffer(length: u32): usize {
  nodeIndexScratch = new StaticArray<u32>(length);
  return changetype<usize>(nodeIndexScratch);
}
