import { Transform } from "assemblyscript/dist/transform.js";
import type { Parser } from "assemblyscript/dist/assemblyscript.js";
import ArtifactFrameTransform from "./artifactFrames.js";
import StrictEqualityTransform from "./emptyTransformer.js";

export {
	resetArtifactFrameTransformOptions,
	setArtifactFrameTransformOptions,
} from "./artifactFrames.js";

export default class BundledHarnessTransform extends Transform {
	afterParse(parser: Parser): void {
		new StrictEqualityTransform().afterParse(parser);
		new ArtifactFrameTransform().afterParse(parser);
	}
}
