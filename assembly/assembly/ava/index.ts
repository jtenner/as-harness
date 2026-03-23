import { DeclarationMode, HookKind, SequenceMode } from "../internal/imports";
import { TestContext as InternalTestContext } from "../internal/context";
import { currentNode, Node } from "../internal/node";
import { declareHook, declareModifiedTest, declareTest } from "./parse";
import {
	ExecutionContext,
	HookFn,
	Macro,
	MacroFn,
	sharedExecutionContext,
	sharedMeta,
	TestFn,
	TitleFn,
} from "./types";

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
const macroInvocations = new Map<u32, MacroInvocation>();

class MacroInvocation {
	execute(_context: ExecutionContext): void {}
}

class TypedMacroInvocation<T> extends MacroInvocation {
	readonly macro: Macro<T>;
	readonly args: Array<T>;

	constructor(macro: Macro<T>, args: Array<T>) {
		super();
		this.macro = macro;
		this.args = args;
	}

	execute(context: ExecutionContext): void {
		this.macro.exec(context, this.args);
	}
}

function invokeDeclaredMacro(context: ExecutionContext): void {
	const nodeId = currentNode.nodeId;
	if (!macroInvocations.has(nodeId)) {
		unreachable();
	}

	changetype<MacroInvocation>(macroInvocations.get(nodeId)).execute(context);
}

function isMacroWhitespace(code: i32): bool {
	return (
		code == 0x20 ||
		code == 0x09 ||
		code == 0x0a ||
		code == 0x0d ||
		code == 0x0b ||
		code == 0x0c
	);
}

function normalizeMacroTitleWhitespace(value: string): string {
	let normalized = "";
	let pendingSpace = false;

	for (let index = 0, length = value.length; index < length; index++) {
		const code = value.charCodeAt(index);
		if (isMacroWhitespace(code)) {
			if (normalized.length > 0) {
				pendingSpace = true;
			}
			continue;
		}

		if (pendingSpace) {
			normalized += " ";
			pendingSpace = false;
		}

		normalized += value.charAt(index);
	}

	return normalized;
}

function resolveMacroTitle<T>(
	macro: Macro<T>,
	providedTitle: string = "",
	args: Array<T> = new Array<T>(),
): string {
	if (macro.title === null) {
		return normalizeMacroTitleWhitespace(providedTitle);
	}

	return normalizeMacroTitleWhitespace(
		changetype<TitleFn<T>>(macro.title)(providedTitle, args),
	);
}

function declareAvaTest(
	name: string = "",
	callback: TestFn | null = null,
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
	expectFailure: bool = false,
	sequenceMode: SequenceMode = SequenceMode.Inherit,
): Node {
	if (
		mode == DeclarationMode.Normal &&
		!only &&
		!expectFailure &&
		sequenceMode == SequenceMode.Inherit
	) {
		return declareTest(
			name,
			castTestCallback(callback),
			internalExecutionContext,
		);
	}

	return declareModifiedTest(
		name,
		castTestCallback(callback),
		mode,
		only,
		expectFailure,
		sequenceMode,
		internalExecutionContext,
	);
}

function declareAvaHook(kind: HookKind, callback: HookFn | null = null): void {
	declareHook(kind, castHookCallback(callback), internalExecutionContext);
}

function declareMacroTest<T>(
	macro: Macro<T>,
	providedTitle: string = "",
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
	expectFailure: bool = false,
	sequenceMode: SequenceMode = SequenceMode.Inherit,
	args: Array<T> = new Array<T>(),
): void {
	const node = declareAvaTest(
		resolveMacroTitle(macro, providedTitle, args),
		invokeDeclaredMacro,
		mode,
		only,
		expectFailure,
		sequenceMode,
	);
	macroInvocations.set(node.nodeId, new TypedMacroInvocation<T>(macro, args));
}

function skipHook(_callback: HookFn | null = null): void {}

export function test(name: string = "", callback: TestFn | null = null): void {
	declareAvaTest(name, callback);
}

export namespace test {
	export function macro<T>(
		exec: MacroFn<T>,
		title: TitleFn<T> | null = null,
	): Macro<T> {
		return new Macro<T>(exec, title);
	}

	export function use<T>(macro: Macro<T>, ...args: T[]): void {
		declareMacroTest(
			macro,
			"",
			DeclarationMode.Normal,
			false,
			false,
			SequenceMode.Inherit,
			args,
		);
	}

	export function useNamed<T>(
		name: string,
		macro: Macro<T>,
		...args: T[]
	): void {
		declareMacroTest(
			macro,
			name,
			DeclarationMode.Normal,
			false,
			false,
			SequenceMode.Inherit,
			args,
		);
	}

	export function only(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareAvaTest(name, callback, DeclarationMode.Normal, true);
	}

	export namespace only {
		export function use<T>(macro: Macro<T>, ...args: T[]): void {
			declareMacroTest(
				macro,
				"",
				DeclarationMode.Normal,
				true,
				false,
				SequenceMode.Inherit,
				args,
			);
		}

		export function useNamed<T>(
			name: string,
			macro: Macro<T>,
			...args: T[]
		): void {
			declareMacroTest(
				macro,
				name,
				DeclarationMode.Normal,
				true,
				false,
				SequenceMode.Inherit,
				args,
			);
		}
	}

	export function skip(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareAvaTest(name, callback, DeclarationMode.Skip);
	}

	export namespace skip {
		export function use<T>(macro: Macro<T>, ...args: T[]): void {
			declareMacroTest(
				macro,
				"",
				DeclarationMode.Skip,
				false,
				false,
				SequenceMode.Inherit,
				args,
			);
		}

		export function useNamed<T>(
			name: string,
			macro: Macro<T>,
			...args: T[]
		): void {
			declareMacroTest(
				macro,
				name,
				DeclarationMode.Skip,
				false,
				false,
				SequenceMode.Inherit,
				args,
			);
		}
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
		export function use<T>(macro: Macro<T>, ...args: T[]): void {
			declareMacroTest(
				macro,
				"",
				DeclarationMode.Normal,
				false,
				true,
				SequenceMode.Inherit,
				args,
			);
		}

		export function useNamed<T>(
			name: string,
			macro: Macro<T>,
			...args: T[]
		): void {
			declareMacroTest(
				macro,
				name,
				DeclarationMode.Normal,
				false,
				true,
				SequenceMode.Inherit,
				args,
			);
		}

		export function only(
			name: string = "",
			callback: TestFn | null = null,
		): void {
			declareAvaTest(name, callback, DeclarationMode.Normal, true, true);
		}

		export namespace only {
			export function use<T>(macro: Macro<T>, ...args: T[]): void {
				declareMacroTest(
					macro,
					"",
					DeclarationMode.Normal,
					true,
					true,
					SequenceMode.Inherit,
					args,
				);
			}

			export function useNamed<T>(
				name: string,
				macro: Macro<T>,
				...args: T[]
			): void {
				declareMacroTest(
					macro,
					name,
					DeclarationMode.Normal,
					true,
					true,
					SequenceMode.Inherit,
					args,
				);
			}
		}

		export function skip(
			name: string = "",
			callback: TestFn | null = null,
		): void {
			declareAvaTest(name, callback, DeclarationMode.Skip, false, true);
		}

		export namespace skip {
			export function use<T>(macro: Macro<T>, ...args: T[]): void {
				declareMacroTest(
					macro,
					"",
					DeclarationMode.Skip,
					false,
					true,
					SequenceMode.Inherit,
					args,
				);
			}

			export function useNamed<T>(
				name: string,
				macro: Macro<T>,
				...args: T[]
			): void {
				declareMacroTest(
					macro,
					name,
					DeclarationMode.Skip,
					false,
					true,
					SequenceMode.Inherit,
					args,
				);
			}
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
		declareAvaTest(
			name,
			callback,
			DeclarationMode.Normal,
			false,
			false,
			SequenceMode.Sequential,
		);
	}

	export namespace serial {
		export function use<T>(macro: Macro<T>, ...args: T[]): void {
			declareMacroTest(
				macro,
				"",
				DeclarationMode.Normal,
				false,
				false,
				SequenceMode.Sequential,
				args,
			);
		}

		export function useNamed<T>(
			name: string,
			macro: Macro<T>,
			...args: T[]
		): void {
			declareMacroTest(
				macro,
				name,
				DeclarationMode.Normal,
				false,
				false,
				SequenceMode.Sequential,
				args,
			);
		}

		export function only(
			name: string = "",
			callback: TestFn | null = null,
		): void {
			declareAvaTest(
				name,
				callback,
				DeclarationMode.Normal,
				true,
				false,
				SequenceMode.Sequential,
			);
		}

		export namespace only {
			export function use<T>(macro: Macro<T>, ...args: T[]): void {
				declareMacroTest(
					macro,
					"",
					DeclarationMode.Normal,
					true,
					false,
					SequenceMode.Sequential,
					args,
				);
			}

			export function useNamed<T>(
				name: string,
				macro: Macro<T>,
				...args: T[]
			): void {
				declareMacroTest(
					macro,
					name,
					DeclarationMode.Normal,
					true,
					false,
					SequenceMode.Sequential,
					args,
				);
			}
		}

		export function skip(
			name: string = "",
			callback: TestFn | null = null,
		): void {
			declareAvaTest(
				name,
				callback,
				DeclarationMode.Skip,
				false,
				false,
				SequenceMode.Sequential,
			);
		}

		export namespace skip {
			export function use<T>(macro: Macro<T>, ...args: T[]): void {
				declareMacroTest(
					macro,
					"",
					DeclarationMode.Skip,
					false,
					false,
					SequenceMode.Sequential,
					args,
				);
			}

			export function useNamed<T>(
				name: string,
				macro: Macro<T>,
				...args: T[]
			): void {
				declareMacroTest(
					macro,
					name,
					DeclarationMode.Skip,
					false,
					false,
					SequenceMode.Sequential,
					args,
				);
			}
		}

		export function todo(name: string = ""): void {
			declareAvaTest(
				name,
				null,
				DeclarationMode.Todo,
				false,
				false,
				SequenceMode.Sequential,
			);
		}

		export function failing(
			name: string = "",
			callback: TestFn | null = null,
		): void {
			declareAvaTest(
				name,
				callback,
				DeclarationMode.Normal,
				false,
				true,
				SequenceMode.Sequential,
			);
		}

		export namespace failing {
			export function use<T>(macro: Macro<T>, ...args: T[]): void {
				declareMacroTest(
					macro,
					"",
					DeclarationMode.Normal,
					false,
					true,
					SequenceMode.Sequential,
					args,
				);
			}

			export function useNamed<T>(
				name: string,
				macro: Macro<T>,
				...args: T[]
			): void {
				declareMacroTest(
					macro,
					name,
					DeclarationMode.Normal,
					false,
					true,
					SequenceMode.Sequential,
					args,
				);
			}

			export function only(
				name: string = "",
				callback: TestFn | null = null,
			): void {
				declareAvaTest(
					name,
					callback,
					DeclarationMode.Normal,
					true,
					true,
					SequenceMode.Sequential,
				);
			}

			export namespace only {
				export function use<T>(macro: Macro<T>, ...args: T[]): void {
					declareMacroTest(
						macro,
						"",
						DeclarationMode.Normal,
						true,
						true,
						SequenceMode.Sequential,
						args,
					);
				}

				export function useNamed<T>(
					name: string,
					macro: Macro<T>,
					...args: T[]
				): void {
					declareMacroTest(
						macro,
						name,
						DeclarationMode.Normal,
						true,
						true,
						SequenceMode.Sequential,
						args,
					);
				}
			}

			export function skip(
				name: string = "",
				callback: TestFn | null = null,
			): void {
				declareAvaTest(
					name,
					callback,
					DeclarationMode.Skip,
					false,
					true,
					SequenceMode.Sequential,
				);
			}

			export namespace skip {
				export function use<T>(macro: Macro<T>, ...args: T[]): void {
					declareMacroTest(
						macro,
						"",
						DeclarationMode.Skip,
						false,
						true,
						SequenceMode.Sequential,
						args,
					);
				}

				export function useNamed<T>(
					name: string,
					macro: Macro<T>,
					...args: T[]
				): void {
					declareMacroTest(
						macro,
						name,
						DeclarationMode.Skip,
						false,
						true,
						SequenceMode.Sequential,
						args,
					);
				}
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
