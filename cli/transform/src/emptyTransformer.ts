import { Transform } from "assemblyscript/dist/transform.js";
import { CommonFlags, NodeKind } from "assemblyscript/dist/assemblyscript.js";
import type {
	ClassDeclaration,
	NamespaceDeclaration,
	Parser,
	Statement,
} from "assemblyscript/dist/assemblyscript.js";
import {
	ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
	STRICT_EQUALS_METHOD_NAME,
} from "./contracts.js";
import { createAddReflectedValueKeyValuePairsMember } from "./createAddReflectedValueKeyValuePairsMember.js";
import { createStrictEqualsMember } from "./createStrictEqualsMember.js";

function hasMethodNamed(
	classDeclaration: ClassDeclaration,
	methodName: string,
): boolean {
	return classDeclaration.members.some(
		(member) =>
			member.kind === NodeKind.MethodDeclaration &&
			member.name.text === methodName,
	);
}

function instrumentClassDeclaration(classDeclaration: ClassDeclaration): void {
	if (classDeclaration.flags & CommonFlags.Ambient) {
		return;
	}

	if (!hasMethodNamed(classDeclaration, STRICT_EQUALS_METHOD_NAME)) {
		classDeclaration.members.push(createStrictEqualsMember(classDeclaration));
	}

	if (
		!hasMethodNamed(
			classDeclaration,
			ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
		)
	) {
		classDeclaration.members.push(
			createAddReflectedValueKeyValuePairsMember(classDeclaration),
		);
	}
}

function visitStatements(statements: readonly Statement[]): void {
	for (const statement of statements) {
		if (statement.kind === NodeKind.ClassDeclaration) {
			instrumentClassDeclaration(statement as ClassDeclaration);
			continue;
		}

		if (statement.kind === NodeKind.NamespaceDeclaration) {
			visitStatements((statement as NamespaceDeclaration).members);
		}
	}
}

export default class EmptyTransform extends Transform {
	afterParse(parser: Parser): void {
		for (const source of parser.sources) {
			if (source.isLibrary) {
				continue;
			}

			visitStatements(source.statements);
		}
	}
}
