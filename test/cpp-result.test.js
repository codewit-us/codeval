const assert = require('assert');
const { buildCppTestResponse, parseCppTestOutput } = require('../executor');

const oneTestFailure = `Running cxxtest tests (1 test)
test_program.h:15: Error: Expected (expected == "soccer"), found (actual != "hi")
Failed 1 and Skipped 0 of 1 test`;

const pluralFailure = `Running cxxtest tests (2 tests)
test_program.h:15: Error: Expected (expected == "soccer"), found (actual != "hi")
Failed 1 and Skipped 0 of 2 tests`;

for (const [name, output, total] of [
  ['singular failure summary', oneTestFailure, 1],
  ['plural failure summary', pluralFailure, 2],
]) {
  const result = parseCppTestOutput(output, output, '');
  assert.strictEqual(result.tests_run, total, name);
  assert.strictEqual(result.passed, total - 1, name);
  assert.strictEqual(result.failed, 1, name);
  assert.ok(result.failure_details[0].error_message.includes('Expected'), name);
}

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
assert.ok(assertionResponse.failure_details[0].rawout.includes('Expected'));

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
