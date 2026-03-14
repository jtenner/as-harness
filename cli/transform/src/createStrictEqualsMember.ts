import {
	CommonFlags,
	Node,
	ParameterKind,
} from "assemblyscript/dist/assemblyscript.js";
import type {
	ClassDeclaration,
	MethodDeclaration,
	Range,
	TypeNode,
} from "assemblyscript/dist/assemblyscript.js";
import { STRICT_EQUALS_METHOD_NAME } from "./contracts.js";

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
): MethodDeclaration {
	const range = classDeclaration.range.atEnd;
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

	return Node.createMethodDeclaration(
		Node.createIdentifierExpression(STRICT_EQUALS_METHOD_NAME, range),
		null,
		CommonFlags.Public | CommonFlags.Instance,
		null,
		signature,
		Node.createBlockStatement(
			[Node.createReturnStatement(Node.createTrueExpression(range), range)],
			range,
		),
		range,
	);
}
