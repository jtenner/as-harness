import { Transform } from "assemblyscript/dist/transform.js";
import { CommonFlags, NodeKind } from "assemblyscript/dist/assemblyscript.js";
import type {
	ClassDeclaration,
	DecoratorNode,
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
import { getParticipatingInstanceMembers } from "./memberSelection.js";

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

function hasDecoratorNamed(
	classDeclaration: ClassDeclaration,
	decoratorName: string,
): boolean {
	return (
		classDeclaration.decorators?.some(
			(decorator: DecoratorNode) => decorator.name.text === decoratorName,
		) ?? false
	);
}

function isTransformManagedClass(classDeclaration: ClassDeclaration): boolean {
	return !hasDecoratorNamed(classDeclaration, "unmanaged");
}

function collectKnownClassNames(
	statements: readonly Statement[],
	knownClassNames: Set<string>,
): void {
	for (const statement of statements) {
		if (statement.kind === NodeKind.ClassDeclaration) {
			const classDeclaration = statement as ClassDeclaration;
			if (isTransformManagedClass(classDeclaration)) {
				knownClassNames.add(classDeclaration.name.text);
			}
			continue;
		}

		if (statement.kind === NodeKind.NamespaceDeclaration) {
			collectKnownClassNames(
				(statement as NamespaceDeclaration).members,
				knownClassNames,
			);
		}
	}
}

function instrumentClassDeclaration(
	classDeclaration: ClassDeclaration,
	knownClassNames: ReadonlySet<string>,
): void {
	if (
		classDeclaration.flags & CommonFlags.Ambient ||
		!isTransformManagedClass(classDeclaration)
	) {
		return;
	}

	const participatingMembers = getParticipatingInstanceMembers(
		classDeclaration,
		knownClassNames,
	);

	if (!hasMethodNamed(classDeclaration, STRICT_EQUALS_METHOD_NAME)) {
		classDeclaration.members.push(
			createStrictEqualsMember(classDeclaration, participatingMembers),
		);
	}

	if (
		!hasMethodNamed(
			classDeclaration,
			ADD_REFLECTED_VALUE_KEY_VALUE_PAIRS_METHOD_NAME,
		)
	) {
		classDeclaration.members.push(
			createAddReflectedValueKeyValuePairsMember(
				classDeclaration,
				participatingMembers,
			),
		);
	}
}

function visitStatements(
	statements: readonly Statement[],
	knownClassNames: ReadonlySet<string>,
): void {
	for (const statement of statements) {
		if (statement.kind === NodeKind.ClassDeclaration) {
			instrumentClassDeclaration(
				statement as ClassDeclaration,
				knownClassNames,
			);
			continue;
		}

		if (statement.kind === NodeKind.NamespaceDeclaration) {
			visitStatements(
				(statement as NamespaceDeclaration).members,
				knownClassNames,
			);
		}
	}
}

export default class EmptyTransform extends Transform {
	afterParse(parser: Parser): void {
		const knownClassNames = new Set<string>();

		for (const source of parser.sources) {
			if (source.isLibrary) {
				continue;
			}

			collectKnownClassNames(source.statements, knownClassNames);
		}

		for (const source of parser.sources) {
			if (source.isLibrary) {
				continue;
			}

			visitStatements(source.statements, knownClassNames);
		}
	}
}
