import { expect, test } from "bun:test";
import { NodeKind, Parser, Token } from "assemblyscript/dist/assemblyscript.js";
import type {
	BinaryExpression,
	BlockStatement,
	CallExpression,
	ClassDeclaration,
	ExpressionStatement,
	FunctionTypeNode,
	IfStatement,
	MethodDeclaration,
	NamedTypeNode,
	NamespaceDeclaration,
	PropertyAccessExpression,
	Statement,
	SuperExpression,
	UnaryPrefixExpression,
} from "assemblyscript/dist/assemblyscript.js";
import {
	ADD_REFLECTED_VALUE_KEY_VALUE_PAIR_HELPER_NAME,
	ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
	STRICT_EQUALS_ARRAY_BUFFER_MEMBER_HELPER_NAME,
	STRICT_EQUALS_ARRAY_BUFFER_VIEW_MEMBER_HELPER_NAME,
	STRICT_EQUALS_MAP_MEMBER_HELPER_NAME,
	STRICT_EQUALS_SET_MEMBER_HELPER_NAME,
	STRICT_EQUALS_MANAGED_CLASS_MEMBER_HELPER_NAME,
	STRICT_EQUALS_MEMBER_HELPER_NAME,
	STRICT_EQUALS_RUNTIME_TYPE_HELPER_NAME,
	STRICT_EQUALS_METHOD_NAME,
} from "../src/contracts.js";
import { createParticipatingMemberHash } from "../src/hash.js";
import StrictEqualityTransform from "../src/index.js";
import { getParticipatingInstanceMembers } from "../src/memberSelection.js";

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

function getMethodBodyStatements(
	methodDeclaration: MethodDeclaration,
): readonly Statement[] {
	const body = methodDeclaration.body as BlockStatement | null;
	if (!body) {
		throw new Error(
			`Method ${methodDeclaration.name.text} does not have a body`,
		);
	}

	return body.statements;
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

test("does not auto-instrument unmanaged classes", () => {
	const parser = parseSource("@unmanaged class Example {}");

	new StrictEqualityTransform().afterParse(parser);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const memberNames = classDeclaration.members.map(
		(member) => member.name.text,
	);

	expect(memberNames).not.toContain(STRICT_EQUALS_METHOD_NAME);
	expect(memberNames).not.toContain(
		ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
	);
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

test("selects instance fields and getters while excluding static members and non-getter methods", () => {
	const parser = parseSource(`
class Example {
  count: i32;
  readonly label: string = "ready";
  static skippedCount: i32;

  get size(): i32 {
    return this.count;
  }

  set size(value: i32) {
    this.count = value;
  }

  helper(): i32 {
    return this.count;
  }

  static helperStatic(): i32 {
    return 0;
  }
}
`);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const participatingMembers =
		getParticipatingInstanceMembers(classDeclaration);

	expect(participatingMembers.map((member) => member.name)).toEqual([
		"count",
		"label",
		"size",
	]);
	expect(participatingMembers.map((member) => member.kind)).toEqual([
		"field",
		"field",
		"getter",
	]);
	expect(participatingMembers.map((member) => member.hash)).toEqual([
		createParticipatingMemberHash("field", "count"),
		createParticipatingMemberHash("field", "label"),
		createParticipatingMemberHash("getter", "size"),
	]);
	expect(
		participatingMembers.map(
			(member) => member.strictEqualityComparisonStrategy,
		),
	).toEqual(["value", "value", "value"]);
});

test("injects hooks into generic classes without dropping the class generic context", () => {
	const parser = parseSource(`
class Box<T> {
  value: T;
}
`);

	new StrictEqualityTransform().afterParse(parser);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Box",
	);
	const strictEqualsMethod = findMethod(
		classDeclaration,
		STRICT_EQUALS_METHOD_NAME,
	);
	const reflectedMethod = findMethod(
		classDeclaration,
		ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
	);

	expect(
		classDeclaration.typeParameters?.map((parameter) => parameter.name.text),
	).toEqual(["T"]);
	expect(strictEqualsMethod.name.text).toBe(STRICT_EQUALS_METHOD_NAME);
	expect(reflectedMethod.name.text).toBe(
		ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
	);
});

test("keeps participating-member selection scoped to each class across inheritance", () => {
	const parser = parseSource(`
class Base {
  baseField: i32;

  get shared(): i32 {
    return this.baseField;
  }
}

class Derived extends Base {
  derivedField: i32;

  get shared(): i32 {
    return this.derivedField;
  }
}
`);

	const statements = getParsedStatements(parser);
	const baseClass = findTopLevelClass(statements, "Base");
	const derivedClass = findTopLevelClass(statements, "Derived");
	const baseMembers = getParticipatingInstanceMembers(baseClass);
	const derivedMembers = getParticipatingInstanceMembers(derivedClass);

	expect(baseMembers.map((member) => member.hash)).toEqual([
		createParticipatingMemberHash("field", "baseField"),
		createParticipatingMemberHash("getter", "shared"),
	]);
	expect(derivedMembers.map((member) => member.hash)).toEqual([
		createParticipatingMemberHash("field", "derivedField"),
		createParticipatingMemberHash("getter", "shared"),
	]);
});

test("marks known class-typed members for managed-class helper delegation", () => {
	const parser = parseSource(`
class Child {}

class Box<T> {
  child: Child | null;
  nested: Box<T> | null;
  value: T;
  items: Array<Child>;

  get alias(): Child | null {
    return this.child;
  }
}
`);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Box",
	);
	const participatingMembers = getParticipatingInstanceMembers(
		classDeclaration,
		new Set(["Child", "Box"]),
	);

	expect(
		participatingMembers.map(
			(member) => member.strictEqualityComparisonStrategy,
		),
	).toEqual(["managedClass", "managedClass", "value", "value", "managedClass"]);
});

test("does not mark unmanaged class-typed members for managed-class helper delegation", () => {
	const parser = parseSource(`
@unmanaged class Child {}

class Box {
  child: Child | null;

  get alias(): Child | null {
    return this.child;
  }
}
`);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Box",
	);
	const participatingMembers = getParticipatingInstanceMembers(
		classDeclaration,
		new Set(["Box"]),
	);

	expect(
		participatingMembers.map(
			(member) => member.strictEqualityComparisonStrategy,
		),
	).toEqual(["value", "value"]);
});

test("marks ArrayBuffer-typed members for dedicated buffer helper delegation", () => {
	const parser = parseSource(`
class Example {
  buffer: ArrayBuffer;

  get alias(): ArrayBuffer {
    return this.buffer;
  }
}
`);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const participatingMembers =
		getParticipatingInstanceMembers(classDeclaration);

	expect(
		participatingMembers.map(
			(member) => member.strictEqualityComparisonStrategy,
		),
	).toEqual(["arrayBuffer", "arrayBuffer"]);
});

test("marks typed-array and DataView members for dedicated view helper delegation", () => {
	const parser = parseSource(`
class Example {
  bytes: Uint8Array;
  view: DataView;

  get alias(): Uint8Array {
    return this.bytes;
  }
}
`);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const participatingMembers =
		getParticipatingInstanceMembers(classDeclaration);

	expect(
		participatingMembers.map(
			(member) => member.strictEqualityComparisonStrategy,
		),
	).toEqual(["arrayBufferView", "arrayBufferView", "arrayBufferView"]);
});

test("marks Set-typed members for dedicated set helper delegation", () => {
	const parser = parseSource(`
class Example {
  values: Set<i32>;

  get alias(): Set<i32> {
    return this.values;
  }
}
`);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const participatingMembers =
		getParticipatingInstanceMembers(classDeclaration);

	expect(
		participatingMembers.map(
			(member) => member.strictEqualityComparisonStrategy,
		),
	).toEqual(["set", "set"]);
});

test("marks Map-typed members for dedicated map helper delegation", () => {
	const parser = parseSource(`
class Example {
  values: Map<string, i32>;

  get alias(): Map<string, i32> {
    return this.values;
  }
}
`);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const participatingMembers =
		getParticipatingInstanceMembers(classDeclaration);

	expect(
		participatingMembers.map(
			(member) => member.strictEqualityComparisonStrategy,
		),
	).toEqual(["map", "map"]);
});

test("delegates into super from generated strict-equality hooks on derived classes", () => {
	const parser = parseSource(`
class Base {}
class Derived extends Base {}
`);

	new StrictEqualityTransform().afterParse(parser);

	const derivedClass = findTopLevelClass(
		getParsedStatements(parser),
		"Derived",
	);
	const strictEqualsMethod = findMethod(
		derivedClass,
		STRICT_EQUALS_METHOD_NAME,
	);
	const bodyStatements = getMethodBodyStatements(strictEqualsMethod);
	const superCheckStatement = bodyStatements[2] as IfStatement;
	const condition = superCheckStatement.condition as UnaryPrefixExpression;
	const superCall = condition.operand as CallExpression;
	const superAccess = superCall.expression as PropertyAccessExpression;

	expect(superCheckStatement.kind).toBe(NodeKind.If);
	expect(condition.operator).toBe(Token.Exclamation);
	expect((superAccess.expression as SuperExpression).kind).toBe(NodeKind.Super);
	expect(superAccess.property.text).toBe(STRICT_EQUALS_METHOD_NAME);
	expect(superCall.args).toHaveLength(1);
	expect(superCall.args[0]?.kind).toBe(NodeKind.Identifier);
});

test("delegates into super from generated reflection hooks on derived classes", () => {
	const parser = parseSource(`
class Base {}
class Derived extends Base {}
`);

	new StrictEqualityTransform().afterParse(parser);

	const derivedClass = findTopLevelClass(
		getParsedStatements(parser),
		"Derived",
	);
	const reflectedMethod = findMethod(
		derivedClass,
		ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
	);
	const [firstStatement] = getMethodBodyStatements(reflectedMethod);
	const expressionStatement = firstStatement as ExpressionStatement;
	const superCall = expressionStatement.expression as CallExpression;
	const superAccess = superCall.expression as PropertyAccessExpression;

	expect(expressionStatement.kind).toBe(NodeKind.Expression);
	expect((superAccess.expression as SuperExpression).kind).toBe(NodeKind.Super);
	expect(superAccess.property.text).toBe(
		ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
	);
	expect(superCall.args).toHaveLength(0);
});

test("emits per-member strict-equality helper checks for participating fields and getters", () => {
	const parser = parseSource(`
class Example {
  count: i32;

  get size(): i32 {
    return this.count;
  }
}
`);

	new StrictEqualityTransform().afterParse(parser);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const strictEqualsMethod = findMethod(
		classDeclaration,
		STRICT_EQUALS_METHOD_NAME,
	);
	const bodyStatements = getMethodBodyStatements(strictEqualsMethod);

	expect(bodyStatements).toHaveLength(5);

	const identityCheck = bodyStatements[0] as IfStatement;
	const typeCheck = bodyStatements[1] as IfStatement;
	const countCheck = bodyStatements[2] as IfStatement;
	const sizeCheck = bodyStatements[3] as IfStatement;
	const identityCondition = identityCheck.condition as BinaryExpression;
	const countCondition = countCheck.condition as UnaryPrefixExpression;
	const sizeCondition = sizeCheck.condition as UnaryPrefixExpression;
	const typeCondition = typeCheck.condition as UnaryPrefixExpression;
	const typeCall = typeCondition.operand as CallExpression;
	const countCall = countCondition.operand as CallExpression;
	const sizeCall = sizeCondition.operand as CallExpression;
	const countMemberAccess = countCall.args[1] as PropertyAccessExpression;
	const sizeMemberAccess = sizeCall.args[1] as PropertyAccessExpression;
	const countOtherMemberAccess = countCall.args[2] as PropertyAccessExpression;
	const sizeOtherMemberAccess = sizeCall.args[2] as PropertyAccessExpression;

	expect(identityCheck.kind).toBe(NodeKind.If);
	expect(identityCondition.kind).toBe(NodeKind.Binary);
	expect(typeCondition.operator).toBe(Token.Exclamation);
	expect(countCall.expression.kind).toBe(NodeKind.Identifier);
	expect(sizeCall.expression.kind).toBe(NodeKind.Identifier);
	expect(typeCall.expression.kind).toBe(NodeKind.Identifier);
	expect(typeCall.expression.text).toBe(STRICT_EQUALS_RUNTIME_TYPE_HELPER_NAME);
	expect(countCall.expression.text).toBe(STRICT_EQUALS_MEMBER_HELPER_NAME);
	expect(sizeCall.expression.text).toBe(STRICT_EQUALS_MEMBER_HELPER_NAME);
	expect(countCall.args).toHaveLength(3);
	expect(sizeCall.args).toHaveLength(3);
	expect(typeCall.args).toHaveLength(2);
	expect(countCondition.operator).toBe(Token.Exclamation);
	expect(sizeCondition.operator).toBe(Token.Exclamation);
	expect((countCall.args[0] as { value: string }).value).toBe("field:count");
	expect((sizeCall.args[0] as { value: string }).value).toBe("getter:size");
	expect(countMemberAccess.expression.kind).toBe(NodeKind.This);
	expect(sizeMemberAccess.expression.kind).toBe(NodeKind.This);
	expect(countOtherMemberAccess.expression.kind).toBe(NodeKind.Call);
	expect(sizeOtherMemberAccess.expression.kind).toBe(NodeKind.Call);
	expect(countMemberAccess.property.text).toBe("count");
	expect(sizeMemberAccess.property.text).toBe("size");
	expect(countOtherMemberAccess.property.text).toBe("count");
	expect(sizeOtherMemberAccess.property.text).toBe("size");
	expect(bodyStatements[4]?.kind).toBe(NodeKind.Return);
});

test("emits managed-class helper checks for participating class-typed members", () => {
	const parser = parseSource(`
class Child {}

class Example {
  child: Child | null;

  get alias(): Child | null {
    return this.child;
  }
}
`);

	new StrictEqualityTransform().afterParse(parser);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const strictEqualsMethod = findMethod(
		classDeclaration,
		STRICT_EQUALS_METHOD_NAME,
	);
	const bodyStatements = getMethodBodyStatements(strictEqualsMethod);
	const childCheck = bodyStatements[2] as IfStatement;
	const aliasCheck = bodyStatements[3] as IfStatement;
	const childCall = (childCheck.condition as UnaryPrefixExpression)
		.operand as CallExpression;
	const aliasCall = (aliasCheck.condition as UnaryPrefixExpression)
		.operand as CallExpression;

	expect(childCall.expression.kind).toBe(NodeKind.Identifier);
	expect(aliasCall.expression.kind).toBe(NodeKind.Identifier);
	expect(childCall.expression.text).toBe(
		STRICT_EQUALS_MANAGED_CLASS_MEMBER_HELPER_NAME,
	);
	expect(aliasCall.expression.text).toBe(
		STRICT_EQUALS_MANAGED_CLASS_MEMBER_HELPER_NAME,
	);
	expect((childCall.args[0] as { value: string }).value).toBe("field:child");
	expect((aliasCall.args[0] as { value: string }).value).toBe("getter:alias");
});

test("emits ArrayBuffer helper checks for participating ArrayBuffer-typed members", () => {
	const parser = parseSource(`
class Example {
  buffer: ArrayBuffer;

  get alias(): ArrayBuffer {
    return this.buffer;
  }
}
`);

	new StrictEqualityTransform().afterParse(parser);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const strictEqualsMethod = findMethod(
		classDeclaration,
		STRICT_EQUALS_METHOD_NAME,
	);
	const bodyStatements = getMethodBodyStatements(strictEqualsMethod);
	const bufferCheck = bodyStatements[2] as IfStatement;
	const aliasCheck = bodyStatements[3] as IfStatement;
	const bufferCall = (bufferCheck.condition as UnaryPrefixExpression)
		.operand as CallExpression;
	const aliasCall = (aliasCheck.condition as UnaryPrefixExpression)
		.operand as CallExpression;

	expect(bufferCall.expression.kind).toBe(NodeKind.Identifier);
	expect(aliasCall.expression.kind).toBe(NodeKind.Identifier);
	expect(bufferCall.expression.text).toBe(
		STRICT_EQUALS_ARRAY_BUFFER_MEMBER_HELPER_NAME,
	);
	expect(aliasCall.expression.text).toBe(
		STRICT_EQUALS_ARRAY_BUFFER_MEMBER_HELPER_NAME,
	);
	expect((bufferCall.args[0] as { value: string }).value).toBe("field:buffer");
	expect((aliasCall.args[0] as { value: string }).value).toBe("getter:alias");
});

test("emits ArrayBufferView helper checks for participating typed-array and DataView members", () => {
	const parser = parseSource(`
class Example {
  bytes: Uint8Array;
  view: DataView;
}
`);

	new StrictEqualityTransform().afterParse(parser);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const strictEqualsMethod = findMethod(
		classDeclaration,
		STRICT_EQUALS_METHOD_NAME,
	);
	const bodyStatements = getMethodBodyStatements(strictEqualsMethod);
	const bytesCheck = bodyStatements[2] as IfStatement;
	const viewCheck = bodyStatements[3] as IfStatement;
	const bytesCall = (bytesCheck.condition as UnaryPrefixExpression)
		.operand as CallExpression;
	const viewCall = (viewCheck.condition as UnaryPrefixExpression)
		.operand as CallExpression;

	expect(bytesCall.expression.kind).toBe(NodeKind.Identifier);
	expect(viewCall.expression.kind).toBe(NodeKind.Identifier);
	expect(bytesCall.expression.text).toBe(
		STRICT_EQUALS_ARRAY_BUFFER_VIEW_MEMBER_HELPER_NAME,
	);
	expect(viewCall.expression.text).toBe(
		STRICT_EQUALS_ARRAY_BUFFER_VIEW_MEMBER_HELPER_NAME,
	);
	expect((bytesCall.args[0] as { value: string }).value).toBe("field:bytes");
	expect((viewCall.args[0] as { value: string }).value).toBe("field:view");
});

test("emits Set helper checks for participating Set-typed members", () => {
	const parser = parseSource(`
class Example {
  values: Set<i32>;
}
`);

	new StrictEqualityTransform().afterParse(parser);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const strictEqualsMethod = findMethod(
		classDeclaration,
		STRICT_EQUALS_METHOD_NAME,
	);
	const bodyStatements = getMethodBodyStatements(strictEqualsMethod);
	const setCheck = bodyStatements[2] as IfStatement;
	const setCall = (setCheck.condition as UnaryPrefixExpression)
		.operand as CallExpression;

	expect(setCall.expression.kind).toBe(NodeKind.Identifier);
	expect(setCall.expression.text).toBe(STRICT_EQUALS_SET_MEMBER_HELPER_NAME);
	expect((setCall.args[0] as { value: string }).value).toBe("field:values");
});

test("emits Map helper checks for participating Map-typed members", () => {
	const parser = parseSource(`
class Example {
  values: Map<string, i32>;
}
`);

	new StrictEqualityTransform().afterParse(parser);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const strictEqualsMethod = findMethod(
		classDeclaration,
		STRICT_EQUALS_METHOD_NAME,
	);
	const bodyStatements = getMethodBodyStatements(strictEqualsMethod);
	const mapCheck = bodyStatements[2] as IfStatement;
	const mapCall = (mapCheck.condition as UnaryPrefixExpression)
		.operand as CallExpression;

	expect(mapCall.expression.kind).toBe(NodeKind.Identifier);
	expect(mapCall.expression.text).toBe(STRICT_EQUALS_MAP_MEMBER_HELPER_NAME);
	expect((mapCall.args[0] as { value: string }).value).toBe("field:values");
});

test("emits per-member reflected key-value helper calls for participating fields and getters", () => {
	const parser = parseSource(`
class Example {
  count: i32;

  get size(): i32 {
    return this.count;
  }
}
`);

	new StrictEqualityTransform().afterParse(parser);

	const classDeclaration = findTopLevelClass(
		getParsedStatements(parser),
		"Example",
	);
	const reflectedMethod = findMethod(
		classDeclaration,
		ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
	);
	const bodyStatements = getMethodBodyStatements(reflectedMethod);

	expect(bodyStatements).toHaveLength(2);

	const countStatement = bodyStatements[0] as ExpressionStatement;
	const sizeStatement = bodyStatements[1] as ExpressionStatement;
	const countCall = countStatement.expression as CallExpression;
	const sizeCall = sizeStatement.expression as CallExpression;
	const countMemberAccess = countCall.args[1] as PropertyAccessExpression;
	const sizeMemberAccess = sizeCall.args[1] as PropertyAccessExpression;

	expect(countCall.expression.kind).toBe(NodeKind.Identifier);
	expect(sizeCall.expression.kind).toBe(NodeKind.Identifier);
	expect(countCall.expression.text).toBe(
		ADD_REFLECTED_VALUE_KEY_VALUE_PAIR_HELPER_NAME,
	);
	expect(sizeCall.expression.text).toBe(
		ADD_REFLECTED_VALUE_KEY_VALUE_PAIR_HELPER_NAME,
	);
	expect(countCall.args).toHaveLength(2);
	expect(sizeCall.args).toHaveLength(2);
	expect((countCall.args[0] as { value: string }).value).toBe("field:count");
	expect((sizeCall.args[0] as { value: string }).value).toBe("getter:size");
	expect(countMemberAccess.expression.kind).toBe(NodeKind.This);
	expect(sizeMemberAccess.expression.kind).toBe(NodeKind.This);
	expect(countMemberAccess.property.text).toBe("count");
	expect(sizeMemberAccess.property.text).toBe("size");
});
