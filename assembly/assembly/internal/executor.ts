import {
  abandonAssertionScope,
  beginAssertionScope,
  endAssertionScope,
  getActiveRunOnly,
  markActiveNodeCallbackPassed,
  setActiveRunOnly,
} from "./execution-state";
import {
  callbackFail,
  callbackPass,
  callbackStart,
  nodeFail,
  nodePass,
  nodeStart,
} from "./events";
import { sharedTestContext } from "./context";
import { getActiveFailureKind, setActiveFailureKind } from "./failure-state";
import { HookRegistration } from "./hooks";
import { DeclarationMode, FailureKind, HookKind } from "./imports";
import { Node, currentNode, setCurrentNode } from "./node";
import { didCallbackTrap } from "./trampoline";

let stagedHookRegistration: HookRegistration | null = null;
let stagedNodeForInvocation: Node | null = null;

function invokeStagedHookRegistration(): void {
  if (stagedHookRegistration === null) {
    unreachable();
  }

  const registration = changetype<HookRegistration>(stagedHookRegistration);
  registration.callback(sharedTestContext);
}

function invokeStagedNodeCallback(): void {
  if (stagedNodeForInvocation === null) {
    unreachable();
  }

  const node = changetype<Node>(stagedNodeForInvocation);
  node.invokeCallback();
}

function collectNodeChain(node: Node): Array<Node> {
  const chain = new Array<Node>();
  let cursor: Node | null = node;

  while (cursor !== null) {
    chain.unshift(cursor);
    cursor = cursor.parent;
  }

  return chain;
}

function resolveFailureKind(): FailureKind {
  const activeFailureKind = getActiveFailureKind();
  if (activeFailureKind == <u8>FailureKind.Assertion) {
    return FailureKind.Assertion;
  }

  setActiveFailureKind(<u8>FailureKind.Trap);
  return FailureKind.Trap;
}

function executeHookRegistrations(
  owner: Node,
  registrations: Array<HookRegistration>,
): bool {
  const previousNode = currentNode;
  const nodeIndex = owner.getNodeIndex();

  setCurrentNode(owner);

  for (let i = 0, length = registrations.length; i < length; i++) {
    const registration = unchecked(registrations[i]);
    const previousRunOnly = getActiveRunOnly();
    callbackStart(registration.kind, nodeIndex);
    stagedHookRegistration = registration;
    const trapped = didCallbackTrap(invokeStagedHookRegistration);
    stagedHookRegistration = null;
    setActiveRunOnly(previousRunOnly);
    if (trapped) {
      callbackFail(registration.kind, nodeIndex, resolveFailureKind());
      setCurrentNode(previousNode);
      return false;
    }
    callbackPass(registration.kind, nodeIndex);
  }

  setCurrentNode(previousNode);
  return true;
}

function executeHookKind(
  chain: Array<Node>,
  kind: HookKind,
  reverse: bool = false,
): bool {
  if (!reverse) {
    for (let i = 0, length = chain.length; i < length; i++) {
      const owner = unchecked(chain[i]);
      if (!executeHookRegistrations(owner, owner.getHooks(kind))) {
        return false;
      }
    }

    return true;
  }

  for (let i = chain.length - 1; i >= 0; i--) {
    const owner = unchecked(chain[i]);
    if (!executeHookRegistrations(owner, owner.getHooks(kind))) {
      return false;
    }
  }

  return true;
}

export function executeNode(node: Node): bool {
  if (node.declarationMode != DeclarationMode.Normal) {
    return true;
  }

  const chain = collectNodeChain(node);
  const nodeIndex = node.getNodeIndex();

  nodeStart(nodeIndex);
  beginAssertionScope(node.name, node.plan);
  if (!executeHookKind(chain, HookKind.BeforeAll)) {
    abandonAssertionScope();
    return false;
  }
  if (!executeHookKind(chain, HookKind.BeforeEach)) {
    abandonAssertionScope();
    return false;
  }

  const previousNode = currentNode;
  const previousRunOnly = getActiveRunOnly();
  stagedNodeForInvocation = node;
  const nodeTrapped = didCallbackTrap(invokeStagedNodeCallback);
  stagedNodeForInvocation = null;
  setCurrentNode(previousNode);
  setActiveRunOnly(previousRunOnly);
  if (nodeTrapped) {
    nodeFail(nodeIndex, resolveFailureKind());
    abandonAssertionScope();
    return false;
  }

  markActiveNodeCallbackPassed();
  if (!executeHookKind(chain, HookKind.AfterEach, true)) {
    abandonAssertionScope();
    return false;
  }
  if (!executeHookKind(chain, HookKind.AfterAll, true)) {
    abandonAssertionScope();
    return false;
  }
  stagedHookRegistration = null;
  stagedNodeForInvocation = null;
  const scopeTrapped = didCallbackTrap(endAssertionScope);
  if (scopeTrapped) {
    nodeFail(nodeIndex, resolveFailureKind());
    abandonAssertionScope();
    return false;
  }
  nodePass(nodeIndex);
  return true;
}
