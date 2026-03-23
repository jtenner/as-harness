import {
	copyLastArtifactTextUtf16,
	fixtureRead,
	getLastArtifactTextUtf16ByteLength,
	snapshotCheck,
} from "./imports";

export function readLastArtifactText(): string {
	const byteLength = getLastArtifactTextUtf16ByteLength();
	if (byteLength <= 0) {
		return "";
	}

	const buffer = new ArrayBuffer(byteLength);
	copyLastArtifactTextUtf16(changetype<usize>(buffer));
	return String.UTF16.decode(buffer);
}

export function trySnapshotCheck(
	actual: string,
	label: string | null = null,
): bool {
	return (
		snapshotCheck(
			changetype<usize>(actual),
			label === null ? 0 : changetype<usize>(label),
		) == 1
	);
}

export function tryFixtureRead(path: string): string | null {
	if (fixtureRead(changetype<usize>(path)) != 1) {
		return null;
	}

	return readLastArtifactText();
}
