import {
  after,
  afterEach,
  before,
  beforeEach,
  test,
  TestContext,
} from "../node_test";

export { allocateNodeIndexBuffer, discover, invoke, run } from "../exports";

before((_context: TestContext): void => {});
beforeEach((_context: TestContext): void => {});
afterEach((_context: TestContext): void => {});
after((_context: TestContext): void => {});

test("passing test", (context: TestContext): void => {
  context.plan(1);
  context.diagnostic("passing test diagnostic");
  trace("passing test trace", 2, 11, 12);
  context.assert.strictEqual<i32>(11, 11);
});

test("failing test", (context: TestContext): void => {
  trace("failing test trace", 1, 12);
  context.assert.strictEqual<i32>(11, 12, "node:test smoke mismatch");
});

test("planned mismatch test", (context: TestContext): void => {
  context.plan(2);
  context.assert.strictEqual<i32>(21, 21);
});

test("parent test", (context: TestContext): void => {
  context.test("nested child", (_nestedContext: TestContext): void => {});
});

test("run-only parent", (context: TestContext): void => {
  context.runOnly(true);
  context.test("run-only nested child", (_nestedContext: TestContext): void => {});
  context.runOnly(false);
  context.test("plain nested child", (_nestedContext: TestContext): void => {});
});

test.expectFailure("expected failure test", (_context: TestContext): void => {});

test.skip("skipped parent", (context: TestContext): void => {
  context.test("skipped nested child", (_nestedContext: TestContext): void => {});
});

test.todo("todo parent", (context: TestContext): void => {
  context.test("todo nested child", (_nestedContext: TestContext): void => {});
});

test.todo("top-level todo leaf", (_context: TestContext): void => {});

test("hook failure parent", (context: TestContext): void => {
  context.beforeEach((hookContext: TestContext): void => {
    hookContext.assert.strictEqual<i32>(31, 32, "hook beforeEach mismatch");
  });

  context.test("hook failure child", (_nestedContext: TestContext): void => {});
});

test("trap parent", (context: TestContext): void => {
  context.test("trapping child", (_nestedContext: TestContext): void => {
    unreachable();
  });
});

test("discovery trap parent", (context: TestContext): void => {
  context.test("pruned child", (_nestedContext: TestContext): void => {});
  unreachable();
});

const dependencyPrereq = test(
  "dependency prereq",
  (_context: TestContext): void => {},
);

test("dependency dependent", (_context: TestContext): void => {}).dependsOn(
  dependencyPrereq,
);

const dependencyFailingPrereq = test(
  "dependency failing prereq",
  (context: TestContext): void => {
    context.assert.strictEqual<i32>(51, 52, "dependency failing prereq mismatch");
  },
);

test(
  "dependency blocked dependent",
  (_context: TestContext): void => {},
).dependsOn(dependencyFailingPrereq);

const dependencyExpectedFailurePrereq = test.expectFailure(
  "dependency expected failure prereq",
  (context: TestContext): void => {
    context.assert.strictEqual<i32>(
      61,
      62,
      "dependency expected failure prereq mismatch",
    );
  },
);

test(
  "dependency satisfied dependent",
  (_context: TestContext): void => {},
).dependsOn(dependencyExpectedFailurePrereq);

const dependencySkippedPrereq = test.skip(
  "dependency skipped prereq",
  (_context: TestContext): void => {},
);

test(
  "dependency skipped dependent",
  (_context: TestContext): void => {},
).dependsOn(dependencySkippedPrereq);

const dependencyTodoPrereq = test.todo(
  "dependency todo prereq",
  (_context: TestContext): void => {},
);

test(
  "dependency todo dependent",
  (_context: TestContext): void => {},
).dependsOn(dependencyTodoPrereq);

const dependencyUnexpectedPassPrereq = test.expectFailure(
  "dependency unexpected pass prereq",
  (_context: TestContext): void => {},
);

test(
  "dependency unexpected pass dependent",
  (_context: TestContext): void => {},
).dependsOn(dependencyUnexpectedPassPrereq);

test("dependency only parent", (context: TestContext): void => {
  const dependencyOnlyFilteredPrereq = context.test(
    "dependency only filtered prereq",
    (_nestedContext: TestContext): void => {},
  );

  context.runOnly(true);
  context
    .test(
      "dependency only included dependent",
      (_nestedContext: TestContext): void => {},
    )
    .dependsOn(dependencyOnlyFilteredPrereq);
});
