import {
	NodeDeclarationOptions,
	declareSuiteNode,
	declareTestNode,
	registerHook,
} from "../internal/api";
import { SuiteContext, TestContext } from "../internal/context";
import { Node } from "../internal/node";
import { DeclarationMode, HookKind, SequenceMode } from "../internal/imports";
import { HookFn, SuiteFn, TestFn } from "./types";

function createDeclarationOptions(
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
	expectFailure: bool = false,
	sequenceMode: SequenceMode = SequenceMode.Inherit,
): NodeDeclarationOptions {
	const options = new NodeDeclarationOptions();
	options.mode = mode;
	options.only = only;
	options.expectFailure = expectFailure;
	options.sequenceMode = sequenceMode;
	return options;
}

export function declareTest(
	name: string = "",
	callback: TestFn | null = null,
	context: TestContext | null = null,
): Node {
	return declareTestNode(name, callback, null, context);
}

export function declareModifiedTest(
	name: string = "",
	callback: TestFn | null = null,
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
	expectFailure: bool = false,
	sequenceMode: SequenceMode = SequenceMode.Inherit,
	context: TestContext | null = null,
): Node {
	return declareTestNode(
		name,
		callback,
		createDeclarationOptions(mode, only, expectFailure, sequenceMode),
		context,
	);
}

export function declareSuite(
	name: string = "",
	callback: SuiteFn | null = null,
	context: SuiteContext | null = null,
): Node {
	return declareSuiteNode(name, callback, null, context);
}

export function declareModifiedSuite(
	name: string = "",
	callback: SuiteFn | null = null,
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
	expectFailure: bool = false,
	sequenceMode: SequenceMode = SequenceMode.Inherit,
	context: SuiteContext | null = null,
): Node {
	return declareSuiteNode(
		name,
		callback,
		createDeclarationOptions(mode, only, expectFailure, sequenceMode),
		context,
	);
}

export function declareHook(
	kind: HookKind,
	callback: HookFn | null = null,
	context: TestContext | null = null,
): void {
	registerHook(kind, callback, -1, context);
}
