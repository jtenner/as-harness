import { didCallbackTrap } from "../../internal/trampoline";
import { equal, is, not, ok, unreachable } from "../../uvu/assert";

function trapsUnreachable(): void {
	unreachable("uvu assert unreachable");
}

function trapsFailedOk(): void {
	ok<bool>(false, "uvu assert ok mismatch");
}

function testUvuAssertFunctions(): void {
	ok<bool>(true);
	is<i32>(2, 2);
	is.not<i32>(2, 3);
	equal<Array<i32>>([1, 2], [1, 2]);
	not<i32>(2, 3);
	not.equal<Array<i32>>([1, 2], [1, 3]);

	assert(didCallbackTrap(trapsUnreachable));
	assert(didCallbackTrap(trapsFailedOk));
}

testUvuAssertFunctions();
