import {
  beginAssertionScope,
  endAssertionScope,
  markActiveNodeCallbackPassed,
} from "./execution-state";
import {
  callbackPass,
  callbackStart,
  nodePass,
  nodeStart,
} from "./events";
import { sharedTestContext } from "./context";
import { HookRegistration } from "./hooks";
import { DeclarationMode, HookKind } from "./imports";
import { Node, currentNode, setCurrentNode } from "./node";

function collectNodeChain(node: Node): Array<Node> {
  const chain = new Array<Node>();
  let cursor: Node | null = node;

  while (cursor !== null) {
    chain.unshift(cursor);
    cursor = cursor.parent;
  }

  return chain;
}

function executeHookRegistrations(
  owner: Node,
  registrations: Array<HookRegistration>,
): void {
  const previousNode = currentNode;
  const nodeIndex = owner.getNodeIndex();

  setCurrentNode(owner);

  for (let i = 0, length = registrations.length; i < length; i++) {
    const registration = unchecked(registrations[i]);
    callbackStart(registration.kind, nodeIndex);
    registration.callback(sharedTestContext);
    callbackPass(registration.kind, nodeIndex);
  }

  setCurrentNode(previousNode);
}

function executeHookKind(
  chain: Array<Node>,
  kind: HookKind,
  reverse: bool = false,
): void {
  if (!reverse) {
    for (let i = 0, length = chain.length; i < length; i++) {
      const owner = unchecked(chain[i]);
      executeHookRegistrations(owner, owner.getHooks(kind));
    }

    return;
  }

  for (let i = chain.length - 1; i >= 0; i--) {
    const owner = unchecked(chain[i]);
    executeHookRegistrations(owner, owner.getHooks(kind));
  }
}

export function executeNode(node: Node): void {
  if (node.declarationMode != DeclarationMode.Normal) {
    return;
  }

  const chain = collectNodeChain(node);
  const nodeIndex = node.getNodeIndex();

  nodeStart(nodeIndex);
  beginAssertionScope(node.name, node.plan);
  executeHookKind(chain, HookKind.BeforeAll);
  executeHookKind(chain, HookKind.BeforeEach);
  node.invokeCallback();
  markActiveNodeCallbackPassed();
  executeHookKind(chain, HookKind.AfterEach, true);
  executeHookKind(chain, HookKind.AfterAll, true);
  endAssertionScope();
  nodePass(nodeIndex);
}
