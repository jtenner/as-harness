# `jasmine` Adapter TODO

Current limitation:

- spies and call-tracking matchers such as `toBeCalled(...)`,
  `toHaveBeenCalled(...)`, and `toHaveBeenCalledTimes(...)` are unsupported
  until AssemblyScript has closure support that can model those APIs
  coherently
- Promise-based async expectations and Promise-returning spec completion are
  unsupported until AssemblyScript has Promise support that can model those
  APIs coherently

- [ ] Define the `jasmine` declaration surface to expose from this `--lib` entry point.
- [ ] Map `it`, `describe`, skip/pending variants, and lifecycle APIs onto the shared internal declarations.
- [ ] Keep adapter-specific overloads and naming inside this folder.
- [ ] Add initial source files and a minimal traversal fixture.
