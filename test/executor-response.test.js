const assert = require('assert');
const { executeCode } = require('../executor');

if (process.env.RUN_EXECUTOR_INTEGRATION !== 'true') {
  console.log('Skipped executor response integration test.');
  process.exit(0);
}

process.env.ENABLE_CPP = 'true';

const failingCxxTest = `
#include <cxxtest/TestSuite.h>
#include <iostream>
#include <sstream>
class CppResultTest : public CxxTest::TestSuite {
public:
  void testOutput() {
    std::ostringstream output;
    std::streambuf* original = std::cout.rdbuf(output.rdbuf());
    program_main();
    std::cout.rdbuf(original);
    TS_ASSERT_EQUALS("expected", output.str());
  }
};
`;

async function run() {
  const compilationError = await executeCode('cpp', 'int main( { return 0; }', '', '', false);
  assert.strictEqual(compilationError.state, 'compile_error');
  assert.ok(compilationError.compilation_error);
  assert.strictEqual(compilationError.runtime_error, '');
  assert.strictEqual(compilationError.tests_run, 0);

  const assertionFailure = await executeCode(
    'cpp',
    '#include <iostream>\nint main() { std::cout << "actual"; return 0; }',
    '',
    '',
    true,
    failingCxxTest
  );
  assert.strictEqual(assertionFailure.state, 'failed');
  assert.strictEqual(assertionFailure.tests_run, 1);
  assert.strictEqual(assertionFailure.passed, 0);
  assert.strictEqual(assertionFailure.failed, 1);
  assert.strictEqual(assertionFailure.runtime_error, '');
  assert.ok(assertionFailure.failure_details[0].error_message.includes('AssertionError'));
  assert.ok(assertionFailure.failure_details[0].rawout.includes('Expected'));

  const outputMismatch = await executeCode(
    'cpp',
    '#include <iostream>\nint main() { std::cout << "actual"; return 0; }',
    '',
    'expected',
    false
  );
  assert.strictEqual(outputMismatch.state, 'failed');
  assert.strictEqual(outputMismatch.compilation_error, '');
  assert.strictEqual(outputMismatch.runtime_error, '');
  assert.strictEqual(outputMismatch.failure_details[0].expected, 'expected');
  assert.strictEqual(outputMismatch.failure_details[0].received, 'actual');

  console.log('Passed compiler, CxxTest, and output-mismatch response integration tests.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
