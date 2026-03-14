import { CommonFlags, Node } from "assemblyscript/dist/assemblyscript.js";
import type {
	ClassDeclaration,
	MethodDeclaration,
	Statement,
	Range,
	TypeNode,
} from "assemblyscript/dist/assemblyscript.js";
import { ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME } from "./contracts.js";
import type { ParticipatingMember } from "./memberSelection.js";

function createNamedType(name: string, range: Range): TypeNode {
	return Node.createNamedType(
		Node.createSimpleTypeName(name, range),
		null,
		false,
		range,
	);
}

export function createAddReflectedValueKeyValuePairsMember(
	classDeclaration: ClassDeclaration,
	_participatingMembers: readonly ParticipatingMember[],
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
