const test = require('node:test');
const assert = require('node:assert/strict');

const { parsePytestOutput, extractPytestShortSummaryTarget } = require('./pytest-parser');

test('extracts the real technical message for pytest attribute failures', () => {
  const stdout = `
============================= test session starts ==============================
platform darwin -- Python 3.9.10, pytest-7.4.0, pluggy-1.2.0
collected 1 item

test_program.py F                                                       [100%]

=================================== FAILURES ===================================
______________________________ test_hat_variables ______________________________

    def test_hat_variables():
>       assert program.numberOfHats == 9
E       AttributeError: module 'program' has no attribute 'numberOfHats'

/tmp/test_program.py:4: AttributeError
=========================== short test summary info ============================
FAILED test_program.py::test_hat_variables
============================== 1 failed in 0.02s ===============================
  `.trim();

  const parsed = parsePytestOutput(stdout, '', 1);

  assert.equal(parsed.failed, 1);
  assert.equal(parsed.failure_details.length, 1);
  assert.equal(parsed.failure_details[0].test_case, 'test_hat_variables');
  assert.equal(
    parsed.failure_details[0].error_message,
    "AttributeError: module 'program' has no attribute 'numberOfHats'"
  );
  assert.match(parsed.failure_details[0].rawout, /FAILED test_program\.py::test_hat_variables/);
});

test('normalizes pytest short summary targets to the test name', () => {
  const stdout = `
FAILED ../../../../../../../var/folders/example/test_program.py::test_hat_variables
  `.trim();

  assert.equal(
    extractPytestShortSummaryTarget(stdout, 'FAILED'),
    'test_hat_variables'
  );
});

test('preserves custom assertion messages for hasattr-style lesson failures', () => {
  const stdout = `
============================= test session starts ==============================
platform linux -- Python 3.11.12, pytest-9.1.1, pluggy-1.6.0
collected 1 item

test_program.py F                                                        [100%]

=================================== FAILURES ===================================
______________________________ test_hat_variables ______________________________

    def test_hat_variables():
>       assert hasattr(program,"HatName"), "There should be a variable named exactly HatName"
E       AssertionError: There should be a variable named exactly HatName
E       assert False
E        +  where False = hasattr(program, 'HatName')

test_program.py:8: AssertionError
=========================== short test summary info ============================
FAILED test_program.py::test_hat_variables - AssertionError: There should be ...
============================== 1 failed in 0.01s ===============================
  `.trim();

  const parsed = parsePytestOutput(stdout, '', 1);

  assert.equal(parsed.failed, 1);
  assert.equal(parsed.failure_details.length, 1);
  assert.equal(
    parsed.failure_details[0].error_message,
    'AssertionError: There should be a variable named exactly HatName'
  );
  assert.equal(parsed.failure_details[0].expected, '');
  assert.equal(parsed.failure_details[0].received, '');
});

test('preserves custom assertion messages for printed dataframe regression cases', () => {
  const stdout = `
============================= test session starts ==============================
platform linux -- Python 3.11.12, pytest-9.1.1, pluggy-1.6.0
collected 1 item

test_program.py F                                                        [100%]

=================================== FAILURES ===================================
____________________________ test_describe_printed _____________________________

    def test_describe_printed(capsys):
>       assert part in out, f"Expected '{part}' in output, got:\\n{out}"
E       AssertionError: Expected 'count' in output, got:
E       0  1  2  3

test_program.py:12: AssertionError
=========================== short test summary info ============================
FAILED test_program.py::test_describe_printed - AssertionError: Expected 'cou...
============================== 1 failed in 0.01s ===============================
  `.trim();

  const parsed = parsePytestOutput(stdout, '', 1);

  assert.equal(parsed.failed, 1);
  assert.equal(parsed.failure_details.length, 1);
  assert.equal(parsed.failure_details[0].test_case, 'test_describe_printed');
  assert.equal(
    parsed.failure_details[0].error_message,
    "AssertionError: Expected 'count' in output, got:"
  );
});

test('extracts expected and received values for numeric equality assertions', () => {
  const stdout = `
============================= test session starts ==============================
platform linux -- Python 3.11.12, pytest-9.1.1, pluggy-1.6.0
collected 1 item

test_program.py F                                                        [100%]

=================================== FAILURES ===================================
______________________________ test_hat_variables ______________________________

    def test_hat_variables():
>       assert program.NumberOfHats == 9
E       assert 8 == 9

test_program.py:12: AssertionError
=========================== short test summary info ============================
FAILED test_program.py::test_hat_variables - assert 8 == 9
============================== 1 failed in 0.01s ===============================
  `.trim();

  const parsed = parsePytestOutput(stdout, '', 1);

  assert.equal(parsed.failure_details[0].error_message, 'Assertion failed: assert program.NumberOfHats == 9');
  assert.equal(parsed.failure_details[0].received, '8');
  assert.equal(parsed.failure_details[0].expected, '9');
});

test('extracts expected and received values for string equality assertions', () => {
  const stdout = `
============================= test session starts ==============================
platform linux -- Python 3.11.12, pytest-9.1.1, pluggy-1.6.0
collected 1 item

test_program.py F                                                        [100%]

=================================== FAILURES ===================================
______________________________ test_hat_variables ______________________________

    def test_hat_variables():
>       assert program.HatName == "Veracruz"
E       assert "Oaxaca" == "Veracruz"

test_program.py:10: AssertionError
=========================== short test summary info ============================
FAILED test_program.py::test_hat_variables - assert "Oaxaca" == "Veracruz"
============================== 1 failed in 0.01s ===============================
  `.trim();

  const parsed = parsePytestOutput(stdout, '', 1);

  assert.equal(parsed.failure_details[0].error_message, 'Assertion failed: assert program.HatName == "Veracruz"');
  assert.equal(parsed.failure_details[0].received, '"Oaxaca"');
  assert.equal(parsed.failure_details[0].expected, '"Veracruz"');
});

test('extracts expected and received values for float equality assertions', () => {
  const stdout = `
============================= test session starts ==============================
platform linux -- Python 3.11.12, pytest-9.1.1, pluggy-1.6.0
collected 1 item

test_program.py F                                                        [100%]

=================================== FAILURES ===================================
______________________________ test_hat_variables ______________________________

    def test_hat_variables():
>       assert program.CostOfHats == 278.91
E       assert 199.99 == 278.91

test_program.py:14: AssertionError
=========================== short test summary info ============================
FAILED test_program.py::test_hat_variables - assert 199.99 == 278.91
============================== 1 failed in 0.01s ===============================
  `.trim();

  const parsed = parsePytestOutput(stdout, '', 1);

  assert.equal(parsed.failure_details[0].error_message, 'Assertion failed: assert program.CostOfHats == 278.91');
  assert.equal(parsed.failure_details[0].received, '199.99');
  assert.equal(parsed.failure_details[0].expected, '278.91');
});

test('extracts expected and received values for boolean identity assertions', () => {
  const stdout = `
============================= test session starts ==============================
platform linux -- Python 3.11.12, pytest-9.1.1, pluggy-1.6.0
collected 1 item

test_program.py F                                                        [100%]

=================================== FAILURES ===================================
______________________________ test_hat_variables ______________________________

    def test_hat_variables():
>       assert program.WearingHat is False
E       assert True is False
E        +  where True = program.WearingHat

test_program.py:16: AssertionError
=========================== short test summary info ============================
FAILED test_program.py::test_hat_variables - assert True is False
============================== 1 failed in 0.01s ===============================
  `.trim();

  const parsed = parsePytestOutput(stdout, '', 1);

  assert.equal(parsed.failure_details[0].error_message, 'Assertion failed: assert program.WearingHat is False');
  assert.equal(parsed.failure_details[0].received, 'True');
  assert.equal(parsed.failure_details[0].expected, 'False');
});
