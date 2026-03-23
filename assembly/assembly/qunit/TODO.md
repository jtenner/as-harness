# `qunit` Adapter TODO

Status: bundled thin synchronous adapter shipped.
Current surface plan is documented in [docs/020-2026-03-23-qunit-adapter-interface.md](../../../docs/020-2026-03-23-qunit-adapter-interface.md).

Implemented so far:

- `qunit-001`: add the interface note, replace the old `qnit` placeholder, and
  commit the live implementation slices
- `qunit-002`: ship the declaration, module, and hook shell plus internal proof
- `qunit-003`: add the shipped `Assert` surface plus one cross-host smoke
  fixture
- wire the shipped sync slice into the bundled CLI library set, compile
  rewriting, and direct CLI proof
- add internal declaration plus assertion proof and one cross-host smoke
  fixture that executes the QUnit slice through the shared hosts

Constraint: keep the adapter honest about current runtime limits; async
assertions, Promise-returning tests and hooks, `test.each(...)`, options-object
module overloads, dynamic JS `this` context, property-specific assertion
families, and reporter/config callbacks stay deferred until the shared runtime
can represent those semantics directly.
