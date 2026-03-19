import { DeclarationMode, HookKind, SequenceMode } from "../internal/imports";
export * from "./expect";
import {
	declareHook,
	declareModifiedSuite,
	declareModifiedTest,
	declareSuite,
	declareTest,
} from "./parse";
import { HookFn, ModuleHookFn, SuiteFn, TestFn } from "./types";

export * from "./types";

type TestDeclaration = (name: string, callback: TestFn | null) => void;
type SuiteDeclaration = (name: string, callback: SuiteFn | null) => void;

function declareBaseTest(
	name: string = "",
	callback: TestFn | null = null,
): void {
	if (callback === null) {
		declareModifiedTest(name, callback, DeclarationMode.Todo);
		return;
	}

	declareTest(name, callback);
}

function declareBaseSuite(
	name: string = "",
	callback: SuiteFn | null = null,
): void {
	declareSuite(name, callback);
}

export function test(name: string = "", callback: TestFn | null = null): void {
	declareBaseTest(name, callback);
}

export namespace test {
	export function only(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Normal, true);
	}

	export function skip(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Skip);
	}

	export function todo(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Todo);
	}

	export function fails(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Normal, false, true);
	}

	export function sequential(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		if (callback === null) {
			declareModifiedTest(
				name,
				callback,
				DeclarationMode.Todo,
				false,
				false,
				SequenceMode.Sequential,
			);
			return;
		}

		declareModifiedTest(
			name,
			callback,
			DeclarationMode.Normal,
			false,
			false,
			SequenceMode.Sequential,
		);
	}

	export function skipIf(condition: bool): TestDeclaration {
		return condition ? test.skip : test;
	}

	export function runIf(condition: bool): TestDeclaration {
		return condition ? test : test.skip;
	}
}

export function it(name: string = "", callback: TestFn | null = null): void {
	declareBaseTest(name, callback);
}

export namespace it {
	export function only(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Normal, true);
	}

	export function skip(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Skip);
	}

	export function todo(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Todo);
	}

	export function fails(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareModifiedTest(name, callback, DeclarationMode.Normal, false, true);
	}

	export function sequential(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		if (callback === null) {
			declareModifiedTest(
				name,
				callback,
				DeclarationMode.Todo,
				false,
				false,
				SequenceMode.Sequential,
			);
			return;
		}

		declareModifiedTest(
			name,
			callback,
			DeclarationMode.Normal,
			false,
			false,
			SequenceMode.Sequential,
		);
	}

	export function skipIf(condition: bool): TestDeclaration {
		return condition ? it.skip : it;
	}

	export function runIf(condition: bool): TestDeclaration {
		return condition ? it : it.skip;
	}
}

export function describe(
	name: string = "",
	callback: SuiteFn | null = null,
): void {
	declareBaseSuite(name, callback);
}

export namespace describe {
	export function only(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		declareModifiedSuite(name, callback, DeclarationMode.Normal, true);
	}

	export function skip(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		declareModifiedSuite(name, callback, DeclarationMode.Skip);
	}

	export function todo(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		declareModifiedSuite(name, callback, DeclarationMode.Todo);
	}

	export function sequential(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		declareModifiedSuite(
			name,
			callback,
			DeclarationMode.Normal,
			false,
			false,
			SequenceMode.Sequential,
		);
	}

	export function skipIf(condition: bool): SuiteDeclaration {
		return condition ? describe.skip : describe;
	}

	export function runIf(condition: bool): SuiteDeclaration {
		return condition ? describe : describe.skip;
	}
}

export function suite(
	name: string = "",
	callback: SuiteFn | null = null,
): void {
	declareBaseSuite(name, callback);
}

export namespace suite {
	export function only(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		declareModifiedSuite(name, callback, DeclarationMode.Normal, true);
	}

	export function skip(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		declareModifiedSuite(name, callback, DeclarationMode.Skip);
	}

	export function todo(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		declareModifiedSuite(name, callback, DeclarationMode.Todo);
	}

	export function sequential(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		declareModifiedSuite(
			name,
			callback,
			DeclarationMode.Normal,
			false,
			false,
			SequenceMode.Sequential,
		);
	}

	export function skipIf(condition: bool): SuiteDeclaration {
		return condition ? suite.skip : suite;
	}

	export function runIf(condition: bool): SuiteDeclaration {
		return condition ? suite : suite.skip;
	}
}

export function beforeAll(callback: ModuleHookFn | null = null): void {
	declareHook(HookKind.BeforeAll, callback);
}

export function afterAll(callback: ModuleHookFn | null = null): void {
	declareHook(HookKind.AfterAll, callback);
}

export function beforeEach(callback: HookFn | null = null): void {
	declareHook(HookKind.BeforeEach, callback);
}

export function afterEach(callback: HookFn | null = null): void {
	declareHook(HookKind.AfterEach, callback);
}

export function assertType<T>(_value: T): void {}
