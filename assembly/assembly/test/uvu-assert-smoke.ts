import { test, TestContext } from "../node_test";
import { addReflectedValueKeyValuePair } from "../internal/reflected-value";
import {
	equal,
	instance,
	is,
	match,
	not,
	ok,
	throws,
	type,
	unreachable,
} from "../uvu/assert";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

class UvuAssertSmokeLeaf {
	label: string;

	constructor(label: string) {
		this.label = label;
	}

	__asHarnessAddReflectedValueKeyValuePairs(): void {
		addReflectedValueKeyValuePair("field:label", this.label);
	}
}

class UvuAssertSmokeNode {
	name: string;
	leaf: UvuAssertSmokeLeaf;

	constructor(name: string, leaf: UvuAssertSmokeLeaf) {
		this.name = name;
		this.leaf = leaf;
	}

	__asHarnessAddReflectedValueKeyValuePairs(): void {
		addReflectedValueKeyValuePair("field:name", this.name);
		addReflectedValueKeyValuePair("field:leaf", this.leaf);
	}
}

function failViaUnreachable(): void {
	unreachable("uvu assert smoke trap");
}

function doesNotTrap(): void {}

test("passes through uvu/assert", (context: TestContext): void => {
	ok<bool>(true);
	is<i32>(11, 11);
	is.not<i32>(11, 12);
	equal<Array<i32>>([1, 2], [1, 2]);
	instance<UvuAssertSmokeNode>(
		new UvuAssertSmokeNode("runner", new UvuAssertSmokeLeaf("leaf value")),
		idof<UvuAssertSmokeNode>(),
	);
	match<string, string>("uvu assert smoke", "smoke");
	match<Array<i32>, Array<i32>>([1, 2, 3], [1, 2]);
	match<UvuAssertSmokeNode, UvuAssertSmokeNode>(
		new UvuAssertSmokeNode("runner", new UvuAssertSmokeLeaf("leaf value")),
		new UvuAssertSmokeNode("run", new UvuAssertSmokeLeaf("leaf")),
	);
	type<i32>(11, "number");
	type<string>("uvu", "string");
	throws(failViaUnreachable);
	not<i32>(11, 12);
	not.instance<UvuAssertSmokeNode>(
		new UvuAssertSmokeNode("runner", new UvuAssertSmokeLeaf("leaf value")),
		idof<Uint8Array>(),
	);
	not.equal<Array<i32>>([1, 2], [1, 3]);
	not.match<string, string>("uvu", "runner");
	not.type<i32>(11, "string");
	not.throws(doesNotTrap);
	context.diagnostic("uvu assert smoke diagnostic");
});
