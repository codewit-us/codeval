function buildRawOutput(stdout = '', stderr = '') {
  if (stdout && stderr) {
    return `${stdout}\n${stderr}`;
  }

  return stdout || stderr || '';
}

function extractPytestSummary(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const summaryLine = [...lines].reverse().find((line) => (
    /^=+/.test(line) &&
    /=+$/.test(line) &&
    (/\bin [\d.]+s\b/.test(line) || /\bno tests ran\b/.test(line))
  ));

  if (!summaryLine) {
    return '';
  }

  return summaryLine.replace(/^=+\s*/, '').replace(/\s*=+$/, '');
}

function extractPytestCount(summary, labelPattern) {
  const match = summary.match(new RegExp(`(\\d+) ${labelPattern}\\b`));
  return match ? parseInt(match[1], 10) : 0;
}

function normalizePytestTarget(target = '') {
  const trimmed = target.trim();

  if (!trimmed) {
    return '';
  }

  const segments = trimmed.split('::').filter(Boolean);

  if (segments.length > 1) {
    return segments[segments.length - 1].trim();
  }

  const pathSegments = trimmed.split(/[\\/]/).filter(Boolean);
  return pathSegments[pathSegments.length - 1] || trimmed;
}

function extractPytestShortSummaryTarget(output, prefix) {
  const line = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${prefix} `));

  return line ? normalizePytestTarget(line.slice(prefix.length + 1).trim()) : '';
}

function extractPytestErrorMessage(output, stderr = '') {
  const combined = buildRawOutput(output, stderr);
  const patterns = [
    /^\s*E\s+([A-Za-z_.]+(?:Error|Exception): .+)$/m,
    /^([A-Za-z_.]+(?:Error|Exception): .+)$/m,
    /^(ImportError while importing test module .+)$/m,
    /^\s*E\s+(.+)$/m,
  ];

  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return 'Pytest error during collection or execution';
}

function extractPytestFailureSection(stdout = '') {
  const failureSectionMatch = stdout.match(
    /={10,}\s+FAILURES\s+={10,}\n([\s\S]*?)(?=\n={10,}\s+(?:short test summary info|ERRORS)\s+={10,}|\n={10,}\s+\d+ .+? in [\d.]+s\s+={10,}|$)/i
  );

  return failureSectionMatch ? failureSectionMatch[1] : '';
}

function extractPytestFailureBlocks(stdout = '') {
  const failureSection = extractPytestFailureSection(stdout);

  if (!failureSection) {
    return [];
  }

  const blockRegex = /_{5,}\s*(.*?)\s*_{5,}\n([\s\S]*?)(?=\n_{5,}\s*.*?\s*_{5,}\n|$)/g;
  const blocks = [];

  for (const match of failureSection.matchAll(blockRegex)) {
    blocks.push({
      title: normalizePytestTarget(match[1] || ''),
      body: match[2] || '',
    });
  }

  return blocks;
}

function findPytestComparison(expression) {
  const operators = [' is not ', ' is ', '=='];
  const openingBrackets = new Set(['(', '[', '{']);
  const closingBrackets = new Set([')', ']', '}']);
  let quote = '';
  let escaped = false;
  let depth = 0;
  let comparison = null;

  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (openingBrackets.has(character)) {
      depth += 1;
      continue;
    }

    if (closingBrackets.has(character)) {
      depth = Math.max(0, depth - 1);
      continue;
    }

    const operator = operators.find((candidate) => expression.startsWith(candidate, index));
    if (operator && (!comparison || depth < comparison.depth)) {
      comparison = { index, operator, depth };
    }
  }

  return comparison;
}

function extractPytestAssertionDetails(body = '') {
  const sourceLineMatch = body.match(/^\s*>\s*(.+)$/m);
  const errorLines = [...body.matchAll(/^\s*E\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter((line) => line && !/^\+\s+where\b/.test(line));
  const technicalLine = errorLines.find((line) => (
    /^(?:AssertionError:\s+)?assert\s+/.test(line)
  )) || '';

  const expressionMatch = technicalLine.match(/^(?:AssertionError:\s+)?assert\s+(.+)$/);

  if (!expressionMatch) {
    return null;
  }

  const expression = expressionMatch[1].trim();
  const comparison = findPytestComparison(expression);

  if (!comparison) {
    return null;
  }

  const receivedSide = expression.slice(0, comparison.index);
  const expectedSide = expression.slice(comparison.index + comparison.operator.length);

  return {
    assertionLine: sourceLineMatch ? sourceLineMatch[1].trim() : '',
    technicalLine,
    expected: expectedSide.trim(),
    received: receivedSide.trim(),
  };
}

function extractPytestAssertionMessage(body = '') {
  const errorLines = [...body.matchAll(/^\s*E\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter((line) => line && !/^\+\s+where\b/.test(line));

  return errorLines.find((line) => /^AssertionError:/i.test(line)) || '';
}

function extractPytestFailureDetail(block, rawout) {
  const sourceLineMatch = block.body.match(/^\s*>\s*(.+)$/m);
  const errorLines = [...block.body.matchAll(/^\s*E\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter((line) => line && !/^\+\s+where\b/.test(line));
  const technicalLine = errorLines[errorLines.length - 1] || '';
  const assertionDetails = extractPytestAssertionDetails(block.body);
  const assertionMessage = extractPytestAssertionMessage(block.body);

  if (assertionDetails) {
    return {
      test_case: block.title || 'pytest assertion failure',
      expected: assertionDetails.expected,
      received: assertionDetails.received,
      error_message: assertionMessage || `Assertion failed: ${assertionDetails.assertionLine || assertionDetails.technicalLine}`,
      diagnostic: block.body.trim(),
      rawout,
    };
  }

  return {
    test_case: block.title || 'pytest failure',
    expected: '',
    received: '',
    error_message: assertionMessage || technicalLine || (sourceLineMatch ? `Assertion failed: ${sourceLineMatch[1].trim()}` : 'Pytest reported a failure'),
    diagnostic: block.body.trim(),
    rawout,
  };
}

function parsePytestOutput(stdout = '', stderr = '', exitCode = null) {
  const summary = extractPytestSummary(stdout);
  const rawout = buildRawOutput(stdout, stderr);
  const passed_tests = extractPytestCount(summary, 'passed');
  const failed_tests = extractPytestCount(summary, 'failed');
  const errors = extractPytestCount(summary, 'error(?:s)?');
  const no_tests_collected = exitCode === 5 || /\bno tests ran\b/.test(summary);
  const failures = [];
  const failureBlocks = extractPytestFailureBlocks(stdout);

  failureBlocks.forEach((block) => {
    failures.push(extractPytestFailureDetail(block, rawout));
  });

  if (failed_tests > 0 && failures.length === 0) {
    failures.push({
      test_case: extractPytestShortSummaryTarget(stdout, 'FAILED') || 'pytest assertion failure',
      expected: '',
      received: '',
      error_message: extractPytestErrorMessage(stdout, stderr),
      rawout,
    });
  }

  let runtime_error = '';

  if (errors > 0) {
    runtime_error = extractPytestErrorMessage(stdout, stderr);
    failures.push({
      test_case: extractPytestShortSummaryTarget(stdout, 'ERROR') || 'pytest collection/execution',
      expected: '',
      received: '',
      error_message: runtime_error,
      rawout,
    });
  } else if (no_tests_collected) {
    runtime_error = 'Pytest did not collect any tests';
    failures.push({
      test_case: 'pytest collection',
      expected: 'at least 1 collected test',
      received: '0 collected tests',
      error_message: runtime_error,
      rawout,
    });
  }

  return {
    tests_run: passed_tests + failed_tests,
    passed: passed_tests,
    failed: failed_tests,
    errors,
    no_tests_collected,
    exit_code: exitCode,
    failure_details: failures,
    runtime_error,
  };
}

module.exports = {
  buildRawOutput,
  extractPytestSummary,
  extractPytestCount,
  extractPytestShortSummaryTarget,
  extractPytestErrorMessage,
  extractPytestFailureBlocks,
  parsePytestOutput,
};
