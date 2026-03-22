import { expect, test } from "bun:test";
import { NodeKind, Parser } from "assemblyscript/dist/assemblyscript.js";
import type {
	CallExpression,
	ExpressionStatement,
	FunctionDeclaration,
	ImportStatement,
	Statement,
} from "assemblyscript/dist/assemblyscript.js";
import ArtifactFrameTransform, {
	resetArtifactFrameTransformOptions,
	setArtifactFrameTransformOptions,
} from "../src/artifactFrames.js";
import {
	ARTIFACT_FRAME_SOURCE_IMPORT_NAME,
	ARTIFACT_FRAME_SOURCE_RUNTIME_IMPORT_PATH,
} from "../src/contracts.js";

function parseSource(sourceText: string, filename = "fixture.ts") {
	const parser = new Parser();
	parser.parseFile(sourceText, filename, true);
	parser.finish();
	return parser;
}

function getParsedStatements(parser: Parser): Statement[] {
	const [source] = parser.sources;
	if (!source) {
		throw new Error("Parser did not produce any sources");
	}

	return source.statements;
}

function withArtifactFrameTransformOptions(
	options: Parameters<typeof setArtifactFrameTransformOptions>[0],
	run: () => void,
): void {
	setArtifactFrameTransformOptions(options);
	try {
		run();
	} finally {
		resetArtifactFrameTransformOptions();
	}
}

function getCallExpressionName(callExpression: CallExpression): string {
	if (callExpression.expression.kind === NodeKind.Identifier) {
		return callExpression.expression.text;
	}

	if (callExpression.expression.kind === NodeKind.PropertyAccess) {
		return callExpression.expression.property.text;
	}

	throw new Error("Unsupported call expression shape");
}

function findTopLevelCall(
	statements: readonly Statement[],
	name: string,
): CallExpression {
	for (const statement of statements) {
		if (statement.kind !== NodeKind.Expression) {
			continue;
		}

		const callExpression = (statement as ExpressionStatement).expression;
		if (
			callExpression.kind === NodeKind.Call &&
			getCallExpressionName(callExpression as CallExpression) === name
		) {
			return callExpression as CallExpression;
		}
	}

	throw new Error(`Call ${name} was not found`);
}

function getCallbackBody(callExpression: CallExpression): Statement[] {
	for (const argument of callExpression.args) {
		if (argument.kind !== NodeKind.Function) {
			continue;
		}

		const declaration = argument.declaration as FunctionDeclaration;
		if (!declaration.body) {
			throw new Error("Function callback has no body");
		}

		return declaration.body.statements;
	}

	throw new Error("Function callback was not found");
}

function expectArtifactFrameMarker(
	statement: Statement,
	sourceFile: string,
): void {
	expect(statement.kind).toBe(NodeKind.Expression);

	const expression = (statement as ExpressionStatement).expression;
	expect(expression.kind).toBe(NodeKind.Call);

	const callExpression = expression as CallExpression;
	expect(getCallExpressionName(callExpression)).toBe(
		ARTIFACT_FRAME_SOURCE_IMPORT_NAME,
	);
	expect(callExpression.args[0]?.value).toBe(sourceFile);
	expect(Number(callExpression.args[1]?.value.toString() ?? 0)).toBeGreaterThan(
		0,
	);
	expect(Number(callExpression.args[2]?.value.toString() ?? 0)).toBeGreaterThan(
		0,
	);
}

test("prepends an artifact-frame source marker to declaration callbacks", () => {
	withArtifactFrameTransformOptions(
		{
			baseDir: "/workspace",
		},
		() => {
			const parser = parseSource(
				[
					'describe("suite", (_context): void => {',
					"\tbeforeEach((_hookContext): void => {});",
					'\ttest("leaf", (_testContext): void => {});',
					"});",
				].join("\n"),
				"/workspace/tests/suite.test.ts",
			);

			new ArtifactFrameTransform().afterParse(parser);

			const statements = getParsedStatements(parser);
			expect(statements[0]?.kind).toBe(NodeKind.Import);
			expect((statements[0] as ImportStatement).path.value).toBe(
				ARTIFACT_FRAME_SOURCE_RUNTIME_IMPORT_PATH,
			);

			const describeBody = getCallbackBody(
				findTopLevelCall(statements, "describe"),
			);
			expectArtifactFrameMarker(describeBody[0], "tests/suite.test.ts");
			expectArtifactFrameMarker(
				getCallbackBody(findTopLevelCall(describeBody, "beforeEach"))[0],
				"tests/suite.test.ts",
			);
			expectArtifactFrameMarker(
				getCallbackBody(findTopLevelCall(describeBody, "test"))[0],
				"tests/suite.test.ts",
			);
		},
	);
});

test("instruments property-style focused declarations without duplicating the import prelude", () => {
	withArtifactFrameTransformOptions(
		{
			baseDir: "/workspace",
		},
		() => {
			const parser = parseSource(
				[
					'test.only("focused", (_context): void => {});',
					'test.skip("skipped", (_context): void => {});',
				].join("\n"),
				"/workspace/tests/focused.test.ts",
			);

			new ArtifactFrameTransform().afterParse(parser);

			const statements = getParsedStatements(parser);
			expect(
				statements.filter((statement) => statement.kind === NodeKind.Import),
			).toHaveLength(1);
			expectArtifactFrameMarker(
				getCallbackBody(findTopLevelCall(statements, "only"))[0],
				"tests/focused.test.ts",
			);
			expectArtifactFrameMarker(
				getCallbackBody(findTopLevelCall(statements, "skip"))[0],
				"tests/focused.test.ts",
			);
		},
	);
});
