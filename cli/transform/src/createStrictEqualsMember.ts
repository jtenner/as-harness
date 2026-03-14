import {
	CommonFlags,
	Node,
	ParameterKind,
	Token,
} from "assemblyscript/dist/assemblyscript.js";
import type {
	ClassDeclaration,
	Expression,
	MethodDeclaration,
	Range,
	Statement,
	TypeNode,
} from "assemblyscript/dist/assemblyscript.js";
import {
	STRICT_EQUALS_ARRAY_BUFFER_MEMBER_HELPER_NAME,
	STRICT_EQUALS_ARRAY_BUFFER_VIEW_MEMBER_HELPER_NAME,
	STRICT_EQUALS_MAP_MEMBER_HELPER_NAME,
	STRICT_EQUALS_SET_MEMBER_HELPER_NAME,
	STRICT_EQUALS_RUNTIME_TYPE_HELPER_NAME,
	STRICT_EQUALS_MANAGED_CLASS_MEMBER_HELPER_NAME,
	STRICT_EQUALS_MEMBER_HELPER_NAME,
	STRICT_EQUALS_METHOD_NAME,
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

function createClassTypeNode(
	classDeclaration: ClassDeclaration,
	range: Range,
): TypeNode {
	const typeArguments =
		classDeclaration.typeParameters?.map((parameter) =>
			createNamedType(parameter.name.text, range),
		) ?? null;

	return Node.createNamedType(
		Node.createSimpleTypeName(classDeclaration.name.text, range),
		typeArguments,
		false,
		range,
	);
}

function createOtherAsClassExpression(
	classDeclaration: ClassDeclaration,
	range: Range,
): Expression {
	return Node.createCallExpression(
		Node.createIdentifierExpression("changetype", range),
		[createClassTypeNode(classDeclaration, range)],
		[Node.createIdentifierExpression("other", range)],
		range,
	);
}

function createOtherMemberAccessExpression(
	classDeclaration: ClassDeclaration,
	member: ParticipatingMember,
	range: Range,
): Expression {
	return Node.createPropertyAccessExpression(
		createOtherAsClassExpression(classDeclaration, range),
		Node.createIdentifierExpression(member.name, range),
		range,
	);
}

export function createStrictEqualsMember(
	classDeclaration: ClassDeclaration,
	participatingMembers: readonly ParticipatingMember[],
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

	statements.push(
		Node.createIfStatement(
			Node.createBinaryExpression(
				Token.Equals_Equals,
				Node.createIdentifierExpression("other", range),
				Node.createCallExpression(
					Node.createIdentifierExpression("changetype", range),
					[createNamedType("usize", range)],
					[Node.createThisExpression(range)],
					range,
				),
				range,
			),
			Node.createBlockStatement(
				[Node.createReturnStatement(Node.createTrueExpression(range), range)],
				range,
			),
			null,
			range,
		),
	);

	statements.push(
		Node.createIfStatement(
			Node.createUnaryPrefixExpression(
				Token.Exclamation,
				Node.createCallExpression(
					Node.createIdentifierExpression(
						STRICT_EQUALS_RUNTIME_TYPE_HELPER_NAME,
						range,
					),
					null,
					[
						Node.createIdentifierExpression("other", range),
						Node.createCallExpression(
							Node.createIdentifierExpression("idof", range),
							[createClassTypeNode(classDeclaration, range)],
							[],
							range,
						),
					],
					range,
				),
				range,
			),
			Node.createBlockStatement(
				[Node.createReturnStatement(Node.createFalseExpression(range), range)],
				range,
			),
			null,
			range,
		),
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

	for (const member of participatingMembers) {
		let helperName = STRICT_EQUALS_MEMBER_HELPER_NAME;
		if (member.strictEqualityComparisonStrategy === "arrayBuffer") {
			helperName = STRICT_EQUALS_ARRAY_BUFFER_MEMBER_HELPER_NAME;
		} else if (member.strictEqualityComparisonStrategy === "arrayBufferView") {
			helperName = STRICT_EQUALS_ARRAY_BUFFER_VIEW_MEMBER_HELPER_NAME;
		} else if (member.strictEqualityComparisonStrategy === "map") {
			helperName = STRICT_EQUALS_MAP_MEMBER_HELPER_NAME;
		} else if (member.strictEqualityComparisonStrategy === "set") {
			helperName = STRICT_EQUALS_SET_MEMBER_HELPER_NAME;
		} else if (member.strictEqualityComparisonStrategy === "managedClass") {
			helperName = STRICT_EQUALS_MANAGED_CLASS_MEMBER_HELPER_NAME;
		}
		const memberCheckCall = Node.createCallExpression(
			Node.createIdentifierExpression(helperName, range),
			null,
			[
				Node.createStringLiteralExpression(member.hash, range),
				createThisMemberAccessExpression(member, range),
				createOtherMemberAccessExpression(classDeclaration, member, range),
			],
			range,
		);
		statements.push(
			Node.createIfStatement(
				Node.createUnaryPrefixExpression(
					Token.Exclamation,
					memberCheckCall,
					range,
				),
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
