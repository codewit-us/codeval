const assert = require('assert');
const { executeCode } = require('../executor');

if (process.env.RUN_EXECUTOR_INTEGRATION !== 'true') {
  console.log('Skipped executor response integration test.');
  process.exit(0);
}

process.env.ENABLE_CPP = 'true';

executeCode('cpp', 'int main( { return 0; }', '', '', false)
  .then((response) => {
    assert.strictEqual(response.state, 'compile_error');
    assert.ok(response.compilation_error);
    assert.strictEqual(response.runtime_error, '');
    assert.strictEqual(response.tests_run, 0);
    console.log('Passed compilation-error response integration test.');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
