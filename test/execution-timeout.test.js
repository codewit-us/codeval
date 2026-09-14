const test = require('node:test');
const assert = require('node:assert/strict');

const {
  recordExecutionError,
  runProgram,
  terminateProcessGroup,
} = require('../executor');

test('reports a structured timeout and preserves partial output', async () => {
  await assert.rejects(
    runProgram(
      process.execPath,
      ['-e', 'process.stdout.write("started"); process.stderr.write("waiting"); setInterval(() => {}, 1000);'],
      '',
      150
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
  const timeoutRecorded = recordExecutionError(
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
  assert.equal(timeoutRecorded, true);

  const ordinaryFailureResponse = {};
  const ordinaryFailureRecorded = recordExecutionError(
    ordinaryFailureResponse,
    Object.assign(new Error('Execution timed out'), { exitCode: 1 }),
    'runtime_error'
  );

  assert.equal(ordinaryFailureResponse.state, 'runtime_error');
  assert.equal(ordinaryFailureResponse.execution_time_exceeded, false);
  assert.equal(ordinaryFailureRecorded, false);
});

test('schedules a force kill for the process group after graceful termination', () => {
  const signals = [];
  let forceKill = null;
  const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };

  terminateProcessGroup(
    123,
    (pid, signal) => signals.push([pid, signal]),
    (callback) => {
      forceKill = callback;
      return timer;
    }
  );

  assert.deepEqual(signals, [[-123, 'SIGTERM']]);
  assert.equal(timer.unrefCalled, true);

  forceKill();
  assert.deepEqual(signals, [
    [-123, 'SIGTERM'],
    [-123, 'SIGKILL'],
  ]);
});
