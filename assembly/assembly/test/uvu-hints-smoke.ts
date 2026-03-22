import { exec, suite, test, TestContext } from "../uvu";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

function failWithMessage(context: TestContext, message: string): void {
	context.assert.fail(message);
}

test.inBand();
test.inBand(false);
test.bail();
test.continueOnFailure();
exec(false);

const bailSuite = suite("uvu hinted bail suite");
bailSuite.inBand();
bailSuite.bail();
bailSuite.test("bail failing child", (context: TestContext): void => {
	failWithMessage(context, "uvu bail failure");
});
bailSuite.test("bail blocked child", (_context: TestContext): void => {});

const continueSuite = suite("uvu continue suite");
continueSuite.inBand();
continueSuite.continueOnFailure();
continueSuite.test("continue failing child", (context: TestContext): void => {
	failWithMessage(context, "uvu continue failure");
});
continueSuite.test("continue passing child", (context: TestContext): void => {
	context.diagnostic("uvu continue diagnostic");
});

bailSuite.run();
continueSuite.run();
exec(false);
