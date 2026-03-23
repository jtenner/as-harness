import { DeclarationMode, HookKind, SequenceMode } from "../internal/imports";
import { declareHook, declareModifiedTest, declareTest } from "./parse";
import { TestContext as InternalTestContext } from "../internal/context";
import { HookFn, sharedExecutionContext, sharedMeta, TestFn } from "./types";

export * from "./types";

function castTestCallback(
	callback: TestFn | null = null,
): ((context: InternalTestContext) => void) | null {
	return callback === null
		? null
		: changetype<(context: InternalTestContext) => void>(callback);
}

function castHookCallback(
	callback: HookFn | null = null,
): ((context: InternalTestContext) => void) | null {
	return callback === null
		? null
		: changetype<(context: InternalTestContext) => void>(callback);
}

const internalExecutionContext = changetype<InternalTestContext>(
	sharedExecutionContext,
);

function declareAvaTest(
	name: string = "",
	callback: TestFn | null = null,
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
	expectFailure: bool = false,
	sequenceMode: SequenceMode = SequenceMode.Inherit,
): void {
	if (
		mode == DeclarationMode.Normal &&
		!only &&
		!expectFailure &&
		sequenceMode == SequenceMode.Inherit
	) {
		declareTest(name, castTestCallback(callback), internalExecutionContext);
		return;
	}

	declareModifiedTest(
		name,
		castTestCallback(callback),
		mode,
		only,
		expectFailure,
		sequenceMode,
		internalExecutionContext,
	);
}

function declareSequentialTest(
	name: string = "",
	callback: TestFn | null = null,
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
	expectFailure: bool = false,
): void {
	declareAvaTest(
		name,
		callback,
		mode,
		only,
		expectFailure,
		SequenceMode.Sequential,
	);
}

function declareAvaHook(kind: HookKind, callback: HookFn | null = null): void {
	declareHook(kind, castHookCallback(callback), internalExecutionContext);
}

function skipHook(_callback: HookFn | null = null): void {}

export function test(name: string = "", callback: TestFn | null = null): void {
	declareAvaTest(name, callback);
}

export namespace test {
	export function only(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareAvaTest(name, callback, DeclarationMode.Normal, true);
	}

	export function skip(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareAvaTest(name, callback, DeclarationMode.Skip);
	}

	export function todo(name: string = ""): void {
		declareAvaTest(name, null, DeclarationMode.Todo);
	}

	export function failing(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareAvaTest(name, callback, DeclarationMode.Normal, false, true);
	}

	export namespace failing {
		export function only(
			name: string = "",
			callback: TestFn | null = null,
		): void {
			declareAvaTest(name, callback, DeclarationMode.Normal, true, true);
		}

		export function skip(
			name: string = "",
			callback: TestFn | null = null,
		): void {
			declareAvaTest(name, callback, DeclarationMode.Skip, false, true);
		}
	}

	export function before(callback: HookFn | null = null): void {
		declareAvaHook(HookKind.BeforeAll, callback);
	}

	export namespace before {
		export function skip(callback: HookFn | null = null): void {
			skipHook(callback);
		}
	}

	export function beforeEach(callback: HookFn | null = null): void {
		declareAvaHook(HookKind.BeforeEach, callback);
	}

	export namespace beforeEach {
		export function skip(callback: HookFn | null = null): void {
			skipHook(callback);
		}
	}

	export function after(callback: HookFn | null = null): void {
		declareAvaHook(HookKind.AfterAll, callback);
	}

	export namespace after {
		export function skip(callback: HookFn | null = null): void {
			skipHook(callback);
		}

		export function always(callback: HookFn | null = null): void {
			declareAvaHook(HookKind.AfterAll, callback);
		}

		export namespace always {
			export function skip(callback: HookFn | null = null): void {
				skipHook(callback);
			}
		}
	}

	export function afterEach(callback: HookFn | null = null): void {
		declareAvaHook(HookKind.AfterEach, callback);
	}

	export namespace afterEach {
		export function skip(callback: HookFn | null = null): void {
			skipHook(callback);
		}

		export function always(callback: HookFn | null = null): void {
			declareAvaHook(HookKind.AfterEach, callback);
		}

		export namespace always {
			export function skip(callback: HookFn | null = null): void {
				skipHook(callback);
			}
		}
	}

	export function serial(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareSequentialTest(name, callback);
	}

	export namespace serial {
		export function only(
			name: string = "",
			callback: TestFn | null = null,
		): void {
			declareSequentialTest(name, callback, DeclarationMode.Normal, true);
		}

		export function skip(
			name: string = "",
			callback: TestFn | null = null,
		): void {
			declareSequentialTest(name, callback, DeclarationMode.Skip);
		}

		export function todo(name: string = ""): void {
			declareSequentialTest(name, null, DeclarationMode.Todo);
		}

		export function failing(
			name: string = "",
			callback: TestFn | null = null,
		): void {
			declareSequentialTest(
				name,
				callback,
				DeclarationMode.Normal,
				false,
				true,
			);
		}

		export namespace failing {
			export function only(
				name: string = "",
				callback: TestFn | null = null,
			): void {
				declareSequentialTest(
					name,
					callback,
					DeclarationMode.Normal,
					true,
					true,
				);
			}

			export function skip(
				name: string = "",
				callback: TestFn | null = null,
			): void {
				declareSequentialTest(
					name,
					callback,
					DeclarationMode.Skip,
					false,
					true,
				);
			}
		}

		export function before(callback: HookFn | null = null): void {
			declareAvaHook(HookKind.BeforeAll, callback);
		}

		export namespace before {
			export function skip(callback: HookFn | null = null): void {
				skipHook(callback);
			}
		}

		export function beforeEach(callback: HookFn | null = null): void {
			declareAvaHook(HookKind.BeforeEach, callback);
		}

		export namespace beforeEach {
			export function skip(callback: HookFn | null = null): void {
				skipHook(callback);
			}
		}

		export function after(callback: HookFn | null = null): void {
			declareAvaHook(HookKind.AfterAll, callback);
		}

		export namespace after {
			export function skip(callback: HookFn | null = null): void {
				skipHook(callback);
			}

			export function always(callback: HookFn | null = null): void {
				declareAvaHook(HookKind.AfterAll, callback);
			}

			export namespace always {
				export function skip(callback: HookFn | null = null): void {
					skipHook(callback);
				}
			}
		}

		export function afterEach(callback: HookFn | null = null): void {
			declareAvaHook(HookKind.AfterEach, callback);
		}

		export namespace afterEach {
			export function skip(callback: HookFn | null = null): void {
				skipHook(callback);
			}

			export function always(callback: HookFn | null = null): void {
				declareAvaHook(HookKind.AfterEach, callback);
			}

			export namespace always {
				export function skip(callback: HookFn | null = null): void {
					skipHook(callback);
				}
			}
		}
	}

	export const meta = sharedMeta;
}

export default test;
