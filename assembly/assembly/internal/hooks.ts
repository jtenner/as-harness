import { HookKind } from "./imports";
import { TestContext } from "./context";

export type HookCallback = (context: TestContext) => void;

export class HookRegistration {
	readonly kind: HookKind;
	readonly callback: HookCallback;
	readonly context: TestContext | null;
	readonly timeout: i32;

	constructor(
		kind: HookKind,
		callback: HookCallback,
		timeout: i32 = -1,
		context: TestContext | null = null,
	) {
		this.kind = kind;
		this.callback = callback;
		this.context = context;
		this.timeout = timeout;
	}
}
