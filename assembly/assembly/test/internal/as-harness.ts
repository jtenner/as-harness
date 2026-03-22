import {
	DeclarationMode,
	FailurePolicyHint,
	HookKind,
	NodeKind,
	RunnerModeHint,
	SequenceMode,
} from "../../internal/imports";
import { Node, resetCurrentNode, setCurrentNode } from "../../internal/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	it,
	sequential,
	suite,
	SuiteContext,
	test,
	TestContext,
} from "../../as_harness";

function noopSuite(_context: SuiteContext): void {}

function noopTest(_context: TestContext): void {}

function testAsHarnessDeclarationRegistration(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	beforeAll(noopTest);
	afterAll(noopTest);
	beforeEach(noopTest);
	afterEach(noopTest);

	const prereq = test("dependency prereq", noopTest);
	test("dependency dependent", noopTest).dependsOn(prereq);
	test("hinted leaf", noopTest).inBand().bail();
	test("implicit todo");
	test.fails("expected failure", noopTest);
	test.sequential("sequential leaf", noopTest);
	sequential("ordered group", (_context: SuiteContext): void => {
		test("ordered first", noopTest);
		it("ordered second", noopTest);
	});
	describe.only("focused suite", (context: SuiteContext): void => {
		context.inBand();
		context.continueOnFailure();
		suite.sequential("nested ordered suite", noopSuite);
		it.only("nested only", noopTest);
	});
	suite.skip("skipped suite", noopSuite);

	assert(localRoot.getHooks(HookKind.BeforeAll).length == 1);
	assert(localRoot.getHooks(HookKind.AfterAll).length == 1);
	assert(localRoot.getHooks(HookKind.BeforeEach).length == 1);
	assert(localRoot.getHooks(HookKind.AfterEach).length == 1);

	const children = localRoot.getChildren();
	assert(children.length == 9);

	const dependent = unchecked(children[1]);
	const dependencyNodeIds = dependent.getDependencyNodeIds();
	assert(dependencyNodeIds.length == 1);
	assert(unchecked(dependencyNodeIds[0]) == unchecked(children[0]).nodeId);

	const hintedLeaf = unchecked(children[2]);
	assert(hintedLeaf.preferredRunnerMode == RunnerModeHint.InBand);
	assert(hintedLeaf.preferredFailurePolicy == FailurePolicyHint.Bail);

	assert(unchecked(children[3]).declarationMode == DeclarationMode.Todo);
	assert(unchecked(children[4]).expectFailure);
	assert(unchecked(children[5]).sequenceMode == SequenceMode.Sequential);

	const orderedGroup = unchecked(children[6]);
	assert(orderedGroup.kind == NodeKind.Describe);
	assert(orderedGroup.sequenceMode == SequenceMode.Sequential);
	assert(orderedGroup.getChildren().length == 2);

	const focusedSuite = unchecked(children[7]);
	assert(focusedSuite.only);
	assert(focusedSuite.preferredRunnerMode == RunnerModeHint.InBand);
	assert(focusedSuite.preferredFailurePolicy == FailurePolicyHint.Continue);
	const focusedChildren = focusedSuite.getChildren();
	assert(focusedChildren.length == 2);
	assert(unchecked(focusedChildren[0]).sequenceMode == SequenceMode.Sequential);
	assert(unchecked(focusedChildren[1]).only);

	assert(unchecked(children[8]).declarationMode == DeclarationMode.Skip);

	resetCurrentNode();
}

function testAsHarnessAnonymousNames(): void {
	const localRoot = new Node(NodeKind.Root, "local root");
	setCurrentNode(localRoot);

	test("", noopTest);
	sequential("", noopSuite);

	const children = localRoot.getChildren();
	assert(children.length == 2);
	assert(unchecked(children[0]).name == "<anonymous>");
	assert(unchecked(children[1]).name == "<anonymous>");

	resetCurrentNode();
}

testAsHarnessDeclarationRegistration();
testAsHarnessAnonymousNames();
