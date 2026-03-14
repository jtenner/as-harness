import { CommonFlags, NodeKind } from "assemblyscript/dist/assemblyscript.js";
import type {
	ClassDeclaration,
	FieldDeclaration,
	MethodDeclaration,
	NamedTypeNode,
	TypeNode,
} from "assemblyscript/dist/assemblyscript.js";
import { createParticipatingMemberHash } from "./hash.js";

export type ParticipatingMemberKind = "field" | "getter";
export type StrictEqualityComparisonStrategy =
	| "value"
	| "arrayBuffer"
	| "arrayBufferView"
	| "managedClass";

export type ParticipatingMember = {
	declaration: FieldDeclaration | MethodDeclaration;
	hash: string;
	kind: ParticipatingMemberKind;
	name: string;
	strictEqualityComparisonStrategy: StrictEqualityComparisonStrategy;
};

const NON_MANAGED_CLASS_TYPE_NAMES = new Set([
	"Array",
	"ArrayBuffer",
	"ArrayBufferView",
	"ArrayLike",
	"DataView",
	"Date",
	"Float32Array",
	"Float64Array",
	"Int8Array",
	"Int16Array",
	"Int32Array",
	"Int64Array",
	"Map",
	"Set",
	"StaticArray",
	"String",
	"Uint8Array",
	"Uint8ClampedArray",
	"Uint16Array",
	"Uint32Array",
	"Uint64Array",
	"bool",
	"f32",
	"f64",
	"i8",
	"i16",
	"i32",
	"i64",
	"isize",
	"string",
	"u8",
	"u16",
	"u32",
	"u64",
	"usize",
	"v128",
]);

const ARRAY_BUFFER_VIEW_TYPE_NAMES = new Set([
	"ArrayBufferView",
	"DataView",
	"Float32Array",
	"Float64Array",
	"Int8Array",
	"Int16Array",
	"Int32Array",
	"Int64Array",
	"Uint8Array",
	"Uint8ClampedArray",
	"Uint16Array",
	"Uint32Array",
	"Uint64Array",
]);

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

function getParticipatingMemberTypeNode(
	declaration: FieldDeclaration | MethodDeclaration,
): TypeNode | null {
	if (declaration.kind === NodeKind.FieldDeclaration) {
		return (declaration as FieldDeclaration).type;
	}

	return ((declaration as MethodDeclaration).signature.returnType ??
		null) as TypeNode | null;
}

function getNamedTypeName(typeNode: TypeNode | null): string | null {
	if (typeNode === null || typeNode.kind !== NodeKind.NamedType) {
		return null;
	}

	return (typeNode as NamedTypeNode).name.identifier.text;
}

function getStrictEqualityComparisonStrategy(
	classDeclaration: ClassDeclaration,
	declaration: FieldDeclaration | MethodDeclaration,
	knownClassNames: ReadonlySet<string>,
): StrictEqualityComparisonStrategy {
	const typeNode = getParticipatingMemberTypeNode(declaration);
	const typeName = getNamedTypeName(typeNode);
	if (typeName === null) {
		return "value";
	}

	if (
		classDeclaration.typeParameters?.some(
			(typeParameter) => typeParameter.name.text === typeName,
		) ??
		false
	) {
		return "value";
	}

	if (typeName === "ArrayBuffer") {
		return "arrayBuffer";
	}

	if (ARRAY_BUFFER_VIEW_TYPE_NAMES.has(typeName)) {
		return "arrayBufferView";
	}

	if (
		NON_MANAGED_CLASS_TYPE_NAMES.has(typeName) ||
		!knownClassNames.has(typeName)
	) {
		return "value";
	}

	return "managedClass";
}

export function getParticipatingInstanceMembers(
	classDeclaration: ClassDeclaration,
	knownClassNames: ReadonlySet<string> = new Set<string>(),
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
				strictEqualityComparisonStrategy: getStrictEqualityComparisonStrategy(
					classDeclaration,
					member as FieldDeclaration,
					knownClassNames,
				),
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
				strictEqualityComparisonStrategy: getStrictEqualityComparisonStrategy(
					classDeclaration,
					member as MethodDeclaration,
					knownClassNames,
				),
			});
		}
	}

	return participatingMembers;
}
