import { expect, test } from "bun:test";
import { NodeKind, Parser } from "assemblyscript/dist/assemblyscript.js";
import type {
	ExpressionStatement,
	FunctionDeclaration,
	ReturnStatement,
	Statement,
} from "assemblyscript/dist/assemblyscript.js";
import CoversTransform, {
	resetCoverageTransformOptions,
	setCoverageTransformOptions,
} from "../src/covers.js";
import {
	COVER_DECLARE_FUNCTION_NAME,
	COVER_HIT_FUNCTION_NAME,
	COVER_TYPE_ENUM_NAME,
} from "../src/covers-contracts.js";

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

function findFunction(
	statements: readonly Statement[],
	name: string,
): FunctionDeclaration {
	for (const statement of statements) {
		if (
			statement.kind === NodeKind.FunctionDeclaration &&
			statement.name.text === name
		) {
			return statement as FunctionDeclaration;
		}
	}

	throw new Error(`Function ${name} was not found`);
}

function getFunctionBodyStatements(
	functionDeclaration: FunctionDeclaration,
): Statement[] {
	const { body } = functionDeclaration;
	if (!body) {
		throw new Error(`Function ${functionDeclaration.name.text} has no body`);
	}

	return body.statements;
}

function countCoverDeclarations(statements: readonly Statement[]): number {
	return statements.filter(
		(statement) =>
			statement.kind === NodeKind.Expression &&
			(statement as ExpressionStatement).expression.expression.text ===
				COVER_DECLARE_FUNCTION_NAME,
	).length;
}

function withCoverageTransformOptions(
	options: Parameters<typeof setCoverageTransformOptions>[0],
	run: () => void,
): void {
	setCoverageTransformOptions(options);
	try {
		run();
	} finally {
		resetCoverageTransformOptions();
	}
}

test("injects the coverage prelude and declaration statements into user sources", () => {
	const parser = parseSource("function answer(): i32 { return 42; }");

	new CoversTransform().afterParse(parser);

	const statements = getParsedStatements(parser);
	expect(statements[0]?.name.text).toBe(COVER_TYPE_ENUM_NAME);
	expect(
		(statements[3] as ExpressionStatement).expression.expression.text,
	).toBe(COVER_DECLARE_FUNCTION_NAME);
});

test("prepends function and block cover hits inside function bodies", () => {
	const parser = parseSource("function answer(): i32 { return 42; }");

	new CoversTransform().afterParse(parser);

	const functionDeclaration = findFunction(
		getParsedStatements(parser),
		"answer",
	);
	const bodyStatements = getFunctionBodyStatements(functionDeclaration);

	expect(
		(bodyStatements[0] as ExpressionStatement).expression.expression.text,
	).toBe(COVER_HIT_FUNCTION_NAME);
	expect(
		(bodyStatements[1] as ExpressionStatement).expression.expression.text,
	).toBe(COVER_HIT_FUNCTION_NAME);
});

test("wraps return expressions with a coverage hit", () => {
	const parser = parseSource("function answer(): i32 { return 40 + 2; }");

	new CoversTransform().afterParse(parser);

	const functionDeclaration = findFunction(
		getParsedStatements(parser),
		"answer",
	);
	const bodyStatements = getFunctionBodyStatements(functionDeclaration);
	const coverHit = bodyStatements[2] as ExpressionStatement;
	const returnStatement = bodyStatements[3] as ReturnStatement;

	expect(coverHit.expression.expression.text).toBe(COVER_HIT_FUNCTION_NAME);
	expect(returnStatement.value.kind).toBe(NodeKind.Binary);
});

test("skips instrumentation for sources excluded by the configured coverage globs", () => {
	withCoverageTransformOptions(
		{
			baseDir: "/workspace",
			exclude: ["src/**/*.ts"],
		},
		() => {
			const parser = parseSource(
				"function answer(): i32 { return 42; }",
				"/workspace/src/fixture.ts",
			);

			new CoversTransform().afterParse(parser);

			const statements = getParsedStatements(parser);
			expect(statements).toHaveLength(1);
			expect(statements[0]?.kind).toBe(NodeKind.FunctionDeclaration);
		},
	);
});

test("only instruments sources that match the configured include globs", () => {
	withCoverageTransformOptions(
		{
			baseDir: "/workspace",
			include: ["src/**/*.ts"],
		},
		() => {
			const parser = parseSource(
				"function answer(): i32 { return 42; }",
				"/workspace/lib/fixture.ts",
			);

			new CoversTransform().afterParse(parser);

			const statements = getParsedStatements(parser);
			expect(statements).toHaveLength(1);
			expect(statements[0]?.kind).toBe(NodeKind.FunctionDeclaration);
		},
	);
});

test("restricts injected coverage points to the selected point types", () => {
	withCoverageTransformOptions(
		{
			pointTypes: ["function"],
		},
		() => {
			const parser = parseSource("function answer(): i32 { return 40 + 2; }");

			new CoversTransform().afterParse(parser);

			const statements = getParsedStatements(parser);
			expect(countCoverDeclarations(statements)).toBe(1);

			const functionDeclaration = findFunction(statements, "answer");
			const bodyStatements = getFunctionBodyStatements(functionDeclaration);

			expect(
				(bodyStatements[0] as ExpressionStatement).expression.expression.text,
			).toBe(COVER_HIT_FUNCTION_NAME);
			expect(bodyStatements[1]?.kind).toBe(NodeKind.Return);
			expect(bodyStatements).toHaveLength(2);
		},
	);
});
