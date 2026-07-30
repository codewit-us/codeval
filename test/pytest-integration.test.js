const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildPytestInvocation, parsePytestOutput } = require('../executor');

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'codeval-pytest-'));
const testPath = path.join(tempDirectory, 'test_program.py');
const versionResult = spawnSync('pytest', ['--version'], { encoding: 'utf8' });
const pytestVersion = (versionResult.stdout || versionResult.stderr).trim();

try {
  const testCode = `
def test_long_collection_diff():
    actual = {"items": [f"actual-{index:03d}" for index in range(80)]}
    expected = {"items": [f"expected-{index:03d}" for index in range(80)]}
    assert actual == expected
`;
  fs.writeFileSync(testPath, testCode);

  const defaultResult = spawnSync('pytest', [testPath], {
    cwd: tempDirectory,
    encoding: 'utf8',
  });
  assert.strictEqual(defaultResult.status, 1, `default pytest failed unexpectedly (${pytestVersion})`);
  assert.match(
    defaultResult.stdout,
    /truncated|use ['"]?-v{1,2}['"]? to get more diff/i,
    `test data did not trigger default pytest truncation (${pytestVersion})`
  );

  const invocation = buildPytestInvocation(tempDirectory);
  const verboseResult = spawnSync(invocation.command, invocation.args, {
    cwd: tempDirectory,
    encoding: 'utf8',
  });
  assert.strictEqual(verboseResult.status, 1, `verbose pytest failed unexpectedly (${pytestVersion})`);
  assert.match(verboseResult.stdout, /Full diff:/, `full diff was not emitted (${pytestVersion})`);
  assert.match(verboseResult.stdout, /actual-000/, `start of actual diff is missing (${pytestVersion})`);
  assert.match(verboseResult.stdout, /actual-079/, `end of actual diff is missing (${pytestVersion})`);
  assert.match(verboseResult.stdout, /expected-000/, `start of expected diff is missing (${pytestVersion})`);
  assert.match(verboseResult.stdout, /expected-079/, `end of expected diff is missing (${pytestVersion})`);
  assert.doesNotMatch(verboseResult.stdout, /Use -v to get more diff/i);
  assert.doesNotMatch(verboseResult.stdout, /Full output truncated/i);

  const parsed = parsePytestOutput(verboseResult.stdout, verboseResult.stderr, verboseResult.status);
  assert.strictEqual(parsed.failed, 1);
  assert.strictEqual(parsed.failure_details.length, 1);
  assert.match(parsed.failure_details[0].error_message, /actual-000/);
  assert.match(parsed.failure_details[0].error_message, /actual-079/);
  assert.match(parsed.failure_details[0].error_message, /expected-000/);
  assert.match(parsed.failure_details[0].error_message, /expected-079/);
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

console.log(`Passed pytest integration regression with ${pytestVersion}.`);
