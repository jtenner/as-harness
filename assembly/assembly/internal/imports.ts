// Flat imported ABI shared by the internal AssemblyScript runtime primitives.
// These declarations cover the imported host event sink called out in
// docs/001-2026-03-13-primary-buildout.md.

export const enum NodeKind {
  Root = 0,
  Test = 1,
  Describe = 2,
}

export const enum DeclarationMode {
  Normal = 1,
  Skip = 2,
  Todo = 3,
}

export const enum HookKind {
  BeforeAll = 1,
  BeforeEach = 2,
  AfterEach = 3,
  AfterAll = 4,
}

export const enum EventKind {
  NodeFound = 1,
  NodeStart = 2,
  NodePass = 3,
  FailMessage = 4,
  CallbackStart = 5,
  CallbackPass = 6,
  Diagnostic = 7,
  NodeFail = 8,
  CallbackFail = 9,
  Log = 10,
}

export const enum FailureKind {
  Assertion = 1,
  Trap = 2,
}

/**
 * Writes a packed binary event payload to the host event sink.
 *
 * @param kind Event discriminant for the encoded payload.
 * @param payloadPtr Pointer to the packed payload bytes.
 * @param payloadLen Length of the packed payload bytes.
 */
// @ts-ignore AssemblyScript external decorator
@external("as-harness", "write_event")
export declare function writeEvent(
  kind: EventKind,
  payloadPtr: usize,
  payloadLen: u32,
): void;

/**
 * Calls back into the guest-side exported trampoline and returns whether the
 * inner guest invocation completed without trapping.
 *
 * Return values:
 * - `0`: the inner guest call trapped
 * - `1`: the inner guest call returned normally
 */
// @ts-ignore AssemblyScript external decorator
@external("as-harness", "invoke_staged")
export declare function invokeStaged(): i32;
