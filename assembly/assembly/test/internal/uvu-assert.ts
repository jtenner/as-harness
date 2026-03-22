import { didCallbackTrap } from "../../internal/trampoline";
import { addReflectedValueKeyValuePair } from "../../internal/reflected-value";
import {
	equal,
	is,
	match,
	not,
	ok,
	throws,
	type,
	unreachable,
} from "../../uvu/assert";

class UvuAssertMatchLeaf {
	label: string;
	count: i32;

	constructor(label: string, count: i32) {
		this.label = label;
		this.count = count;
	}

	__asHarnessAddReflectedValueKeyValuePairs(): void {
		addReflectedValueKeyValuePair("field:label", this.label);
		addReflectedValueKeyValuePair("field:count", this.count);
	}
}

class UvuAssertMatchNode {
	name: string;
	leaf: UvuAssertMatchLeaf;

	constructor(name: string, leaf: UvuAssertMatchLeaf) {
		this.name = name;
		this.leaf = leaf;
	}

	__asHarnessAddReflectedValueKeyValuePairs(): void {
		addReflectedValueKeyValuePair("field:name", this.name);
		addReflectedValueKeyValuePair("field:leaf", this.leaf);
	}
}

function trapsUnreachable(): void {
	unreachable("uvu assert unreachable");
}

function doesNotTrap(): void {}

function trapsFailedOk(): void {
	ok<bool>(false, "uvu assert ok mismatch");
}

function testUvuAssertFunctions(): void {
	ok<bool>(true);
	is<i32>(2, 2);
	is.not<i32>(2, 3);
	equal<Array<i32>>([1, 2], [1, 2]);
	match<string, string>("uvu assert partial match", "partial");
	match<Array<i32>, Array<i32>>([1, 2, 3], [1, 2]);
	match<UvuAssertMatchNode, UvuAssertMatchNode>(
		new UvuAssertMatchNode("runner", new UvuAssertMatchLeaf("leaf value", 3)),
		new UvuAssertMatchNode("run", new UvuAssertMatchLeaf("leaf", 3)),
	);
	type<i32>(2, "number");
	type<bool>(true, "boolean");
	type<string>("uvu", "string");
	not<i32>(2, 3);
	not.equal<Array<i32>>([1, 2], [1, 3]);
	not.match<string, string>("uvu", "runner");
	not.type<i32>(2, "string");
	throws(trapsUnreachable);
	not.throws(doesNotTrap);

	assert(didCallbackTrap(trapsUnreachable));
	assert(didCallbackTrap(trapsFailedOk));
	assert(
		didCallbackTrap((): void => {
			match<Array<i32>, Array<i32>>([1, 2], [1, 3]);
		}),
	);
	assert(
		didCallbackTrap((): void => {
			not.match<string, string>("uvu partial match", "partial");
		}),
	);
	assert(
		didCallbackTrap((): void => {
			type<i32>(2, "string");
		}),
	);
	assert(
		didCallbackTrap((): void => {
			not.type<i32>(2, "number");
		}),
	);
	assert(
		didCallbackTrap((): void => {
			throws(doesNotTrap);
		}),
	);
	assert(
		didCallbackTrap((): void => {
			not.throws(trapsUnreachable);
		}),
	);
}

testUvuAssertFunctions();
