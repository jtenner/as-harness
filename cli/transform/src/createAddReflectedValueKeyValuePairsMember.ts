import { CommonFlags, Node } from "assemblyscript/dist/assemblyscript.js";
import type {
	ClassDeclaration,
	Expression,
	MethodDeclaration,
	Range,
	Statement,
	TypeNode,
} from "assemblyscript/dist/assemblyscript.js";
import {
	ADD_REFLECTED_VALUE_KEY_VALUE_PAIR_HELPER_NAME,
	ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
} from "./contracts.js";
import type { ParticipatingMember } from "./memberSelection.js";

function createNamedType(name: string, range: Range): TypeNode {
	return Node.createNamedType(
		Node.createSimpleTypeName(name, range),
		null,
		false,
		range,
	);
}

function createThisMemberAccessExpression(
	member: ParticipatingMember,
	range: Range,
): Expression {
	return Node.createPropertyAccessExpression(
		Node.createThisExpression(range),
		Node.createIdentifierExpression(member.name, range),
		range,
	);
}

export function createAddReflectedValueKeyValuePairsMember(
	classDeclaration: ClassDeclaration,
	participatingMembers: readonly ParticipatingMember[],
): MethodDeclaration {
	const range = classDeclaration.range.atEnd;
	const statements: Statement[] = [];
	const signature = Node.createFunctionType(
		[],
		createNamedType("void", range),
		null,
		false,
		range,
	);

	if (classDeclaration.extendsType !== null) {
		statements.push(
			Node.createExpressionStatement(
				Node.createCallExpression(
					Node.createPropertyAccessExpression(
						Node.createSuperExpression(range),
						Node.createIdentifierExpression(
							ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
							range,
						),
						range,
					),
					null,
					[],
					range,
				),
			),
		);
	}

	for (const member of participatingMembers) {
		statements.push(
			Node.createExpressionStatement(
				Node.createCallExpression(
					Node.createIdentifierExpression(
						ADD_REFLECTED_VALUE_KEY_VALUE_PAIR_HELPER_NAME,
						range,
					),
					null,
					[
						Node.createStringLiteralExpression(member.hash, range),
						createThisMemberAccessExpression(member, range),
					],
					range,
				),
			),
		);
	}

	return Node.createMethodDeclaration(
		Node.createIdentifierExpression(
			ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
			range,
		),
		null,
		CommonFlags.Public | CommonFlags.Instance,
		null,
		signature,
		Node.createBlockStatement(statements, range),
		range,
	);
}
