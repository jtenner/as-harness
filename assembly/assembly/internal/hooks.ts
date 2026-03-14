import { HookKind } from "./imports";
import { TestContext } from "./context";

export type HookCallback = (context: TestContext) => void;

export class HookRegistration {
  readonly kind: HookKind;
  readonly callback: HookCallback;
  readonly timeout: i32;

  constructor(
    kind: HookKind,
    callback: HookCallback,
    timeout: i32 = -1,
  ) {
    this.kind = kind;
    this.callback = callback;
    this.timeout = timeout;
  }
}
