import {
	CommonFlags,
	Node,
	ParameterKind,
	Token,
} from "assemblyscript/dist/assemblyscript.js";
import type {
	ClassDeclaration,
	MethodDeclaration,
	Statement,
	Range,
	TypeNode,
} from "assemblyscript/dist/assemblyscript.js";
import { STRICT_EQUALS_METHOD_NAME } from "./contracts.js";
import type { ParticipatingMember } from "./memberSelection.js";

function createNamedType(name: string, range: Range): TypeNode {
	return Node.createNamedType(
		Node.createSimpleTypeName(name, range),
		null,
		false,
		range,
	);
}

export function createStrictEqualsMember(
	classDeclaration: ClassDeclaration,
	_participatingMembers: readonly ParticipatingMember[],
): MethodDeclaration {
	const range = classDeclaration.range.atEnd;
	const statements: Statement[] = [];
	const signature = Node.createFunctionType(
		[
			Node.createParameter(
				ParameterKind.Default,
				Node.createIdentifierExpression("other", range),
				createNamedType("usize", range),
				null,
				range,
			),
		],
		createNamedType("bool", range),
		null,
		false,
		range,
	);

	if (classDeclaration.extendsType !== null) {
		const superCall = Node.createCallExpression(
			Node.createPropertyAccessExpression(
				Node.createSuperExpression(range),
				Node.createIdentifierExpression(STRICT_EQUALS_METHOD_NAME, range),
				range,
			),
			null,
			[Node.createIdentifierExpression("other", range)],
			range,
		);
		statements.push(
			Node.createIfStatement(
				Node.createUnaryPrefixExpression(Token.Exclamation, superCall, range),
				Node.createBlockStatement(
					[
						Node.createReturnStatement(
							Node.createFalseExpression(range),
							range,
						),
					],
					range,
				),
				null,
				range,
			),
		);
	}

	statements.push(
		Node.createReturnStatement(Node.createTrueExpression(range), range),
	);

	return Node.createMethodDeclaration(
		Node.createIdentifierExpression(STRICT_EQUALS_METHOD_NAME, range),
		null,
		CommonFlags.Public | CommonFlags.Instance,
		null,
		signature,
		Node.createBlockStatement(statements, range),
		range,
	);
}
