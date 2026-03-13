import { DeclarationMode, NodeKind } from "./imports";

export type NodeCallback = () => void;

function noop(): void {}

/**
 * Structural node metadata plus the lazy child-discovery callback used to
 * rediscover descendants when traversal replays the node later.
 */
export class Node {
  readonly kind: NodeKind;
  readonly name: string;
  readonly declarationMode: DeclarationMode;
  readonly callback: NodeCallback;

  private parentValue: Node | null = null;
  private ordinalValue: u32 = 0;
  private childrenValue: Array<Node> = new Array<Node>();
  private childrenResolved: bool = false;

  constructor(
    kind: NodeKind,
    name: string,
    declarationMode: DeclarationMode = DeclarationMode.Normal,
    callback: NodeCallback = noop,
  ) {
    this.kind = kind;
    this.name = name;
    this.declarationMode = declarationMode;
    this.callback = callback;
  }

  get parent(): Node | null {
    return this.parentValue;
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
    this.callback();
    currentNode = previousNode;

    return this.childrenValue;
  }

  createChild(
    kind: NodeKind,
    name: string,
    declarationMode: DeclarationMode = DeclarationMode.Normal,
    callback: NodeCallback = noop,
  ): Node {
    const child = new Node(kind, name, declarationMode, callback);
    child.parentValue = this;
    child.ordinalValue = <u32>this.childrenValue.length;
    this.childrenValue.push(child);
    return child;
  }
}

export const rootNode = new Node(NodeKind.Root, "~root");

export let currentNode: Node = rootNode;
