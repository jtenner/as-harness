
# Roadmap

Here is a list of all the test frameworks and assertion libraries that we want to support.

Current explicit limitation:

- function mocking, spies, and call-tracking assertions such as
  `toBeCalled(...)`, `toHaveBeenCalled(...)`, or `toHaveBeenCalledTimes(...)`
  are not planned until AssemblyScript has closure support that can model those
  APIs coherently

| Name          | Kind           | URL starting point                                                              |
| ------------- | -------------- | ------------------------------------------------------------------------------- |
| `node:test`   | test structure | `https://nodejs.org/api/test.html` ([Node.js][1])                               |
| Jest          | test structure | `https://jestjs.io/docs/api` ([jestjs.io][2])                                   |
| Mocha         | test structure | `https://mochajs.org/` ([Mocha][3])                                             |
| Vitest        | test structure | `https://vitest.dev/api/` ([Vitest][4])                                         |
| AVA           | test structure | `https://github.com/avajs/ava/blob/main/docs/01-writing-tests.md` ([GitHub][5]) |
| tap           | test structure | `https://node-tap.org/` ([node-tap.org][6])                                     |
| tape          | test structure | `https://github.com/tape-testing/tape` ([GitHub][7])                            |
| uvu           | test structure | `https://github.com/lukeed/uvu/blob/master/docs/api.uvu.md` ([GitHub][8])       |
| Jasmine       | test structure | `https://jasmine.github.io/api/edge/global` ([jasmine.github.io][9])            |
| QUnit         | test structure | `https://qunitjs.com/` ([QUnit][10])                                            |
| `node:assert` | assert         | `https://nodejs.org/api/assert.html` ([Node.js][11])                            |
| Chai          | assert         | `https://www.chaijs.com/api/` ([chaijs.com][12])                                |

[1]: https://nodejs.org/api/test.html?utm_source=chatgpt.com "Test runner | Node.js v25.8.1 Documentation"
[2]: https://jestjs.io/docs/api?utm_source=chatgpt.com "Globals"
[3]: https://mochajs.org/?utm_source=chatgpt.com "Mocha | Classic, reliable, trusted."
[4]: https://vitest.dev/api/?utm_source=chatgpt.com "Test API Reference"
[5]: https://github.com/avajs/ava/blob/main/docs/01-writing-tests.md?utm_source=chatgpt.com "ava/docs/01-writing-tests.md at main · avajs/ava"
[6]: https://node-tap.org/?utm_source=chatgpt.com "node-tap"
[7]: https://github.com/tape-testing/tape?utm_source=chatgpt.com "tape-testing/tape: tap-producing test harness for node and ..."
[8]: https://github.com/lukeed/uvu/blob/master/docs/api.uvu.md?utm_source=chatgpt.com "uvu/docs/api.uvu.md at master · lukeed/uvu"
[9]: https://jasmine.github.io/api/edge/global?utm_source=chatgpt.com "Global"
[10]: https://qunitjs.com/?utm_source=chatgpt.com "QUnit"
[11]: https://nodejs.org/api/assert.html?utm_source=chatgpt.com "Assert | Node.js v25.8.1 Documentation"
[12]: https://www.chaijs.com/api/?utm_source=chatgpt.com "API Reference"
