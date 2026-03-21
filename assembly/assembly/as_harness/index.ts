import { TestDeclarationHandle } from "../internal/api";
import { DeclarationMode, HookKind, SequenceMode } from "../internal/imports";
import { Node } from "../internal/node";
import {
	declareHook,
	declareModifiedSuite,
	declareModifiedTest,
	declareSuite,
	declareTest,
} from "../node_test/parse";
import { HookFn, SuiteFn, TestFn } from "../node_test/types";

export * from "../node_test/types";
export { TestDeclarationHandle as TestDeclaration };

function createDeclarationHandle(node: Node): TestDeclarationHandle {
	return new TestDeclarationHandle(node);
}

function declareBaseTest(
	name: string = "",
	callback: TestFn | null = null,
): TestDeclarationHandle {
	if (callback === null) {
		return createDeclarationHandle(
			declareModifiedTest(name, callback, DeclarationMode.Todo),
		);
	}

	return createDeclarationHandle(declareTest(name, callback));
}

function declareSequentialSuite(
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

export function test(
	name: string = "",
	callback: TestFn | null = null,
): TestDeclarationHandle {
	return declareBaseTest(name, callback);
}

export namespace test {
	export function only(
		name: string = "",
		callback: TestFn | null = null,
	): TestDeclarationHandle {
		return createDeclarationHandle(
			declareModifiedTest(name, callback, DeclarationMode.Normal, true),
		);
	}

	export function skip(
		name: string = "",
		callback: TestFn | null = null,
	): TestDeclarationHandle {
		return createDeclarationHandle(
			declareModifiedTest(name, callback, DeclarationMode.Skip),
		);
	}

	export function todo(
		name: string = "",
		callback: TestFn | null = null,
	): TestDeclarationHandle {
		return createDeclarationHandle(
			declareModifiedTest(name, callback, DeclarationMode.Todo),
		);
	}

	export function expectFailure(
		name: string = "",
		callback: TestFn | null = null,
	): TestDeclarationHandle {
		return createDeclarationHandle(
			declareModifiedTest(name, callback, DeclarationMode.Normal, false, true),
		);
	}

	export function fails(
		name: string = "",
		callback: TestFn | null = null,
	): TestDeclarationHandle {
		return expectFailure(name, callback);
	}

	export function sequential(
		name: string = "",
		callback: TestFn | null = null,
	): TestDeclarationHandle {
		return createDeclarationHandle(
			declareModifiedTest(
				name,
				callback,
				callback === null ? DeclarationMode.Todo : DeclarationMode.Normal,
				false,
				false,
				SequenceMode.Sequential,
			),
		);
	}
}

export function it(
	name: string = "",
	callback: TestFn | null = null,
): TestDeclarationHandle {
	return declareBaseTest(name, callback);
}

export namespace it {
	export function only(
		name: string = "",
		callback: TestFn | null = null,
	): TestDeclarationHandle {
		return test.only(name, callback);
	}

	export function skip(
		name: string = "",
		callback: TestFn | null = null,
	): TestDeclarationHandle {
		return test.skip(name, callback);
	}

	export function todo(
		name: string = "",
		callback: TestFn | null = null,
	): TestDeclarationHandle {
		return test.todo(name, callback);
	}

	export function expectFailure(
		name: string = "",
		callback: TestFn | null = null,
	): TestDeclarationHandle {
		return test.expectFailure(name, callback);
	}

	export function fails(
		name: string = "",
		callback: TestFn | null = null,
	): TestDeclarationHandle {
		return test.fails(name, callback);
	}

	export function sequential(
		name: string = "",
		callback: TestFn | null = null,
	): TestDeclarationHandle {
		return test.sequential(name, callback);
	}
}

export function describe(
	name: string = "",
	callback: SuiteFn | null = null,
): void {
	declareSuite(name, callback);
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
		declareSequentialSuite(name, callback);
	}
}

export function suite(
	name: string = "",
	callback: SuiteFn | null = null,
): void {
	declareSuite(name, callback);
}

export namespace suite {
	export function only(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		describe.only(name, callback);
	}

	export function skip(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		describe.skip(name, callback);
	}

	export function todo(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		describe.todo(name, callback);
	}

	export function sequential(
		name: string = "",
		callback: SuiteFn | null = null,
	): void {
		describe.sequential(name, callback);
	}
}

export function sequential(
	name: string = "",
	callback: SuiteFn | null = null,
): void {
	declareSequentialSuite(name, callback);
}

export function beforeAll(callback: HookFn | null = null): void {
	declareHook(HookKind.BeforeAll, callback);
}

export function afterAll(callback: HookFn | null = null): void {
	declareHook(HookKind.AfterAll, callback);
}

export function beforeEach(callback: HookFn | null = null): void {
	declareHook(HookKind.BeforeEach, callback);
}

export function afterEach(callback: HookFn | null = null): void {
	declareHook(HookKind.AfterEach, callback);
}
