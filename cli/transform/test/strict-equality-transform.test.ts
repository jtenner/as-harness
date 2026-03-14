import { expect, test } from "bun:test";
import { NodeKind, Parser } from "assemblyscript/dist/assemblyscript.js";
import type {
	ClassDeclaration,
	FunctionTypeNode,
	MethodDeclaration,
	NamedTypeNode,
	NamespaceDeclaration,
	Statement,
} from "assemblyscript/dist/assemblyscript.js";
import {
	ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
	STRICT_EQUALS_METHOD_NAME,
} from "../src/contracts.js";
import StrictEqualityTransform from "../src/index.js";

function parseSource(sourceText: string) {
	const parser = new Parser();
	parser.parseFile(sourceText, "fixture.ts", true);
	parser.finish();
	return parser;
}

function getParsedStatements(parser: Parser): readonly Statement[] {
	const [source] = parser.sources;
	if (!source) {
		throw new Error("Parser did not produce any sources");
	}

	return source.statements;
}

function findTopLevelClass(
	statements: readonly Statement[],
	className: string,
): ClassDeclaration {
	for (const statement of statements) {
		if (
			statement.kind === NodeKind.ClassDeclaration &&
			statement.name.text === className
		) {
			return statement as ClassDeclaration;
		}
	}

	throw new Error(`Class ${className} was not found`);
}

function findNamespace(
	statements: readonly Statement[],
	namespaceName: string,
): NamespaceDeclaration {
	for (const statement of statements) {
		if (
			statement.kind === NodeKind.NamespaceDeclaration &&
			statement.name.text === namespaceName
		) {
			return statement as NamespaceDeclaration;
		}
	}

	throw new Error(`Namespace ${namespaceName} was not found`);
}

function findMethod(
	classDeclaration: ClassDeclaration,
	methodName: string,
): MethodDeclaration {
	for (const member of classDeclaration.members) {
		if (
			member.kind === NodeKind.MethodDeclaration &&
			member.name.text === methodName
		) {
			return member as MethodDeclaration;
		}
	}

	throw new Error(`Method ${methodName} was not found`);
}

function getReturnTypeName(methodDeclaration: MethodDeclaration): string {
	const signature = methodDeclaration.signature as FunctionTypeNode;
	return (signature.returnType as NamedTypeNode).name.identifier.text;
}

test("injects both strict-equality hooks into top-level classes", () => {
	const parser = parseSource("class Example {}");

	new StrictEqualityTransform().afterParse(parser);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const memberNames = classDeclaration.members.map(
		(member) => member.name.text,
	);

	expect(memberNames).toContain(STRICT_EQUALS_METHOD_NAME);
	expect(memberNames).toContain(
		ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
	);
});

test("recurses into namespaces when instrumenting classes", () => {
	const parser = parseSource("namespace Inner { export class Example {} }");

	new StrictEqualityTransform().afterParse(parser);

	const namespaceDeclaration = findNamespace(
		getParsedStatements(parser),
		"Inner",
	);
	const classDeclaration = findTopLevelClass(
		namespaceDeclaration.members,
		"Example",
	);

	expect(
		classDeclaration.members.some(
			(member) =>
				member.kind === NodeKind.MethodDeclaration &&
				member.name.text === STRICT_EQUALS_METHOD_NAME,
		),
	).toBe(true);
	expect(
		classDeclaration.members.some(
			(member) =>
				member.kind === NodeKind.MethodDeclaration &&
				member.name.text === ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
		),
	).toBe(true);
});

test("preserves pre-existing generated hook names without duplication", () => {
	const parser = parseSource(`
class Example {
  ${STRICT_EQUALS_METHOD_NAME}(other: usize): bool {
    return other == 0;
  }
}
`);

	new StrictEqualityTransform().afterParse(parser);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const strictEqualsMembers = classDeclaration.members.filter(
		(member) =>
			member.kind === NodeKind.MethodDeclaration &&
			member.name.text === STRICT_EQUALS_METHOD_NAME,
	);
	const reflectedMembers = classDeclaration.members.filter(
		(member) =>
			member.kind === NodeKind.MethodDeclaration &&
			member.name.text === ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
	);

	expect(strictEqualsMembers).toHaveLength(1);
	expect(reflectedMembers).toHaveLength(1);
});

test("injects the current placeholder method signatures", () => {
	const parser = parseSource("class Example {}");

	new StrictEqualityTransform().afterParse(parser);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const strictEqualsMethod = findMethod(
		classDeclaration,
		STRICT_EQUALS_METHOD_NAME,
	);
	const reflectedMethod = findMethod(
		classDeclaration,
		ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
	);

	expect(strictEqualsMethod.signature.parameters).toHaveLength(1);
	expect(strictEqualsMethod.signature.parameters[0]?.name.text).toBe("other");
	expect(getReturnTypeName(strictEqualsMethod)).toBe("bool");
	expect(reflectedMethod.signature.parameters).toHaveLength(0);
	expect(getReturnTypeName(reflectedMethod)).toBe("void");
});
