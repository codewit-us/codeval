const assert = require('assert');
const { buildCppTestHeader } = require('../executor');

const legacyFixture = `
#include <cxxtest/TestSuite.h>
#define main program_main
#include "program.cpp"
#undef main
class LegacyTest : public CxxTest::TestSuite {};
`;

const noArgumentMain = 'int add(int a, int b) { return a + b; }\nint main() { return add(2, 3); }';
const voidMain = 'int main(void) { return 0; }';
const argumentMain = 'int main(int argc, char** argv) { return argc; }';
const unnamedArgumentMain = 'int main(int, char**) { return 0; }';
const arrayArgumentMain = 'int main(int argc, char* argv[]) { return argc; }';
const noMain = 'int add(int a, int b) { return a + b; }';
const harnessFixture = '#include <cxxtest/TestSuite.h>\nclass HarnessTest : public CxxTest::TestSuite {};';

const legacyHeader = buildCppTestHeader(noArgumentMain, legacyFixture);
assert.ok(legacyHeader.includes('int add(int a, int b);'));
assert.ok(!legacyHeader.includes('int main();'));
assert.ok(legacyHeader.includes(legacyFixture.trim()));

const noArgumentHeader = buildCppTestHeader(noArgumentMain, harnessFixture);
assert.ok(noArgumentHeader.includes('#define main codeval_student_main'));
assert.ok(noArgumentHeader.includes('return codeval_invoke_main(codeval_student_main);'));
assert.ok(!noArgumentHeader.includes('int main();'));

const voidHeader = buildCppTestHeader(voidMain, harnessFixture);
assert.ok(voidHeader.includes('std::is_invocable_v<EntryPoint>'));

const argumentHeader = buildCppTestHeader(argumentMain, harnessFixture);
assert.ok(argumentHeader.includes('std::is_invocable_v<EntryPoint, int, char**>'));
assert.ok(!argumentHeader.includes('int main(int argc, char** argv);'));

const unnamedArgumentHeader = buildCppTestHeader(unnamedArgumentMain, harnessFixture);
assert.ok(unnamedArgumentHeader.includes('return entryPoint(0, nullptr);'));

const arrayArgumentHeader = buildCppTestHeader(arrayArgumentMain, harnessFixture);
assert.ok(arrayArgumentHeader.includes('return entryPoint(0, nullptr);'));

const noMainHeader = buildCppTestHeader(noMain, harnessFixture);
assert.ok(noMainHeader.includes('#include "program.cpp"'));
assert.ok(!noMainHeader.includes('inline int program_main()'));

const commentedMainHeader = buildCppTestHeader('// int main() { return 0; }', harnessFixture);
assert.ok(!commentedMainHeader.includes('inline int program_main()'));

const stringMainHeader = buildCppTestHeader('const char* text = "int main() { return 0; }";', harnessFixture);
assert.ok(!stringMainHeader.includes('inline int program_main()'));

console.log('Passed C++ CxxTest harness regression tests.');
