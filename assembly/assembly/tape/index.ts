import { DeclarationMode } from "../internal/imports";
import { TestContext as InternalTestContext } from "../internal/context";
import { declareModifiedTest, declareTest } from "./parse";
import { sharedTapeContext, TestFn } from "./types";

export * from "./types";

function castTestCallback(
	callback: TestFn | null = null,
): ((context: InternalTestContext) => void) | null {
	return callback === null
		? null
		: changetype<(context: InternalTestContext) => void>(callback);
}

const internalTapeContext = changetype<InternalTestContext>(sharedTapeContext);

function declareTapeTest(
	name: string = "",
	callback: TestFn | null = null,
	mode: DeclarationMode = DeclarationMode.Normal,
	only: bool = false,
): void {
	if (mode == DeclarationMode.Normal && !only) {
		declareTest(name, castTestCallback(callback), internalTapeContext);
		return;
	}

	declareModifiedTest(
		name,
		castTestCallback(callback),
		mode,
		only,
		false,
		0,
		internalTapeContext,
	);
}

export default function test(
	name: string = "",
	callback: TestFn | null = null,
): void {
	declareTapeTest(name, callback);
}

export namespace test {
	export function only(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareTapeTest(name, callback, DeclarationMode.Normal, true);
	}

	export function skip(
		name: string = "",
		callback: TestFn | null = null,
	): void {
		declareTapeTest(name, callback, DeclarationMode.Skip);
	}
}
