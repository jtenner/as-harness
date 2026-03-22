# `mocha` Adapter TODO

Status: planned for the `v0.4.0` slice.

First slice:

- `describe` / `it` declarations
- skip/todo variants
- lifecycle hooks
- one traversal fixture

Constraints:

- keep lowering into the shared runtime and ABI
- keep the first slice synchronous and honest about unsupported async behavior
- do not promise broad Chai parity in the first shipped adapter pass
