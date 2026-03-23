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

export const enum SequenceMode {
	Inherit = 0,
	Sequential = 1,
}

export const enum RunnerModeHint {
	Default = 0,
	InBand = 1,
}

export const enum FailurePolicyHint {
	Inherit = 0,
	Continue = 1,
	Bail = 2,
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

/**
 * Test-only host hook that captures the current artifact frame while the guest
 * callback is still live.
 */
// @ts-ignore AssemblyScript external decorator
@external("__asArtifacts", "capture_active_frame")
export declare function captureActiveArtifactFrame(): void;

// @ts-ignore AssemblyScript external decorator
@external("__asArtifacts", "snapshot_check")
export declare function snapshotCheck(
	actualPtr: usize,
	labelPtr: usize,
): i32;

// @ts-ignore AssemblyScript external decorator
@external("__asArtifacts", "fixture_read")
export declare function fixtureRead(pathPtr: usize): i32;

// @ts-ignore AssemblyScript external decorator
@external("__asArtifacts", "get_last_text_utf16_byte_length")
export declare function getLastArtifactTextUtf16ByteLength(): i32;

// @ts-ignore AssemblyScript external decorator
@external("__asArtifacts", "copy_last_text_utf16")
export declare function copyLastArtifactTextUtf16(destination: usize): void;
