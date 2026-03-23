import { Transform } from "assemblyscript/dist/transform.js";
import { Node, NodeKind, Parser } from "assemblyscript/dist/assemblyscript.js";
import type {
	BlockStatement,
	CallExpression,
	Expression,
	FunctionDeclaration,
	FunctionExpression,
	ImportStatement,
	NamespaceDeclaration,
	ParenthesizedExpression,
	PropertyAccessExpression,
	Range,
	Source,
	Statement,
	VariableDeclaration,
} from "assemblyscript/dist/assemblyscript.js";
import {
	ARTIFACT_FRAME_SOURCE_IMPORT_NAME,
	ARTIFACT_FRAME_SOURCE_RUNTIME_HELPER_NAME,
	ARTIFACT_FRAME_SOURCE_RUNTIME_IMPORT_PATH,
} from "./contracts.js";

type ArtifactFrameTransformOptions = {
	baseDir?: string;
};

type NormalizedArtifactFrameTransformOptions = {
	baseDir: string | null;
};

const DEFAULT_ARTIFACT_FRAME_TRANSFORM_OPTIONS: NormalizedArtifactFrameTransformOptions =
	{
		baseDir: null,
	};
const CALLBACK_CALL_NAMES = new Set([
	"after",
	"afterAll",
	"afterEach",
	"before",
	"beforeAll",
	"beforeEach",
	"context",
	"concurrent",
	"describe",
	"fails",
	"fdescribe",
	"fit",
	"it",
	"only",
	"sequential",
	"skip",
	"specify",
	"suite",
	"test",
	"todo",
	"xdescribe",
	"xit",
	"xtest",
]);
const ARTIFACT_CALL_NAMES = new Set(["fixture", "snapshot"]);
let activeArtifactFrameTransformOptions =
	DEFAULT_ARTIFACT_FRAME_TRANSFORM_OPTIONS;

function normalizePath(path: string): string {
	return path.replaceAll("\\", "/");
}

function normalizeArtifactFrameTransformOptions(
	options: ArtifactFrameTransformOptions | undefined,
): NormalizedArtifactFrameTransformOptions {
	if (typeof options?.baseDir !== "string" || options.baseDir.length === 0) {
		return DEFAULT_ARTIFACT_FRAME_TRANSFORM_OPTIONS;
	}

	return {
		baseDir: normalizePath(options.baseDir),
	};
}

export function setArtifactFrameTransformOptions(
	options: ArtifactFrameTransformOptions | undefined,
): void {
	activeArtifactFrameTransformOptions =
		normalizeArtifactFrameTransformOptions(options);
}

export function resetArtifactFrameTransformOptions(): void {
	activeArtifactFrameTransformOptions =
		DEFAULT_ARTIFACT_FRAME_TRANSFORM_OPTIONS;
}

function getLineAndColumn(source: Source, offset: number) {
	let line = 1;
	let column = 1;

	for (
		let index = 0;
		index < offset && index < source.text.length;
		index += 1
	) {
		const code = source.text.charCodeAt(index);
		if (code === 10) {
			line += 1;
			column = 1;
			continue;
		}

		column += 1;
	}

	return { line, column };
}

function resolveArtifactSourcePath(source: Source): string {
	const normalizedPath = normalizePath(source.normalizedPath);
	const { baseDir } = activeArtifactFrameTransformOptions;

	if (
		baseDir !== null &&
		normalizedPath.length > baseDir.length &&
		normalizedPath.startsWith(`${baseDir}/`)
	) {
		return normalizedPath.slice(baseDir.length + 1);
	}

	return normalizedPath;
}

function retargetNodeRanges(
	value: unknown,
	source: Source,
	seen: WeakSet<object> = new WeakSet(),
): void {
	if (value === null || typeof value !== "object") {
		return;
	}

	if (Array.isArray(value)) {
		for (const child of value) {
			retargetNodeRanges(child, source, seen);
		}
		return;
	}

	if (seen.has(value)) {
		return;
	}
	seen.add(value);

	if ("range" in value && value.range && typeof value.range === "object") {
		value.range.source = source;
	}

	for (const child of Object.values(value)) {
		retargetNodeRanges(child, source, seen);
	}
}

function parseStatements(snippet: string, targetSource: Source): Statement[] {
	const parser = new Parser();
	parser.parseFile(snippet, "__as_harness_artifact_frame_prelude.ts", true);
	parser.finish();

	const [source] = parser.sources;
	if (!source) {
		throw new Error("failed to create artifact-frame transform prelude");
	}

	const statements = source.statements.slice();
	for (const statement of statements) {
		retargetNodeRanges(statement, targetSource);
	}

	return statements;
}

function createArtifactFrameImportPrelude(targetSource: Source): Statement {
	const range = targetSource.range;
	return Node.createImportStatement(
		[
			Node.createImportDeclaration(
				Node.createIdentifierExpression(
					ARTIFACT_FRAME_SOURCE_RUNTIME_HELPER_NAME,
					range,
				),
				Node.createIdentifierExpression(
					ARTIFACT_FRAME_SOURCE_IMPORT_NAME,
					range,
				),
				range,
			),
		],
		Node.createStringLiteralExpression(
			ARTIFACT_FRAME_SOURCE_RUNTIME_IMPORT_PATH,
			range,
		),
		range,
	);
}

function createArtifactFrameMarkerStatement(
	sourceFile: string,
	sourceLine: number,
	sourceColumn: number,
	range: Range,
): Statement {
	const statement = parseStatements(
		`${ARTIFACT_FRAME_SOURCE_IMPORT_NAME}(${JSON.stringify(sourceFile)}, ${sourceLine}, ${sourceColumn});`,
		range.source,
	)[0];
	if (!statement) {
		throw new Error("failed to create artifact-frame marker statement");
	}

	statement.range = range;
	return statement;
}

function getCallExpressionName(expression: Expression): string | null {
	if (expression.kind === NodeKind.Identifier) {
		return expression.text;
	}

	if (expression.kind === NodeKind.PropertyAccess) {
		return (expression as PropertyAccessExpression).property.text;
	}

	return null;
}

function getFunctionDeclaration(
	expression: Expression,
): FunctionDeclaration | null {
	if (expression.kind === NodeKind.Function) {
		return (expression as FunctionExpression).declaration;
	}

	if (expression.kind === NodeKind.Parenthesized) {
		return getFunctionDeclaration(
			(expression as ParenthesizedExpression).expression,
		);
	}

	return null;
}

function instrumentFunctionDeclaration(
	declaration: FunctionDeclaration,
	sourceFile: string,
	instrumentedDeclarations: WeakSet<FunctionDeclaration>,
): boolean {
	if (!declaration.body || instrumentedDeclarations.has(declaration)) {
		return false;
	}

	const { line, column } = getLineAndColumn(
		declaration.range.source,
		declaration.range.start,
	);
	declaration.body.statements.unshift(
		createArtifactFrameMarkerStatement(
			sourceFile,
			line,
			column,
			declaration.body.range,
		),
	);
	instrumentedDeclarations.add(declaration);
	return true;
}

function shouldInstrumentCallExpression(
	callExpression: CallExpression,
): boolean {
	const name = getCallExpressionName(callExpression.expression);
	return name !== null && CALLBACK_CALL_NAMES.has(name);
}

function hasArtifactCallExpression(expression: Expression): boolean {
	if (expression.kind === NodeKind.Call) {
		const callExpression = expression as CallExpression;
		const name = getCallExpressionName(callExpression.expression);
		if (name !== null && ARTIFACT_CALL_NAMES.has(name)) {
			return true;
		}

		if (hasArtifactCallExpression(callExpression.expression)) {
			return true;
		}
		for (const argument of callExpression.args) {
			if (hasArtifactCallExpression(argument)) {
				return true;
			}
		}
		return false;
	}
	if (expression.kind === NodeKind.PropertyAccess) {
		return hasArtifactCallExpression(
			(expression as PropertyAccessExpression).expression,
		);
	}
	if (expression.kind === NodeKind.Parenthesized) {
		return hasArtifactCallExpression(
			(expression as ParenthesizedExpression).expression,
		);
	}
	if (expression.kind === NodeKind.Binary) {
		return (
			hasArtifactCallExpression(expression.left) ||
			hasArtifactCallExpression(expression.right)
		);
	}
	if (
		expression.kind === NodeKind.UnaryPrefix ||
		expression.kind === NodeKind.UnaryPostfix
	) {
		return hasArtifactCallExpression(expression.operand);
	}
	if (expression.kind === NodeKind.Ternary) {
		return (
			hasArtifactCallExpression(expression.condition) ||
			hasArtifactCallExpression(expression.ifThen) ||
			hasArtifactCallExpression(expression.ifElse)
		);
	}
	if (expression.kind === NodeKind.Assertion) {
		return hasArtifactCallExpression(expression.expression);
	}
	if (expression.kind === NodeKind.ArrayLiteral) {
		return expression.elementExpressions.some(hasArtifactCallExpression);
	}
	if (expression.kind === NodeKind.ObjectLiteral) {
		return expression.values.some(hasArtifactCallExpression);
	}
	if (expression.kind === NodeKind.New) {
		return expression.args.some(hasArtifactCallExpression);
	}
	return false;
}

function visitExpression(
	expression: Expression,
	sourceFile: string,
	instrumentedDeclarations: WeakSet<FunctionDeclaration>,
): boolean {
	let modified = false;
	if (expression.kind === NodeKind.Call) {
		const callExpression = expression as CallExpression;
		if (shouldInstrumentCallExpression(callExpression)) {
			for (const argument of callExpression.args) {
				const declaration = getFunctionDeclaration(argument);
				if (declaration === null) {
					continue;
				}

				modified =
					instrumentFunctionDeclaration(
						declaration,
						sourceFile,
						instrumentedDeclarations,
					) || modified;
			}
		}
	}

	switch (expression.kind) {
		case NodeKind.Function:
			return (
				visitFunctionDeclaration(
					(expression as FunctionExpression).declaration,
					sourceFile,
					instrumentedDeclarations,
				) || modified
			);
		case NodeKind.Binary:
			modified =
				visitExpression(
					expression.left,
					sourceFile,
					instrumentedDeclarations,
				) || modified;
			modified =
				visitExpression(
					expression.right,
					sourceFile,
					instrumentedDeclarations,
				) || modified;
			break;
		case NodeKind.Call:
			modified =
				visitExpression(
					(expression as CallExpression).expression,
					sourceFile,
					instrumentedDeclarations,
				) || modified;
			for (const argument of (expression as CallExpression).args) {
				modified =
					visitExpression(argument, sourceFile, instrumentedDeclarations) ||
					modified;
			}
			break;
		case NodeKind.PropertyAccess:
			modified =
				visitExpression(
					(expression as PropertyAccessExpression).expression,
					sourceFile,
					instrumentedDeclarations,
				) || modified;
			break;
		case NodeKind.Parenthesized:
			modified =
				visitExpression(
					(expression as ParenthesizedExpression).expression,
					sourceFile,
					instrumentedDeclarations,
				) || modified;
			break;
		case NodeKind.UnaryPrefix:
		case NodeKind.UnaryPostfix:
			modified =
				visitExpression(
					expression.operand,
					sourceFile,
					instrumentedDeclarations,
				) || modified;
			break;
		case NodeKind.Ternary:
			modified =
				visitExpression(
					expression.condition,
					sourceFile,
					instrumentedDeclarations,
				) || modified;
			modified =
				visitExpression(
					expression.ifThen,
					sourceFile,
					instrumentedDeclarations,
				) || modified;
			modified =
				visitExpression(
					expression.ifElse,
					sourceFile,
					instrumentedDeclarations,
				) || modified;
			break;
		case NodeKind.Assertion:
			modified =
				visitExpression(
					expression.expression,
					sourceFile,
					instrumentedDeclarations,
				) || modified;
			break;
		case NodeKind.ArrayLiteral:
			for (const element of expression.elementExpressions) {
				modified =
					visitExpression(element, sourceFile, instrumentedDeclarations) ||
					modified;
			}
			break;
		case NodeKind.ObjectLiteral:
			for (const value of expression.values) {
				modified =
					visitExpression(value, sourceFile, instrumentedDeclarations) ||
					modified;
			}
			break;
		case NodeKind.New:
			for (const argument of expression.args) {
				modified =
					visitExpression(argument, sourceFile, instrumentedDeclarations) ||
					modified;
			}
			break;
		default:
			break;
	}

	return modified;
}

function visitVariableDeclaration(
	declaration: VariableDeclaration,
	sourceFile: string,
	instrumentedDeclarations: WeakSet<FunctionDeclaration>,
): boolean {
	if (declaration.initializer === null) {
		return false;
	}

	return visitExpression(
		declaration.initializer,
		sourceFile,
		instrumentedDeclarations,
	);
}

function visitFunctionDeclaration(
	declaration: FunctionDeclaration,
	sourceFile: string,
	instrumentedDeclarations: WeakSet<FunctionDeclaration>,
): boolean {
	if (!declaration.body) {
		return false;
	}

	return visitStatements(
		declaration.body.statements,
		sourceFile,
		instrumentedDeclarations,
	);
}

function visitStatements(
	statements: Statement[],
	sourceFile: string,
	instrumentedDeclarations: WeakSet<FunctionDeclaration>,
): boolean {
	let modified = false;

	for (let index = 0; index < statements.length; index += 1) {
		const statement = statements[index];
		let shouldInsertArtifactMarker = false;
		if (
			statement.kind === NodeKind.Expression &&
			hasArtifactCallExpression(statement.expression)
		) {
			shouldInsertArtifactMarker = true;
		}
		if (statement.kind === NodeKind.Variable) {
			shouldInsertArtifactMarker = statement.declarations.some(
				(declaration) =>
					declaration.initializer !== null &&
					hasArtifactCallExpression(declaration.initializer),
			);
		}
		if (shouldInsertArtifactMarker) {
			const { line, column } = getLineAndColumn(
				statement.range.source,
				statement.range.start,
			);
			statements.splice(
				index,
				0,
				createArtifactFrameMarkerStatement(
					sourceFile,
					line,
					column,
					statement.range,
				),
			);
			modified = true;
			index += 1;
		}

		switch (statement.kind) {
			case NodeKind.FunctionDeclaration:
				modified =
					visitFunctionDeclaration(
						statement as FunctionDeclaration,
						sourceFile,
						instrumentedDeclarations,
					) || modified;
				break;
			case NodeKind.NamespaceDeclaration:
				modified =
					visitStatements(
						(statement as NamespaceDeclaration).members,
						sourceFile,
						instrumentedDeclarations,
					) || modified;
				break;
			case NodeKind.Block:
				modified =
					visitStatements(
						(statement as BlockStatement).statements,
						sourceFile,
						instrumentedDeclarations,
					) || modified;
				break;
			case NodeKind.If:
				modified =
					visitExpression(
						statement.condition,
						sourceFile,
						instrumentedDeclarations,
					) || modified;
				if (statement.ifTrue) {
					modified =
						visitStatements(
							[statement.ifTrue],
							sourceFile,
							instrumentedDeclarations,
						) || modified;
				}
				if (statement.ifFalse) {
					modified =
						visitStatements(
							[statement.ifFalse],
							sourceFile,
							instrumentedDeclarations,
						) || modified;
				}
				break;
			case NodeKind.Switch:
				modified =
					visitExpression(
						statement.condition,
						sourceFile,
						instrumentedDeclarations,
					) || modified;
				for (const switchCase of statement.cases) {
					if (switchCase.label) {
						modified =
							visitExpression(
								switchCase.label,
								sourceFile,
								instrumentedDeclarations,
							) || modified;
					}
					modified =
						visitStatements(
							switchCase.statements,
							sourceFile,
							instrumentedDeclarations,
						) || modified;
				}
				break;
			case NodeKind.For:
				if (statement.initializer) {
					if (statement.initializer.kind === NodeKind.Variable) {
						for (const declaration of statement.initializer.declarations) {
							modified =
								visitVariableDeclaration(
									declaration,
									sourceFile,
									instrumentedDeclarations,
								) || modified;
						}
					} else {
						modified =
							visitExpression(
								statement.initializer,
								sourceFile,
								instrumentedDeclarations,
							) || modified;
					}
				}
				if (statement.condition) {
					modified =
						visitExpression(
							statement.condition,
							sourceFile,
							instrumentedDeclarations,
						) || modified;
				}
				if (statement.incrementor) {
					modified =
						visitExpression(
							statement.incrementor,
							sourceFile,
							instrumentedDeclarations,
						) || modified;
				}
				modified =
					visitStatements(
						[statement.body],
						sourceFile,
						instrumentedDeclarations,
					) || modified;
				break;
			case NodeKind.ForOf:
				modified =
					visitExpression(
						statement.iterable,
						sourceFile,
						instrumentedDeclarations,
					) || modified;
				modified =
					visitStatements(
						[statement.body],
						sourceFile,
						instrumentedDeclarations,
					) || modified;
				break;
			case NodeKind.While:
			case NodeKind.Do:
				modified =
					visitExpression(
						statement.condition,
						sourceFile,
						instrumentedDeclarations,
					) || modified;
				modified =
					visitStatements(
						[statement.body],
						sourceFile,
						instrumentedDeclarations,
					) || modified;
				break;
			case NodeKind.Return:
				if (statement.value) {
					modified =
						visitExpression(
							statement.value,
							sourceFile,
							instrumentedDeclarations,
						) || modified;
				}
				break;
			case NodeKind.Throw:
				modified =
					visitExpression(
						statement.value,
						sourceFile,
						instrumentedDeclarations,
					) || modified;
				break;
			case NodeKind.Expression:
				modified =
					visitExpression(
						statement.expression,
						sourceFile,
						instrumentedDeclarations,
					) || modified;
				break;
			case NodeKind.Variable:
				for (const declaration of statement.declarations) {
					modified =
						visitVariableDeclaration(
							declaration,
							sourceFile,
							instrumentedDeclarations,
						) || modified;
				}
				break;
			default:
				break;
		}
	}

	return modified;
}

function hasArtifactFramePreludeImport(
	statements: readonly Statement[],
): boolean {
	return statements.some(
		(statement) =>
			statement.kind === NodeKind.Import &&
			((statement as ImportStatement).externalPath || "") ===
				ARTIFACT_FRAME_SOURCE_RUNTIME_IMPORT_PATH,
	);
}

export default class ArtifactFrameTransform extends Transform {
	afterParse(parser: Parser): void {
		for (const source of parser.sources) {
			if (source.isLibrary) {
				continue;
			}

			const sourceFile = resolveArtifactSourcePath(source);
			const instrumentedDeclarations = new WeakSet<FunctionDeclaration>();
			const modified = visitStatements(
				source.statements,
				sourceFile,
				instrumentedDeclarations,
			);
			if (modified && !hasArtifactFramePreludeImport(source.statements)) {
				source.statements.unshift(createArtifactFrameImportPrelude(source));
			}
		}
	}
}
