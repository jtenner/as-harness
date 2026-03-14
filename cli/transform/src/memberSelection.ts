import { CommonFlags, NodeKind } from "assemblyscript/dist/assemblyscript.js";
import type {
	ClassDeclaration,
	FieldDeclaration,
	MethodDeclaration,
} from "assemblyscript/dist/assemblyscript.js";
import { createParticipatingMemberHash } from "./hash.js";

export type ParticipatingMemberKind = "field" | "getter";

export type ParticipatingMember = {
	declaration: FieldDeclaration | MethodDeclaration;
	hash: string;
	kind: ParticipatingMemberKind;
	name: string;
};

function isParticipatingFieldDeclaration(
	fieldDeclaration: FieldDeclaration,
): boolean {
	return (fieldDeclaration.flags & CommonFlags.Static) === 0;
}

function isParticipatingGetterDeclaration(
	methodDeclaration: MethodDeclaration,
): boolean {
	return (
		(methodDeclaration.flags & CommonFlags.Static) === 0 &&
		(methodDeclaration.flags & CommonFlags.Get) !== 0 &&
		(methodDeclaration.flags & CommonFlags.Set) === 0 &&
		(methodDeclaration.flags & CommonFlags.Constructor) === 0
	);
}

export function getParticipatingInstanceMembers(
	classDeclaration: ClassDeclaration,
): ParticipatingMember[] {
	const participatingMembers: ParticipatingMember[] = [];

	for (const member of classDeclaration.members) {
		if (
			member.kind === NodeKind.FieldDeclaration &&
			isParticipatingFieldDeclaration(member as FieldDeclaration)
		) {
			participatingMembers.push({
				declaration: member as FieldDeclaration,
				hash: createParticipatingMemberHash("field", member.name.text),
				kind: "field",
				name: member.name.text,
			});
			continue;
		}

		if (
			member.kind === NodeKind.MethodDeclaration &&
			isParticipatingGetterDeclaration(member as MethodDeclaration)
		) {
			participatingMembers.push({
				declaration: member as MethodDeclaration,
				hash: createParticipatingMemberHash("getter", member.name.text),
				kind: "getter",
				name: member.name.text,
			});
		}
	}

	return participatingMembers;
}
