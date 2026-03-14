import { DeclarationMode, HookKind, NodeKind } from "./imports";
import { sharedSuiteContext, sharedTestContext, SuiteContext, TestContext } from "./context";
import { HookCallback, HookRegistration } from "./hooks";

export type NodeCallback = () => void;
export type TestNodeCallback = (context: TestContext) => void;
export type SuiteNodeCallback = (context: SuiteContext) => void;

function noop(): void {}

export class NodeExecutionOptions {
  only: bool = false;
  expectFailure: bool = false;
  timeout: i32 = -1;
  concurrency: i32 = 0;
  plan: i32 = -1;
}

/**
 * Structural node metadata plus the lazy child-discovery callback used to
 * rediscover descendants when traversal replays the node later.
 */
export class Node {
  readonly kind: NodeKind;
  readonly name: string;
  readonly callback: NodeCallback;
  readonly only: bool;
  readonly expectFailure: bool;
  readonly timeout: i32;
  readonly concurrency: i32;
  readonly plan: i32;

  private declarationModeValue: DeclarationMode;
  private parentValue: Node | null = null;
  private ordinalValue: u32 = 0;
  private childrenValue: Array<Node> = new Array<Node>();
  private childrenResolved: bool = false;
  private testCallbackValue: TestNodeCallback | null = null;
  private suiteCallbackValue: SuiteNodeCallback | null = null;
  private beforeAllHooks: Array<HookRegistration> = new Array<HookRegistration>();
  private beforeEachHooks: Array<HookRegistration> = new Array<HookRegistration>();
  private afterEachHooks: Array<HookRegistration> = new Array<HookRegistration>();
  private afterAllHooks: Array<HookRegistration> = new Array<HookRegistration>();

  constructor(
    kind: NodeKind,
    name: string,
    declarationMode: DeclarationMode = DeclarationMode.Normal,
    callback: NodeCallback | null = null,
    options: NodeExecutionOptions | null = null,
  ) {
    this.kind = kind;
    this.name = name;
    this.declarationModeValue = declarationMode;
    this.callback = callback !== null ? callback : noop;
    this.only = options !== null ? options.only : false;
    this.expectFailure = options !== null ? options.expectFailure : false;
    this.timeout = options !== null ? options.timeout : -1;
    this.concurrency = options !== null ? options.concurrency : 0;
    this.plan = options !== null ? options.plan : -1;
  }

  get parent(): Node | null {
    return this.parentValue;
  }

  get declarationMode(): DeclarationMode {
    return this.declarationModeValue;
  }

  get ordinal(): u32 {
    return this.ordinalValue;
  }

  /**
   * Returns lazily discovered children, evaluating the node callback at most
   * once to populate the child list.
   */
  getChildren(): Array<Node> {
    if (this.childrenResolved) {
      return this.childrenValue;
    }

    this.childrenResolved = true;
    const previousNode = currentNode;
    currentNode = this;
    if (this.suiteCallbackValue !== null) {
      this.suiteCallbackValue(sharedSuiteContext);
    } else if (this.testCallbackValue !== null) {
      this.testCallbackValue(sharedTestContext);
    } else {
      this.callback();
    }
    currentNode = previousNode;

    return this.childrenValue;
  }

  createChild(
    kind: NodeKind,
    name: string,
    declarationMode: DeclarationMode = DeclarationMode.Normal,
    callback: NodeCallback | null = null,
    options: NodeExecutionOptions | null = null,
  ): Node {
    const child = new Node(kind, name, declarationMode, callback, options);
    child.parentValue = this;
    child.ordinalValue = <u32>this.childrenValue.length;
    this.childrenValue.push(child);
    return child;
  }

  setTestCallback(callback: TestNodeCallback): void {
    this.testCallbackValue = callback;
    this.suiteCallbackValue = null;
  }

  setSuiteCallback(callback: SuiteNodeCallback): void {
    this.suiteCallbackValue = callback;
    this.testCallbackValue = null;
  }

  setDeclarationMode(mode: DeclarationMode): void {
    this.declarationModeValue = mode;
  }

  getNodeIndex(): StaticArray<u32> {
    let depth: i32 = 0;
    let cursor: Node | null = this;

    while (cursor !== null && cursor.parent !== null) {
      depth++;
      cursor = cursor.parent;
    }

    const nodeIndex = new StaticArray<u32>(depth);
    cursor = this;
    let index = depth - 1;

    while (cursor !== null && cursor.parent !== null) {
      unchecked((nodeIndex[index] = cursor.ordinal));
      cursor = cursor.parent;
      index--;
    }

    return nodeIndex;
  }

  registerHook(
    kind: HookKind,
    callback: HookCallback,
    timeout: i32 = -1,
  ): void {
    const registration = new HookRegistration(kind, callback, timeout);

    if (kind == HookKind.BeforeAll) {
      this.beforeAllHooks.push(registration);
      return;
    }

    if (kind == HookKind.BeforeEach) {
      this.beforeEachHooks.push(registration);
      return;
    }

    if (kind == HookKind.AfterEach) {
      this.afterEachHooks.push(registration);
      return;
    }

    this.afterAllHooks.push(registration);
  }

  getHooks(kind: HookKind): Array<HookRegistration> {
    if (kind == HookKind.BeforeAll) {
      return this.beforeAllHooks;
    }

    if (kind == HookKind.BeforeEach) {
      return this.beforeEachHooks;
    }

    if (kind == HookKind.AfterEach) {
      return this.afterEachHooks;
    }

    return this.afterAllHooks;
  }
}

export const rootNode = new Node(NodeKind.Root, "~root");

export let currentNode: Node = rootNode;

export function setCurrentNode(node: Node): void {
  currentNode = node;
}

export function resetCurrentNode(): void {
  currentNode = rootNode;
}
