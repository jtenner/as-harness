import { NodeDeclarationOptions, declareSuiteNode, declareTestNode, registerHook } from "../internal/api";
import { DeclarationMode, HookKind } from "../internal/imports";
import { HookFn, SuiteFn, TestFn } from "./types";

function createDeclarationOptions(
  mode: DeclarationMode = DeclarationMode.Normal,
  only: bool = false,
  expectFailure: bool = false,
): NodeDeclarationOptions {
  const options = new NodeDeclarationOptions();
  options.mode = mode;
  options.only = only;
  options.expectFailure = expectFailure;
  return options;
}

export function declareTest(
  name: string = "",
  callback: TestFn | null = null,
): void {
  declareTestNode(name, callback);
}

export function declareModifiedTest(
  name: string = "",
  callback: TestFn | null = null,
  mode: DeclarationMode = DeclarationMode.Normal,
  only: bool = false,
  expectFailure: bool = false,
): void {
  declareTestNode(
    name,
    callback,
    createDeclarationOptions(mode, only, expectFailure),
  );
}

export function declareSuite(
  name: string = "",
  callback: SuiteFn | null = null,
): void {
  declareSuiteNode(name, callback);
}

export function declareModifiedSuite(
  name: string = "",
  callback: SuiteFn | null = null,
  mode: DeclarationMode = DeclarationMode.Normal,
  only: bool = false,
  expectFailure: bool = false,
): void {
  declareSuiteNode(
    name,
    callback,
    createDeclarationOptions(mode, only, expectFailure),
  );
}

export function declareHook(
  kind: HookKind,
  callback: HookFn | null = null,
): void {
  registerHook(kind, callback);
}
