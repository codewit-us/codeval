const assert = require('assert');
const { parsePytestOutput } = require('../executor');

const testCases = [
  {
    name: 'returns only a custom assertion message',
    output: `============================= test session starts ==============================
=================================== FAILURES ===================================
______________________________ test_hat_variables ______________________________

    def test_hat_variables():
>       assert hasattr(program, "HatName"), "there should be a variable named exactly HatName"
E       AssertionError: there should be a variable named exactly HatName

test_program.py:5: AssertionError
=========================== short test summary info ============================
FAILED test_program.py::test_hat_variables - AssertionError: there should be a variable named exactly HatName
============================== 1 failed in 0.02s ===============================`,
    expected: {
      tests_run: 1,
      passed: 0,
      failed: 1,
      messages: ['there should be a variable named exactly HatName'],
      expectedValues: [''],
      receivedValues: [''],
    },
  },
  {
    name: 'preserves multiline custom assertion messages',
    output: `=================================== FAILURES ===================================
________________________________ test_message _________________________________

    def test_message():
>       assert False, "first instruction\\nsecond instruction"
E       AssertionError: first instruction
E       second instruction

test_program.py:2: AssertionError
=========================== short test summary info ============================
FAILED test_program.py::test_message - AssertionError: first instruction
============================== 1 failed in 0.01s ===============================`,
    expected: {
      tests_run: 1,
      passed: 0,
      failed: 1,
      messages: ['first instruction\nsecond instruction'],
      expectedValues: [''],
      receivedValues: [''],
    },
  },
  {
    name: 'preserves all default assertion detail lines',
    output: `=================================== FAILURES ===================================
__________________________________ test_value __________________________________

    def test_value():
>       assert "actual" == "expected"
E       AssertionError: assert 'actual' == 'expected'
E         - expected
E         + actual

test_program.py:2: AssertionError
=========================== short test summary info ============================
FAILED test_program.py::test_value - AssertionError: assert 'actual' == 'expected'
============================== 1 failed in 0.01s ===============================`,
    expected: {
      tests_run: 1,
      passed: 0,
      failed: 1,
      messages: ["AssertionError: assert 'actual' == 'expected'\n  - expected\n  + actual"],
      expectedValues: ["'expected'"],
      receivedValues: ["'actual'"],
    },
  },
  {
    name: 'preserves exception type and message',
    output: `=================================== FAILURES ===================================
______________________________ test_hat_variables ______________________________

    def test_hat_variables():
>       assert program.HatName == "Veracruz"
E       AttributeError: module 'program' has no attribute 'HatName'

test_program.py:5: AttributeError
=========================== short test summary info ============================
FAILED test_program.py::test_hat_variables - AttributeError: module 'program' has no attribute 'HatName'
============================== 1 failed in 0.02s ===============================`,
    expected: {
      tests_run: 1,
      passed: 0,
      failed: 1,
      messages: ["AttributeError: module 'program' has no attribute 'HatName'"],
      expectedValues: [''],
      receivedValues: [''],
    },
  },
  {
    name: 'returns distinct details for multiple failures',
    output: `=================================== FAILURES ===================================
_________________________________ test_first __________________________________

    def test_first():
>       assert False, "first failure"
E       AssertionError: first failure

test_program.py:2: AssertionError
_________________________________ test_second _________________________________

    def test_second():
>       raise ValueError("second failure")
E       ValueError: second failure

test_program.py:5: ValueError
=========================== short test summary info ============================
FAILED test_program.py::test_first - AssertionError: first failure
FAILED test_program.py::test_second - ValueError: second failure
============================== 2 failed in 0.01s ===============================`,
    expected: {
      tests_run: 2,
      passed: 0,
      failed: 2,
      messages: ['first failure', 'ValueError: second failure'],
      expectedValues: ['', ''],
      receivedValues: ['', ''],
    },
  },
  {
    name: 'counts collection errors as one failure',
    output: `==================================== ERRORS ====================================
___________________ ERROR collecting test_program.py ___________________
test_program.py:1: in <module>
    assert (
E   SyntaxError: '(' was never closed
=========================== short test summary info ============================
ERROR test_program.py
!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
=============================== 1 error in 0.03s ===============================`,
    expected: {
      tests_run: 1,
      passed: 0,
      failed: 1,
      messages: ["SyntaxError: '(' was never closed"],
      expectedValues: [''],
      receivedValues: [''],
    },
  },
  {
    name: 'counts mixed failed tests and errors',
    output: `=================================== FAILURES ===================================
_________________________________ test_value __________________________________

    def test_value():
>       assert False, "assertion failure"
E       AssertionError: assertion failure

test_program.py:2: AssertionError
==================================== ERRORS ====================================
_____________________ ERROR at setup of test_setup_error ______________________

    @pytest.fixture
    def broken_fixture():
>       raise RuntimeError("setup failure")
E       RuntimeError: setup failure

test_program.py:6: RuntimeError
=========================== short test summary info ============================
FAILED test_program.py::test_value - AssertionError: assertion failure
ERROR test_program.py::test_setup_error - RuntimeError: setup failure
===================== 1 passed, 1 failed, 1 error in 0.01s =====================`,
    expected: {
      tests_run: 3,
      passed: 1,
      failed: 2,
      messages: ['assertion failure', 'RuntimeError: setup failure'],
      expectedValues: ['', ''],
      receivedValues: ['', ''],
    },
  },
  {
    name: 'counts passing tests',
    output: `============================= test session starts ==============================
collected 2 items

test_program.py ..                                                       [100%]

============================== 2 passed in 0.01s ===============================`,
    expected: {
      tests_run: 2,
      passed: 2,
      failed: 0,
      messages: [],
      expectedValues: [],
      receivedValues: [],
    },
  },
];

for (const testCase of testCases) {
  const result = parsePytestOutput(testCase.output, testCase.output, '');

  assert.strictEqual(result.tests_run, testCase.expected.tests_run, testCase.name);
  assert.strictEqual(result.passed, testCase.expected.passed, testCase.name);
  assert.strictEqual(result.failed, testCase.expected.failed, testCase.name);
  assert.strictEqual(result.failure_details.length, testCase.expected.failed, testCase.name);
  assert.deepStrictEqual(
    result.failure_details.map((failure) => failure.error_message),
    testCase.expected.messages,
    testCase.name
  );
  assert.deepStrictEqual(
    result.failure_details.map((failure) => failure.expected),
    testCase.expected.expectedValues,
    testCase.name
  );
  assert.deepStrictEqual(
    result.failure_details.map((failure) => failure.received),
    testCase.expected.receivedValues,
    testCase.name
  );
}

console.log(`Passed ${testCases.length} pytest parser regression tests.`);
