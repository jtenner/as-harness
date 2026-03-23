import {
	SuiteContext as InternalSuiteContext,
	TestContext as InternalTestContext,
} from "../internal/context";
import { DeclarationMode } from "../internal/imports";
import { currentNode, Node } from "../internal/node";
import {
	declareModifiedSuite,
	declareModifiedTest,
	declareSuite,
	declareTest,
} from "./parse";
import {
	GlobalHooks,
	ModuleFn,
	sharedGlobalHooks,
	TestFn,
	internalQUnitAssertContext,
	internalQUnitModuleContext,
	sharedNestedHooks,
} from "./types";

export * from "./types";

class ModuleDefaults {
	mode: DeclarationMode = DeclarationMode.Normal;
	only: bool = false;
	expectFailure: bool = false;

	copy(): ModuleDefaults {
		const copy = new ModuleDefaults();
		copy.mode = this.mode;
		copy.only = this.only;
		copy.expectFailure = this.expectFailure;
		return copy;
	}
}

class ModuleInvocation {
	readonly callback: ModuleFn | null;
	readonly defaults: ModuleDefaults;

	constructor(callback: ModuleFn | null, defaults: ModuleDefaults) {
		this.callback = callback;
		this.defaults = defaults;
	}
}

const moduleInvocations = new Map<u32, ModuleInvocation>();
const moduleDefaultsStack = new Array<ModuleDefaults>();

function castTestCallback(
	callback: TestFn | null = null,
): ((context: InternalTestContext) => void) | null {
	return callback === null
		? null
		: changetype<(context: InternalTestContext) => void>(callback);
}

function currentModuleDefaults(): ModuleDefaults {
	if (moduleDefaultsStack.length == 0) {
		return new ModuleDefaults();
	}

	return unchecked(moduleDefaultsStack[moduleDefaultsStack.length - 1]).copy();
}

function createInheritedModuleDefaults(
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
	expectFailure: bool = false,
): ModuleDefaults {
	const defaults = currentModuleDefaults();

	if (defaults.mode == DeclarationMode.Skip || mode == DeclarationMode.Skip) {
		defaults.mode = DeclarationMode.Skip;
	} else if (mode == DeclarationMode.Todo) {
		defaults.mode = DeclarationMode.Todo;
	}

	defaults.only = defaults.only || only;
	defaults.expectFailure = defaults.expectFailure || expectFailure;

	return defaults;
}

function invokeDeclaredModule(_context: InternalSuiteContext): void {
	const nodeId = currentNode.nodeId;
	if (!moduleInvocations.has(nodeId)) {
		unreachable();
	}

	const invocation = changetype<ModuleInvocation>(
		moduleInvocations.get(nodeId),
	);
	moduleDefaultsStack.push(invocation.defaults.copy());
	if (invocation.callback !== null) {
		changetype<ModuleFn>(invocation.callback)(sharedNestedHooks);
	}
	moduleDefaultsStack.pop();
}

function declareQUnitModule(
	name: string = "",
	callback: ModuleFn | null = null,
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
	expectFailure: bool = false,
): void {
	const inheritedDefaults = createInheritedModuleDefaults(
		mode,
		only,
		expectFailure,
	);

	let node: Node;
	if (
		inheritedDefaults.mode != DeclarationMode.Normal ||
		inheritedDefaults.only
	) {
		node = declareModifiedSuite(
			name,
			invokeDeclaredModule,
			inheritedDefaults.mode,
			inheritedDefaults.only,
			false,
			0,
			internalQUnitModuleContext,
		);
	} else {
		node = declareSuite(name, invokeDeclaredModule, internalQUnitModuleContext);
	}

	moduleInvocations.set(
		node.nodeId,
		new ModuleInvocation(callback, inheritedDefaults),
	);
}

function declareQUnitTest(
	name: string = "",
	callback: TestFn | null = null,
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
	expectFailure: bool = false,
): void {
	const inheritedDefaults = createInheritedModuleDefaults(
		mode,
		only,
		expectFailure,
	);

	if (
		callback === null &&
		inheritedDefaults.mode == DeclarationMode.Todo &&
		!inheritedDefaults.only &&
		!inheritedDefaults.expectFailure
	) {
		declareModifiedTest(
			name,
			null,
			DeclarationMode.Todo,
			false,
			false,
			0,
			internalQUnitAssertContext,
		);
		return;
	}

	if (
		inheritedDefaults.mode == DeclarationMode.Normal &&
		!inheritedDefaults.only &&
		!inheritedDefaults.expectFailure
	) {
		declareTest(name, castTestCallback(callback), internalQUnitAssertContext);
		return;
	}

	declareModifiedTest(
		name,
		castTestCallback(callback),
		inheritedDefaults.mode,
		inheritedDefaults.only,
		inheritedDefaults.expectFailure,
		0,
		internalQUnitAssertContext,
	);
}

export function test(name: string = "", callback: TestFn | null = null): void {
	declareQUnitTest(name, callback);
}

export namespace test {
	export function only(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareQUnitTest(name, callback, DeclarationMode.Normal, true);
	}

	export function skip(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareQUnitTest(name, callback, DeclarationMode.Skip);
	}

	export function todo(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		if (callback === null) {
			declareQUnitTest(name, null, DeclarationMode.Todo);
			return;
		}

		declareQUnitTest(name, callback, DeclarationMode.Normal, false, true);
	}
}

export function module(
	name: string = "",
	callback: ModuleFn | null = null,
): void {
	declareQUnitModule(name, callback);
}

export namespace module {
	export function only(
		name: string = "",
		callback: ModuleFn | null = null,
	): void {
		declareQUnitModule(name, callback, DeclarationMode.Normal, true);
	}

	export function skip(
		name: string = "",
		callback: ModuleFn | null = null,
	): void {
		declareQUnitModule(name, callback, DeclarationMode.Skip);
	}

	export function todo(
		name: string = "",
		callback: ModuleFn | null = null,
	): void {
		declareQUnitModule(name, callback, DeclarationMode.Normal, false, true);
	}
}

class QUnitRoot {
	readonly hooks: GlobalHooks = sharedGlobalHooks;

	test(name: string = "", callback: TestFn | null = null): void {
		test(name, callback);
	}

	module(name: string = "", callback: ModuleFn | null = null): void {
		module(name, callback);
	}

	only(name: string = "", callback: TestFn | null = null): void {
		test.only(name, callback);
	}

	skip(name: string = "", callback: TestFn | null = null): void {
		test.skip(name, callback);
	}

	todo(name: string = "", callback: TestFn | null = null): void {
		test.todo(name, callback);
	}
}

const QUnit = new QUnitRoot();

export default QUnit;
