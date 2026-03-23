import {
	AssertionFailureRecord,
	getActiveAssertionFailureRecord,
	getActiveFailureKind,
} from "../../internal/failure-state";
import { FailureKind } from "../../internal/imports";
import { didCallbackTrap } from "../../internal/trampoline";
import { addReflectedValueKeyValuePair } from "../../internal/reflected-value";
import {
	Assertion,
	equal,
	instance,
	is,
	match,
	not,
	ok,
	throws,
	type,
	unreachable as uvuUnreachable,
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

function trapsGenericNullAccess(): void {
	unreachable();
}

function doesNotTrap(): void {}

function trapsFailedOk(): void {
	ok<bool>(false, "uvu assert ok mismatch");
}

function trapsViaUvuUnreachable(): void {
	uvuUnreachable("uvu assert unreachable");
}

function testUvuAssertFunctions(): void {
	const assertion = new Assertion(
		"manual assertion",
		"equal",
		"[1]",
		"[2]",
		"manual detail",
		true,
	);
	assert(assertion.name == "Assertion");
	assert(assertion.code == "ERR_ASSERTION");
	assert(assertion.message == "manual assertion");
	assert(assertion.operator == "equal");
	assert(assertion.actual == "[1]");
	assert(assertion.expects == "[2]");
	assert(assertion.details == "manual detail");
	assert(assertion.generated);

	ok<bool>(true);
	is<i32>(2, 2);
	is.not<i32>(2, 3);
	equal<Array<i32>>([1, 2], [1, 2]);
	instance<UvuAssertMatchNode>(
		new UvuAssertMatchNode("runner", new UvuAssertMatchLeaf("leaf value", 3)),
		idof<UvuAssertMatchNode>(),
	);
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
	not.instance<UvuAssertMatchNode>(
		new UvuAssertMatchNode("runner", new UvuAssertMatchLeaf("leaf value", 3)),
		idof<Uint8Array>(),
	);
	not.equal<Array<i32>>([1, 2], [1, 3]);
	not.match<string, string>("uvu", "runner");
	not.type<i32>(2, "string");
	throws(trapsGenericNullAccess);
	not.throws(doesNotTrap);

	assert(didCallbackTrap(trapsViaUvuUnreachable));
	assert(didCallbackTrap(trapsFailedOk));
	assert(
		didCallbackTrap((): void => {
			throws(trapsFailedOk);
		}),
	);
	assert(getActiveFailureKind() == <u8>FailureKind.Assertion);
	const throwsAssertion = getActiveAssertionFailureRecord();
	assert(throwsAssertion !== null);
	assert(changetype<AssertionFailureRecord>(throwsAssertion).operator == "ok");
	assert(
		changetype<AssertionFailureRecord>(throwsAssertion).message ==
			"uvu assert ok mismatch",
	);
	assert(
		didCallbackTrap((): void => {
			instance<string>("uvu", idof<ArrayBuffer>());
		}),
	);
	assert(
		didCallbackTrap((): void => {
			not.instance<string>("uvu", idof<string>());
		}),
	);
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
			not.throws(trapsGenericNullAccess);
		}),
	);
	const notThrowsAssertion = getActiveAssertionFailureRecord();
	assert(notThrowsAssertion !== null);
	assert(
		changetype<AssertionFailureRecord>(notThrowsAssertion).operator ==
			"not.throws",
	);
}

testUvuAssertFunctions();
