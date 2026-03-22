import { DeclarationMode, HookKind } from "../internal/imports";
import { fail as failAssertion } from "../node_assert/shared";
export * from "./expect";
import {
	declareHook,
	declareModifiedSuite,
	declareModifiedTest,
	declareSuite,
	declareTest,
} from "./parse";
import { HookFn, SuiteFn, TestFn } from "./types";

export * from "./types";

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

export function describe(
	name: string = "",
	callback: SuiteFn | null = null,
): void {
	declareSuite(name, callback);
}

export function fdescribe(
	name: string = "",
	callback: SuiteFn | null = null,
): void {
	declareModifiedSuite(name, callback, DeclarationMode.Normal, true);
}

export function xdescribe(
	name: string = "",
	callback: SuiteFn | null = null,
): void {
	declareModifiedSuite(name, callback, DeclarationMode.Skip);
}

export function it(name: string = "", callback: TestFn | null = null): void {
	declareBaseTest(name, callback);
}

export function fit(name: string = "", callback: TestFn | null = null): void {
	declareModifiedTest(name, callback, DeclarationMode.Normal, true);
}

export function xit(name: string = "", callback: TestFn | null = null): void {
	declareModifiedTest(name, callback, DeclarationMode.Skip);
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

export function fail(message: string | null = null): void {
	failAssertion(message);
}
