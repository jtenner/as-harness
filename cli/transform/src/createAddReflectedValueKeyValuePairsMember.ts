import { CommonFlags, Node } from "assemblyscript/dist/assemblyscript.js";
import type {
	ClassDeclaration,
	MethodDeclaration,
	Range,
	TypeNode,
} from "assemblyscript/dist/assemblyscript.js";
import { ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME } from "./contracts.js";

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
): MethodDeclaration {
	const range = classDeclaration.range.atEnd;
	const signature = Node.createFunctionType(
		[],
		createNamedType("void", range),
		null,
		false,
		range,
	);

	return Node.createMethodDeclaration(
		Node.createIdentifierExpression(
			ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
			range,
		),
		null,
		CommonFlags.Public | CommonFlags.Instance,
		null,
		signature,
		Node.createBlockStatement([], range),
		range,
	);
}
