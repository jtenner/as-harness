import { currentNode, Node, setCurrentNode } from "../internal/node";
import { DeclarationMode, HookKind } from "../internal/imports";
import {
	declareHook,
	declareModifiedSuite,
	declareModifiedTest,
	declareTest,
} from "./parse";
import { HookFn, TestFn } from "./types";

export * from "./types";

export class UvuSuite<T = usize> {
	private readonly node: Node;
	readonly context: T;

	constructor(node: Node, context: T = changetype<T>(0)) {
		this.node = node.getDeclarationSlotSource();
		this.context = context;
	}

	get name(): string {
		return this.node.name;
	}

	test(name: string = "", callback: TestFn | null = null): void {
		const previousNode = currentNode;
		setCurrentNode(this.node);
		declareTest(name, callback);
		setCurrentNode(previousNode);
	}

	only(name: string = "", callback: TestFn | null = null): void {
		const previousNode = currentNode;
		setCurrentNode(this.node);
		declareModifiedTest(name, callback, DeclarationMode.Normal, true);
		setCurrentNode(previousNode);
	}

	skip(name: string = "", callback: TestFn | null = null): void {
		const previousNode = currentNode;
		setCurrentNode(this.node);
		declareModifiedTest(name, callback, DeclarationMode.Skip);
		setCurrentNode(previousNode);
	}

	before(callback: HookFn | null = null): void {
		const previousNode = currentNode;
		setCurrentNode(this.node);
		declareHook(HookKind.BeforeAll, callback);
		setCurrentNode(previousNode);
	}

	after(callback: HookFn | null = null): void {
		const previousNode = currentNode;
		setCurrentNode(this.node);
		declareHook(HookKind.AfterAll, callback);
		setCurrentNode(previousNode);
	}

	beforeEach(callback: HookFn | null = null): void {
		const previousNode = currentNode;
		setCurrentNode(this.node);
		declareHook(HookKind.BeforeEach, callback);
		setCurrentNode(previousNode);
	}

	afterEach(callback: HookFn | null = null): void {
		const previousNode = currentNode;
		setCurrentNode(this.node);
		declareHook(HookKind.AfterEach, callback);
		setCurrentNode(previousNode);
	}

	run(): void {}
}

export function suite<T = usize>(
	name: string = "",
	context: T = changetype<T>(0),
): UvuSuite<T> {
	return new UvuSuite<T>(declareModifiedSuite(name, null), context);
}

export function test(name: string = "", callback: TestFn | null = null): void {
	declareTest(name, callback);
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

	export function before(callback: HookFn | null = null): void {
		declareHook(HookKind.BeforeAll, callback);
	}

	export namespace before {
		export function each(callback: HookFn | null = null): void {
			declareHook(HookKind.BeforeEach, callback);
		}
	}

	export function after(callback: HookFn | null = null): void {
		declareHook(HookKind.AfterAll, callback);
	}

	export namespace after {
		export function each(callback: HookFn | null = null): void {
			declareHook(HookKind.AfterEach, callback);
		}
	}

	export function run(): void {}
}

export function exec(_bail: bool = false): void {}
