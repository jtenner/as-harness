import { DeclarationMode, HookKind } from "../internal/imports";
import {
  declareHook,
  declareModifiedSuite,
  declareModifiedTest,
  declareSuite,
  declareTest,
} from "./parse";
import { HookFn, SuiteFn, TestFn } from "./types";

export * from "./types";

export function test(
  name: string = "",
  callback: TestFn | null = null,
): void {
  declareTest(name, callback);
}

export namespace test {
  export function only(
    name: string = "",
    callback: TestFn | null = null,
  ): void {
    declareModifiedTest(name, callback, DeclarationMode.Normal, true);
  }

  export function skip(
    name: string = "",
    callback: TestFn | null = null,
  ): void {
    declareModifiedTest(name, callback, DeclarationMode.Skip);
  }

  export function todo(
    name: string = "",
    callback: TestFn | null = null,
  ): void {
    declareModifiedTest(name, callback, DeclarationMode.Todo);
  }
}

export function xtest(
  name: string = "",
  callback: TestFn | null = null,
): void {
  test.skip(name, callback);
}

export function fit(
  name: string = "",
  callback: TestFn | null = null,
): void {
  test.only(name, callback);
}

export function it(
  name: string = "",
  callback: TestFn | null = null,
): void {
  declareTest(name, callback);
}

export namespace it {
  export function only(
    name: string = "",
    callback: TestFn | null = null,
  ): void {
    declareModifiedTest(name, callback, DeclarationMode.Normal, true);
  }

  export function skip(
    name: string = "",
    callback: TestFn | null = null,
  ): void {
    declareModifiedTest(name, callback, DeclarationMode.Skip);
  }

  export function todo(
    name: string = "",
    callback: TestFn | null = null,
  ): void {
    declareModifiedTest(name, callback, DeclarationMode.Todo);
  }
}

export function xit(
  name: string = "",
  callback: TestFn | null = null,
): void {
  it.skip(name, callback);
}

export function describe(
  name: string = "",
  callback: SuiteFn | null = null,
): void {
  declareSuite(name, callback);
}

export namespace describe {
  export function only(
    name: string = "",
    callback: SuiteFn | null = null,
  ): void {
    declareModifiedSuite(name, callback, DeclarationMode.Normal, true);
  }

  export function skip(
    name: string = "",
    callback: SuiteFn | null = null,
  ): void {
    declareModifiedSuite(name, callback, DeclarationMode.Skip);
  }

  export function todo(
    name: string = "",
    callback: SuiteFn | null = null,
  ): void {
    declareModifiedSuite(name, callback, DeclarationMode.Todo);
  }
}

export function fdescribe(
  name: string = "",
  callback: SuiteFn | null = null,
): void {
  describe.only(name, callback);
}

export function xdescribe(
  name: string = "",
  callback: SuiteFn | null = null,
): void {
  describe.skip(name, callback);
}

export function beforeAll(callback: HookFn | null = null): void {
  declareHook(HookKind.BeforeAll, callback);
}

export function afterAll(callback: HookFn | null = null): void {
  declareHook(HookKind.AfterAll, callback);
}

export function beforeEach(callback: HookFn | null = null): void {
  declareHook(HookKind.BeforeEach, callback);
}

export function afterEach(callback: HookFn | null = null): void {
  declareHook(HookKind.AfterEach, callback);
}
