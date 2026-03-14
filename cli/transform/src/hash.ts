import type { ParticipatingMemberKind } from "./memberSelection.js";

export function createParticipatingMemberHash(
	kind: ParticipatingMemberKind,
	name: string,
): string {
	return kind.concat(":", name);
}
