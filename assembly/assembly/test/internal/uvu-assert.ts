import { didCallbackTrap } from "../../internal/trampoline";
import {
	equal,
	is,
	not,
	ok,
	throws,
	type,
	unreachable,
} from "../../uvu/assert";

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
	type<i32>(2, "number");
	type<bool>(true, "boolean");
	type<string>("uvu", "string");
	not<i32>(2, 3);
	not.equal<Array<i32>>([1, 2], [1, 3]);
	not.type<i32>(2, "string");
	throws(trapsUnreachable);
	not.throws(doesNotTrap);

	assert(didCallbackTrap(trapsUnreachable));
	assert(didCallbackTrap(trapsFailedOk));
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
