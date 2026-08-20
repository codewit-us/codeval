const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { buildCppTestHeader } = require('../executor');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
}

if (spawnSync('cxxtestgen', ['--version'], { encoding: 'utf8' }).error) {
  console.log('Skipped C++ CxxTest smoke tests: cxxtestgen is unavailable.');
  process.exit(0);
}

const fixture = `
#include <cxxtest/TestSuite.h>
class CppHarnessTest : public CxxTest::TestSuite {
public:
  void testProgramMain() {
    TS_ASSERT_EQUALS(program_main(), 0);
  }
};
`;

const legacyFixture = `
#include <cxxtest/TestSuite.h>
#define main program_main
#include "program.cpp"
#undef main
class LegacyCppHarnessTest : public CxxTest::TestSuite {
public:
  void testProgramMain() {
    TS_ASSERT_EQUALS(program_main(), 0);
  }
};
`;

const outputFixture = `
#include <cxxtest/TestSuite.h>
#include <iostream>
#include <sstream>
class OutputCppHarnessTest : public CxxTest::TestSuite {
public:
  void testProgramMainOutput() {
    std::ostringstream output;
    std::streambuf* original = std::cout.rdbuf(output.rdbuf());
    int exitCode = program_main();
    std::cout.rdbuf(original);
    TS_ASSERT_EQUALS(exitCode, 0);
    TS_ASSERT_EQUALS(output.str(), "Hello, CodeEval!\\n");
  }
};
`;

const cases = [
  ['no-argument main', 'int main() { return 0; }', fixture],
  ['void main', 'int main(void) { return 0; }', fixture],
  ['argument main', 'int main(int argc, char** argv) { return argc; }', fixture],
  ['unnamed argument main', 'int main(int, char**) { return 0; }', fixture],
  ['array argument main', 'int main(int argc, char* argv[]) { return argc; }', fixture],
  ['captured standard output', '#include <iostream>\nint main(int argc, char** argv) { std::cout << "Hello, CodeEval!\\n"; return argc; }', outputFixture],
  ['legacy fixture', 'int main() { return 0; }', legacyFixture],
];

async function runCase([name, program, testCode]) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codeval-cpp-harness-'));

  try {
    await fs.writeFile(path.join(directory, 'program.cpp'), program);
    await fs.writeFile(
      path.join(directory, 'test_program.h'),
      buildCppTestHeader(program, testCode)
    );
    run('cxxtestgen', ['--error-printer', '-o', 'runner.cpp', 'test_program.h'], directory);
    run('g++', ['-std=c++20', '-o', 'runner', 'runner.cpp'], directory);
    run(path.join(directory, 'runner'), [], directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }

  console.log(`Passed C++ CxxTest smoke test: ${name}.`);
}

Promise.all(cases.map(runCase)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
