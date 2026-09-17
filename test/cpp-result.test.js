const assert = require('assert');
const { buildCppTestResponse, parseCppTestOutput } = require('../executor');

const oneTestFailure = `Running cxxtest tests (1 test)
test_program.h:15: Error: Expected (expected == "soccer"), found (actual != "hi")
Failed 1 and Skipped 0 of 1 test`;

const pluralFailure = `Running cxxtest tests (2 tests)
test_program.h:15: Error: Expected (expected == "soccer"), found (actual != "hi")
Failed 1 and Skipped 0 of 2 tests`;

const assertionFailure = `Running cxxtest tests (1 test)
test_program.h:15: Error: Assertion failed: false
Failed 1 and Skipped 0 of 1 test`;

const multipleDiagnostics = `Running cxxtest tests (2 tests)
test_program.h:15: Error: Assertion failed: first student-facing message
test_program.h:16: Error: Assertion failed: second student-facing message
Failed 1 and Skipped 0 of 2 tests`;

const outputMismatchFailures = `Running cxxtest tests (3 tests)
In codewit_test::testSuccessfulLogin:
test_program.h:38: Error: Expected (removeWhitespace(expected) == removeWhitespace(actual)), found ("EnterauserEnterapasswordLoginsuccessful!juan" != "EnterauserEnterapasswordLoginsuccessful!")
In codewit_test::testWrongPassword:
test_program.h:67: Error: Expected (removeWhitespace(expected) == removeWhitespace(actual)), found ("EnterauserEnterapasswordOneofthethingsyouenteredisincorrect.Loginfailed" != "EnterauserEnterapasswordOneofthethingsenteredisincorrectLoginfailed")
.
Failed 2 and Skipped 0 of 3 tests
Success rate: 33%`;

const escapedOutputMismatch = `Running cxxtest tests (1 test)
test_program.h:15: Error: Expected (expected == actual), found ("say \\"hello\\"\\\\n" != "")
Failed 1 and Skipped 0 of 1 test`;

const malformedOutputMismatch = `Running cxxtest tests (1 test)
test_program.h:15: Error: Expected (expected == actual), found ("expected" != actual)
Failed 1 and Skipped 0 of 1 test`;

for (const [name, output, total] of [
  ['singular failure summary', oneTestFailure, 1],
  ['plural failure summary', pluralFailure, 2],
]) {
  const result = parseCppTestOutput(output, output, '');
  assert.strictEqual(result.tests_run, total, name);
  assert.strictEqual(result.passed, total - 1, name);
  assert.strictEqual(result.failed, 1, name);
  assert.strictEqual(
    result.failure_details[0].error_message,
    'Error: Expected (expected == "soccer"), found (actual != "hi")',
    name
  );
}

const assertionResult = parseCppTestOutput(assertionFailure, assertionFailure, '');
assert.strictEqual(assertionResult.failure_details[0].error_message, 'Error: Assertion failed: false');

const multipleDiagnosticsResult = parseCppTestOutput(multipleDiagnostics, multipleDiagnostics, '');
assert.strictEqual(multipleDiagnosticsResult.failed, 1);
assert.strictEqual(multipleDiagnosticsResult.failure_details.length, 2);
assert.deepStrictEqual(
  multipleDiagnosticsResult.failure_details.map((failure) => failure.error_message),
  [
    'Error: Assertion failed: first student-facing message',
    'Error: Assertion failed: second student-facing message',
  ]
);

const outputMismatchResult = parseCppTestOutput(outputMismatchFailures, outputMismatchFailures, '');
assert.strictEqual(outputMismatchResult.tests_run, 3);
assert.strictEqual(outputMismatchResult.passed, 1);
assert.strictEqual(outputMismatchResult.failed, 2);
assert.strictEqual(outputMismatchResult.failure_details.length, 2);
assert.deepStrictEqual(
  outputMismatchResult.failure_details.map(({ expected, received }) => ({ expected, received })),
  [
    {
      expected: 'EnterauserEnterapasswordLoginsuccessful!juan',
      received: 'EnterauserEnterapasswordLoginsuccessful!',
    },
    {
      expected: 'EnterauserEnterapasswordOneofthethingsyouenteredisincorrect.Loginfailed',
      received: 'EnterauserEnterapasswordOneofthethingsenteredisincorrectLoginfailed',
    },
  ]
);
assert.match(outputMismatchResult.failure_details[0].rawout, /testSuccessfulLogin/);
assert.match(outputMismatchResult.failure_details[0].rawout, /testWrongPassword/);
assert.match(outputMismatchResult.failure_details[0].rawout, /Failed 2 and Skipped 0 of 3 tests/);

const escapedOutputMismatchResult = parseCppTestOutput(
  escapedOutputMismatch,
  escapedOutputMismatch,
  ''
);
assert.strictEqual(escapedOutputMismatchResult.failure_details[0].expected, 'say \\"hello\\"\\\\n');
assert.strictEqual(escapedOutputMismatchResult.failure_details[0].received, '');

const malformedOutputMismatchResult = parseCppTestOutput(
  malformedOutputMismatch,
  malformedOutputMismatch,
  ''
);
assert.strictEqual(malformedOutputMismatchResult.failure_details[0].expected, '');
assert.strictEqual(malformedOutputMismatchResult.failure_details[0].received, '');

const assertionResponse = buildCppTestResponse(
  { state: 'failed', runtime_error: 'Execution failed with code 1', failure_details: [] },
  { stdout: oneTestFailure, stderr: '', exitCode: 1 }
);
assert.strictEqual(assertionResponse.state, 'failed');
assert.strictEqual(assertionResponse.runtime_error, '');
assert.strictEqual(assertionResponse.tests_run, 1);
assert.strictEqual(assertionResponse.passed, 0);
assert.strictEqual(assertionResponse.failed, 1);
assert.strictEqual(assertionResponse.failure_details.length, 1);
assert.strictEqual(
  assertionResponse.failure_details[0].error_message,
  'Error: Expected (expected == "soccer"), found (actual != "hi")'
);

const summaryOnlyFailure = buildCppTestResponse(
  { state: 'failed', runtime_error: 'Execution failed with code 1', failure_details: [] },
  { stdout: 'Running cxxtest tests (1 test)\nFailed 1 and Skipped 0 of 1 test', stderr: '', exitCode: 1 }
);
assert.strictEqual(summaryOnlyFailure.failure_details[0].error_message, 'Failed 1 and Skipped 0 of 1 test');

const runnerFailure = buildCppTestResponse(
  { state: 'failed', runtime_error: 'Execution failed with code 139', failure_details: [] },
  { stdout: 'segmentation fault', stderr: '', exitCode: 139 }
);
assert.strictEqual(runnerFailure.state, 'failed');
assert.strictEqual(runnerFailure.runtime_error, 'Execution failed with code 139');
assert.strictEqual(runnerFailure.tests_run, 1);
assert.strictEqual(runnerFailure.failed, 1);
assert.strictEqual(runnerFailure.failure_details[0].error_message, 'Execution failed with code 139');

console.log('Passed C++ result classification regression tests.');
