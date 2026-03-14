# `jest` Adapter TODO

Current limitation:

- function mocks, spies, and call-tracking matchers such as `toBeCalled(...)`,
  `toHaveBeenCalled(...)`, and `toHaveBeenCalledTimes(...)` are unsupported
  until AssemblyScript has closure support that can model those APIs
  coherently
- Promise-based matchers and helpers such as `.resolves`, `.rejects`, or async
  test completion via returned Promises are unsupported until AssemblyScript
  has Promise support that can model those APIs coherently

- [ ] Define the `jest` declaration surface to expose from this `--lib` entry point.
- [ ] Map `test`, `describe`, `skip`, `todo`, and lifecycle APIs onto the shared internal declarations.
- [ ] Keep adapter-specific overloads and naming inside this folder.
- [ ] Add initial source files and a minimal traversal fixture.
