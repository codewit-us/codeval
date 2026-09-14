const test = require('node:test');
const assert = require('node:assert/strict');

const { recordExecutionError, runProgram } = require('../executor');

test('reports a structured timeout and preserves partial output', async () => {
  await assert.rejects(
    runProgram(
      process.execPath,
      ['-e', 'process.stdout.write("started"); process.stderr.write("waiting"); setInterval(() => {}, 1000);'],
      '',
      50
    ),
    (error) => {
      assert.equal(error.code, 'EXECUTION_TIMEOUT');
      assert.equal(error.stdout, 'started');
      assert.equal(error.stderr, 'waiting');
      assert.equal(error.exitCode, null);
      return true;
    }
  );
});

test('maps only structured timeout errors to the timeout response flag', () => {
  const timeoutResponse = {};
  recordExecutionError(
    timeoutResponse,
    Object.assign(new Error('Execution timed out'), {
      code: 'EXECUTION_TIMEOUT',
      stdout: 'started',
      stderr: 'waiting',
      exitCode: null,
    }),
    'runtime_error'
  );

  assert.equal(timeoutResponse.state, 'failed');
  assert.equal(timeoutResponse.execution_time_exceeded, true);
  assert.equal(timeoutResponse.runtime_error, 'Execution timed out');
  assert.equal(timeoutResponse.stdout, 'started');
  assert.equal(timeoutResponse.stderr, 'waiting');

  const ordinaryFailureResponse = {};
  recordExecutionError(
    ordinaryFailureResponse,
    Object.assign(new Error('Execution timed out'), { exitCode: 1 }),
    'runtime_error'
  );

  assert.equal(ordinaryFailureResponse.state, 'runtime_error');
  assert.equal(ordinaryFailureResponse.execution_time_exceeded, false);
});
