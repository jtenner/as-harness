import { Transform } from "assemblyscript/dist/transform.js";
import {
	CommonFlags,
	NodeKind,
	Parser,
} from "assemblyscript/dist/assemblyscript.js";
import type {
	BlockStatement,
	ClassDeclaration,
	ClassExpression,
	Expression,
	FunctionDeclaration,
	FunctionExpression,
	MethodDeclaration,
	NamespaceDeclaration,
	Range,
	Source,
	Statement,
	SwitchCase,
	VariableDeclaration,
} from "assemblyscript/dist/assemblyscript.js";
import {
	COVER_DECLARE_FUNCTION_NAME,
	COVER_HIT_FUNCTION_NAME,
	COVER_TYPE_ENUM_NAME,
} from "./covers-contracts.js";

type CoverPointType = 1 | 2 | 3;

type CoverPoint = {
	id: number;
	file: string;
	line: number;
	column: number;
	coverType: CoverPointType;
};

export type CoverageTransformPointTypeName =
	| "function"
	| "block"
	| "expression";

export type CoverageTransformOptions = {
	baseDir?: string;
	include?: string[];
	exclude?: string[];
	pointTypes?: CoverageTransformPointTypeName[];
};

type NormalizedCoverageTransformOptions = {
	baseDir: string | null;
	include: string[];
	exclude: string[];
	functions: boolean;
	blocks: boolean;
	expressions: boolean;
};

const COVER_TYPE_FUNCTION = 1;
const COVER_TYPE_BLOCK = 2;
const COVER_TYPE_EXPRESSION = 3;
const DEFAULT_COVERAGE_TRANSFORM_OPTIONS: NormalizedCoverageTransformOptions = {
	baseDir: null,
	include: [],
	exclude: [],
	functions: true,
	blocks: true,
	expressions: true,
};
let activeCoverageTransformOptions = DEFAULT_COVERAGE_TRANSFORM_OPTIONS;
const globPatternCache = new Map<string, RegExp>();

function normalizeCoverFilePath(path: string): string {
	return path.replaceAll("\\", "/");
}

function escapeRegExp(value: string): string {
	return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function compileGlobPattern(pattern: string): RegExp {
	const cached = globPatternCache.get(pattern);
	if (cached) {
		return cached;
	}

	let source = "^";
	for (let index = 0; index < pattern.length; index += 1) {
		const character = pattern[index];
		if (character === "*") {
			if (pattern[index + 1] === "*") {
				index += 1;
				if (pattern[index + 1] === "/") {
					index += 1;
					source += "(?:.*/)?";
				} else {
					source += ".*";
				}
				continue;
			}

			source += "[^/]*";
			continue;
		}

		if (character === "?") {
			source += "[^/]";
			continue;
		}

		if (character === "{") {
			const closingIndex = pattern.indexOf("}", index + 1);
			if (closingIndex > index + 1) {
				const alternatives = pattern
					.slice(index + 1, closingIndex)
					.split(",")
					.map((alternative) => escapeRegExp(alternative));
				source += `(?:${alternatives.join("|")})`;
				index = closingIndex;
				continue;
			}
		}

		source += escapeRegExp(character);
	}

	source += "$";
	const compiled = new RegExp(source);
	globPatternCache.set(pattern, compiled);
	return compiled;
}

function normalizeGlobPattern(pattern: string): string {
	const normalizedPattern = normalizeCoverFilePath(pattern);
	return normalizedPattern.startsWith("./")
		? normalizedPattern.slice(2)
		: normalizedPattern;
}

function matchesGlobPattern(path: string, pattern: string): boolean {
	return compileGlobPattern(pattern).test(path);
}

function normalizeCoverageTransformOptions(
	options: CoverageTransformOptions | undefined,
): NormalizedCoverageTransformOptions {
	const pointTypes = new Set(options?.pointTypes ?? []);
	const normalizedBaseDir =
		typeof options?.baseDir === "string" && options.baseDir.length > 0
			? normalizeCoverFilePath(options.baseDir)
			: null;

	return {
		baseDir: normalizedBaseDir,
		include: (options?.include ?? []).map(normalizeGlobPattern),
		exclude: (options?.exclude ?? []).map(normalizeGlobPattern),
		functions: pointTypes.size === 0 || pointTypes.has("function"),
		blocks: pointTypes.size === 0 || pointTypes.has("block"),
		expressions: pointTypes.size === 0 || pointTypes.has("expression"),
	};
}

export function setCoverageTransformOptions(
	options: CoverageTransformOptions | undefined,
): void {
	activeCoverageTransformOptions = normalizeCoverageTransformOptions(options);
}

export function resetCoverageTransformOptions(): void {
	activeCoverageTransformOptions = DEFAULT_COVERAGE_TRANSFORM_OPTIONS;
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

function createPointID(
	file: string,
	line: number,
	column: number,
	coverType: number,
) {
	const input = `${file}~${line}~${column}~${coverType}`;
	let hash = 5381;

	for (let index = 0; index < input.length; index += 1) {
		hash = (((hash << 5) + hash) ^ input.charCodeAt(index)) >>> 0;
	}

	return hash >>> 0;
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

function createCoverPoint(
	source: Source,
	range: Range,
	coverType: CoverPointType,
): CoverPoint {
	const file = normalizeCoverFilePath(source.normalizedPath);
	const { line, column } = getLineAndColumn(source, range.start);

	return {
		id: createPointID(file, line, column, coverType),
		file,
		line,
		column,
		coverType,
	};
}

function resolveCoverPathCandidates(source: Source): string[] {
	const normalizedPath = normalizeCoverFilePath(source.normalizedPath);
	const candidates = new Set([normalizedPath]);
	const { baseDir } = activeCoverageTransformOptions;

	if (
		baseDir &&
		normalizedPath.length > baseDir.length &&
		normalizedPath.startsWith(`${baseDir}/`)
	) {
		candidates.add(normalizedPath.slice(baseDir.length + 1));
	}

	return [...candidates];
}

function shouldInstrumentSource(source: Source): boolean {
	const candidates = resolveCoverPathCandidates(source);
	const { exclude, include } = activeCoverageTransformOptions;

	if (
		exclude.some((pattern) =>
			candidates.some((candidate) => matchesGlobPattern(candidate, pattern)),
		)
	) {
		return false;
	}

	if (include.length === 0) {
		return true;
	}

	return include.some((pattern) =>
		candidates.some((candidate) => matchesGlobPattern(candidate, pattern)),
	);
}

function parseStatements(snippet: string, targetSource: Source): Statement[] {
	const parser = new Parser();
	parser.parseFile(snippet, "__as_harness_covers_prelude.ts", true);
	parser.finish();

	const [source] = parser.sources;
	if (!source) {
		throw new Error("failed to create coverage prelude");
	}

	const statements = source.statements.slice();
	for (const statement of statements) {
		retargetNodeRanges(statement, targetSource);
	}

	return statements;
}

function createCoveragePrelude(targetSource: Source): Statement[] {
	return parseStatements(
		[
			`enum ${COVER_TYPE_ENUM_NAME} {`,
			"\tFunction = 1,",
			"\tBlock = 2,",
			"\tExpression = 3,",
			"}",
			"",
			'@external("__asCovers", "coverDeclare")',
			`declare function ${COVER_DECLARE_FUNCTION_NAME}(file: string, id: u32, line: i32, column: i32, coverType: ${COVER_TYPE_ENUM_NAME}): void;`,
			"",
			'@external("__asCovers", "cover")',
			`declare function ${COVER_HIT_FUNCTION_NAME}(id: u32): void;`,
			"",
		].join("\n"),
		targetSource,
	);
}

function coverTypeExpression(coverType: CoverPointType): string {
	if (coverType === COVER_TYPE_FUNCTION) {
		return `${COVER_TYPE_ENUM_NAME}.Function`;
	}

	if (coverType === COVER_TYPE_BLOCK) {
		return `${COVER_TYPE_ENUM_NAME}.Block`;
	}

	return `${COVER_TYPE_ENUM_NAME}.Expression`;
}

function createCoverDeclareStatement(
	point: CoverPoint,
	range: Range,
): Statement {
	const statement = parseStatements(
		`${COVER_DECLARE_FUNCTION_NAME}(${JSON.stringify(point.file)}, ${point.id}, ${point.line}, ${point.column}, ${coverTypeExpression(point.coverType)});`,
		range.source,
	)[0];
	if (!statement) {
		throw new Error("failed to create coverage declaration statement");
	}
	statement.range = range;
	return statement;
}

function createCoverHitStatement(point: CoverPoint, range: Range): Statement {
	const statement = parseStatements(
		`${COVER_HIT_FUNCTION_NAME}(${point.id});`,
		range.source,
	)[0];
	if (!statement) {
		throw new Error("failed to create coverage hit statement");
	}
	statement.range = range;
	return statement;
}

function instrumentExpression(
	expression: Expression,
	source: Source,
	declarations: CoverPoint[],
): void {
	switch (expression.kind) {
		case NodeKind.FunctionExpression:
			instrumentFunctionLike(
				(expression as FunctionExpression).declaration,
				source,
				declarations,
			);
			return;
		case NodeKind.ClassExpression:
			instrumentClassExpression(
				(expression as ClassExpression).declaration,
				source,
				declarations,
			);
			return;
		case NodeKind.Binary:
			instrumentExpression(expression.left, source, declarations);
			instrumentExpression(expression.right, source, declarations);
			break;
		case NodeKind.Call:
			instrumentExpression(expression.expression, source, declarations);
			for (const argument of expression.args) {
				instrumentExpression(argument, source, declarations);
			}
			break;
		case NodeKind.PropertyAccess:
			instrumentExpression(expression.expression, source, declarations);
			break;
		case NodeKind.ElementAccess:
			instrumentExpression(expression.expression, source, declarations);
			instrumentExpression(expression.elementExpression, source, declarations);
			break;
		case NodeKind.Parenthesized:
			instrumentExpression(expression.expression, source, declarations);
			break;
		case NodeKind.UnaryPrefix:
		case NodeKind.UnaryPostfix:
			instrumentExpression(expression.operand, source, declarations);
			break;
		case NodeKind.Ternary:
			instrumentExpression(expression.condition, source, declarations);
			instrumentExpression(expression.ifThen, source, declarations);
			instrumentExpression(expression.ifElse, source, declarations);
			break;
		case NodeKind.Assertion:
			instrumentExpression(expression.expression, source, declarations);
			break;
		case NodeKind.ArrayLiteral:
			for (const element of expression.elementExpressions) {
				instrumentExpression(element, source, declarations);
			}
			break;
		case NodeKind.ObjectLiteral:
			for (const value of expression.values) {
				instrumentExpression(value, source, declarations);
			}
			break;
		case NodeKind.New:
			for (const argument of expression.args) {
				instrumentExpression(argument, source, declarations);
			}
			break;
		default:
			break;
	}
}

function instrumentVariableDeclaration(
	declaration: VariableDeclaration,
	source: Source,
	declarations: CoverPoint[],
): void {
	if (declaration.initializer) {
		instrumentExpression(declaration.initializer, source, declarations);
	}
}

function instrumentSwitchCase(
	switchCase: SwitchCase,
	source: Source,
	declarations: CoverPoint[],
): void {
	if (switchCase.label) {
		instrumentExpression(switchCase.label, source, declarations);
	}

	visitStatements(switchCase.statements, source, declarations);
}

function instrumentBlock(
	block: BlockStatement,
	source: Source,
	declarations: CoverPoint[],
	functionPoint: CoverPoint | null = null,
): void {
	const blockPoint = activeCoverageTransformOptions.blocks
		? createCoverPoint(source, block.range, COVER_TYPE_BLOCK)
		: null;
	if (blockPoint) {
		declarations.push(blockPoint);
	}
	visitStatements(block.statements, source, declarations);

	const prologue: Statement[] = [];
	if (functionPoint) {
		prologue.push(createCoverHitStatement(functionPoint, block.range));
	}
	if (blockPoint) {
		prologue.push(createCoverHitStatement(blockPoint, block.range));
	}
	block.statements.unshift(...prologue);
}

function instrumentFunctionLike(
	declaration: FunctionDeclaration | FunctionExpression | MethodDeclaration,
	source: Source,
	declarations: CoverPoint[],
): void {
	if (
		(declaration.flags & CommonFlags.Ambient) !== 0 ||
		declaration.body === null
	) {
		return;
	}

	const point = activeCoverageTransformOptions.functions
		? createCoverPoint(source, declaration.range, COVER_TYPE_FUNCTION)
		: null;
	if (point) {
		declarations.push(point);
	}
	instrumentBlock(
		declaration.body as BlockStatement,
		source,
		declarations,
		point,
	);
}

function instrumentClassDeclaration(
	classDeclaration: ClassDeclaration,
	source: Source,
	declarations: CoverPoint[],
): void {
	for (const member of classDeclaration.members) {
		if (member.kind === NodeKind.MethodDeclaration) {
			instrumentFunctionLike(member as MethodDeclaration, source, declarations);
		}
	}
}

function instrumentClassExpression(
	classExpression: ClassDeclaration,
	source: Source,
	declarations: CoverPoint[],
): void {
	for (const member of classExpression.members) {
		if (member.kind === NodeKind.MethodDeclaration) {
			instrumentFunctionLike(member as MethodDeclaration, source, declarations);
		}
	}
}

function visitStatements(
	statements: Statement[],
	source: Source,
	declarations: CoverPoint[],
): void {
	const instrumentedStatements: Statement[] = [];

	for (const statement of statements) {
		switch (statement.kind) {
			case NodeKind.FunctionDeclaration:
				instrumentFunctionLike(
					statement as FunctionDeclaration,
					source,
					declarations,
				);
				instrumentedStatements.push(statement);
				break;
			case NodeKind.ClassDeclaration:
				instrumentClassDeclaration(
					statement as ClassDeclaration,
					source,
					declarations,
				);
				instrumentedStatements.push(statement);
				break;
			case NodeKind.NamespaceDeclaration:
				visitStatements(
					(statement as NamespaceDeclaration).members,
					source,
					declarations,
				);
				instrumentedStatements.push(statement);
				break;
			case NodeKind.Block:
				instrumentBlock(statement as BlockStatement, source, declarations);
				instrumentedStatements.push(statement);
				break;
			case NodeKind.If: {
				instrumentExpression(statement.condition, source, declarations);
				if (activeCoverageTransformOptions.expressions) {
					const point = createCoverPoint(
						source,
						statement.condition.range,
						COVER_TYPE_EXPRESSION,
					);
					declarations.push(point);
					instrumentedStatements.push(
						createCoverHitStatement(point, statement.range),
					);
				}
				if (statement.ifTrue) {
					visitStatements([statement.ifTrue], source, declarations);
				}
				if (statement.ifFalse) {
					visitStatements([statement.ifFalse], source, declarations);
				}
				instrumentedStatements.push(statement);
				break;
			}
			case NodeKind.Switch: {
				instrumentExpression(statement.condition, source, declarations);
				if (activeCoverageTransformOptions.expressions) {
					const point = createCoverPoint(
						source,
						statement.condition.range,
						COVER_TYPE_EXPRESSION,
					);
					declarations.push(point);
					instrumentedStatements.push(
						createCoverHitStatement(point, statement.range),
					);
				}
				for (const switchCase of statement.cases) {
					instrumentSwitchCase(switchCase, source, declarations);
				}
				instrumentedStatements.push(statement);
				break;
			}
			case NodeKind.For: {
				if (statement.initializer) {
					if (statement.initializer.kind === NodeKind.Variable) {
						for (const declaration of statement.initializer.declarations) {
							instrumentVariableDeclaration(declaration, source, declarations);
						}
					} else {
						instrumentExpression(statement.initializer, source, declarations);
					}
				}
				if (statement.condition) {
					instrumentExpression(statement.condition, source, declarations);
				}
				if (statement.incrementor) {
					instrumentExpression(statement.incrementor, source, declarations);
				}
				if (activeCoverageTransformOptions.expressions) {
					const point = createCoverPoint(
						source,
						statement.range,
						COVER_TYPE_EXPRESSION,
					);
					declarations.push(point);
					instrumentedStatements.push(
						createCoverHitStatement(point, statement.range),
					);
				}
				visitStatements([statement.body], source, declarations);
				instrumentedStatements.push(statement);
				break;
			}
			case NodeKind.ForOf: {
				instrumentExpression(statement.iterable, source, declarations);
				if (activeCoverageTransformOptions.expressions) {
					const point = createCoverPoint(
						source,
						statement.iterable.range,
						COVER_TYPE_EXPRESSION,
					);
					declarations.push(point);
					instrumentedStatements.push(
						createCoverHitStatement(point, statement.range),
					);
				}
				visitStatements([statement.body], source, declarations);
				instrumentedStatements.push(statement);
				break;
			}
			case NodeKind.While:
			case NodeKind.Do: {
				instrumentExpression(statement.condition, source, declarations);
				if (activeCoverageTransformOptions.expressions) {
					const point = createCoverPoint(
						source,
						statement.condition.range,
						COVER_TYPE_EXPRESSION,
					);
					declarations.push(point);
					instrumentedStatements.push(
						createCoverHitStatement(point, statement.range),
					);
				}
				visitStatements([statement.body], source, declarations);
				instrumentedStatements.push(statement);
				break;
			}
			case NodeKind.Return: {
				if (statement.value) {
					instrumentExpression(statement.value, source, declarations);
					if (activeCoverageTransformOptions.expressions) {
						const point = createCoverPoint(
							source,
							statement.value.range,
							COVER_TYPE_EXPRESSION,
						);
						declarations.push(point);
						instrumentedStatements.push(
							createCoverHitStatement(point, statement.range),
						);
					}
				}
				instrumentedStatements.push(statement);
				break;
			}
			case NodeKind.Throw: {
				instrumentExpression(statement.value, source, declarations);
				if (activeCoverageTransformOptions.expressions) {
					const point = createCoverPoint(
						source,
						statement.value.range,
						COVER_TYPE_EXPRESSION,
					);
					declarations.push(point);
					instrumentedStatements.push(
						createCoverHitStatement(point, statement.range),
					);
				}
				instrumentedStatements.push(statement);
				break;
			}
			case NodeKind.Expression: {
				instrumentExpression(statement.expression, source, declarations);
				if (activeCoverageTransformOptions.expressions) {
					const point = createCoverPoint(
						source,
						statement.expression.range,
						COVER_TYPE_EXPRESSION,
					);
					declarations.push(point);
					instrumentedStatements.push(
						createCoverHitStatement(point, statement.range),
					);
				}
				instrumentedStatements.push(statement);
				break;
			}
			case NodeKind.Variable: {
				let hasInitializer = false;
				for (const declaration of statement.declarations) {
					instrumentVariableDeclaration(declaration, source, declarations);
					hasInitializer = hasInitializer || declaration.initializer !== null;
				}
				if (hasInitializer && activeCoverageTransformOptions.expressions) {
					const point = createCoverPoint(
						source,
						statement.range,
						COVER_TYPE_EXPRESSION,
					);
					declarations.push(point);
					instrumentedStatements.push(
						createCoverHitStatement(point, statement.range),
					);
				}
				instrumentedStatements.push(statement);
				break;
			}
			default:
				instrumentedStatements.push(statement);
				break;
		}
	}

	statements.splice(0, statements.length, ...instrumentedStatements);
}

export default class CoversTransform extends Transform {
	afterParse(parser: Parser): void {
		for (const source of parser.sources) {
			if (source.isLibrary || !shouldInstrumentSource(source)) {
				continue;
			}

			const declarations: CoverPoint[] = [];
			visitStatements(source.statements, source, declarations);
			if (declarations.length === 0) {
				continue;
			}

			const insertionIndex = 0;
			const injectedStatements = declarations.map((point) =>
				createCoverDeclareStatement(point, source.range.atStart),
			);
			source.statements.splice(
				insertionIndex,
				0,
				...createCoveragePrelude(source),
				...injectedStatements,
			);
		}
	}
}
