const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

/**
 * Ensures the datasets repo is cloned or updated in the unique directory.
 * @param {string} uniqueDir - The temp directory where datasets should be cloned.
 */
async function ensureDatasetsRepo(uniqueDir) {
  const datasetsPath = path.join(uniqueDir, 'datasets');

  try {
    await fs.access(datasetsPath);
    console.log('Datasets folder exists. Pulling latest changes...');
    await runShellCommand('git pull', { cwd: datasetsPath });
  } catch (err) {
    console.log('Datasets folder does not exist. Cloning repo...');
    await runShellCommand(`git clone https://github.com/codewit-us/datasets.git datasets`, { cwd: uniqueDir });
  }
}

/**
 * Runs a shell command in a specific directory.
 * @param {string} command - The command to run.
 * @param {object} options - Options for the child process (e.g., cwd).
 */
function runShellCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const process = exec(command, options, (error, stdout, stderr) => {
      if (error) {
        console.error(`Shell command error: ${stderr}`);
        return reject(new Error(stderr));
      }
      console.log(`Shell command output: ${stdout}`);
      resolve(stdout);
    });
  });
}

/**
 * Extracts the public class name from Java code.
 * @param {string} javaCode - The Java source code.
 * @returns {string} - The name of the public class.
 * @throws {Error} - If no public class is found.
 */
function extractClassName(javaCode) {
  const classNameMatch = javaCode.match(/public\s+class\s+(\w+)/);
  if (classNameMatch) {
    console.log(`Found class name: ${classNameMatch[1]}`);
    return classNameMatch[1];
  }
  console.error('No public class found in Java code.');
  throw new Error('Invalid Java code: public class not found.');
}

/**
 * Creates a unique temporary directory.
 * @returns {Promise<string>} - The path to the unique directory.
 */
async function createUniqueDirectory() {
  const tempDir = path.resolve('./temp');
  const uniqueDir = path.join(tempDir, uuidv4());
  await fs.mkdir(uniqueDir, { recursive: true });
  return uniqueDir;
}

/**
 * Configures the execution settings based on language.
 * @param {string} language - The programming language.
 * @param {string} code - The source code.
 * @param {string} uniqueDir - The directory for temporary files.
 * @returns {object|null} - The configuration object or null if language unsupported.
 */
function configureExecution(language, code, uniqueDir) {
  let config = {
    extension: '',
    compileCommand: '',
    runCommand: '',
    runArgs: [],
    className: '',
  };

  switch (language.toLowerCase()) {
    case 'python':
      config.extension = '.py';
      config.runCommand = 'python3';
      config.runArgs = [path.join(uniqueDir, `program${config.extension}`)];
      break;

    case 'cpp':
      config.extension = '.cpp';
      config.compileCommand = 'g++';
      config.runCommand = path.join(uniqueDir, 'program');
      config.runArgs = [];
      break;

    case 'java':
      try {
        config.className = extractClassName(code);
      } catch (err) {
        throw new Error(err.message);
      }
      config.extension = '.java';
      config.compileCommand = 'javac';
      config.runCommand = 'java';
      config.runArgs = ['-cp', uniqueDir, config.className];
      break;

    default:
      console.error(`Unsupported language: ${language}`);
      return null;
  }
  return config;
}

/**
 * Writes the provided code to a file.
 * @param {string} uniqueDir - The directory to write the file.
 * @param {string} extension - The file extension.
 * @param {string} code - The source code.
 * @param {string|null} className - Optional class name for Java.
 * @returns {Promise<string>} - The path to the written file.
 */
async function writeCodeToFile(uniqueDir, extension, code, className = null) {
  let fileName = className ? `${className}${extension}` : `program${extension}`;
  const filePath = path.join(uniqueDir, fileName);
  await fs.writeFile(filePath, code);
  return filePath;
}

async function compilationHandler(config, uniqueDir) {
  if (config.compileCommand === 'g++') {
    await compileCode(
      config.compileCommand,
      ['-o', path.join(uniqueDir, 'program'), path.join(uniqueDir, 'program.cpp')],
      uniqueDir
    );
  } else if (config.compileCommand === 'javac') {
    const javaFilePath = path.join(uniqueDir, `${config.className}.java`);
    await compileCode(
      config.compileCommand,
      ['-d', uniqueDir, javaFilePath],
      uniqueDir
    );
  }
}

/**
 * Generates a C++ test runner using CxxTest.
 * @param {string} uniqueDir - The temporary directory.
 */
async function generateCppTestRunner(uniqueDir) {
  const testHeaderPath = path.join(uniqueDir, 'test_program.h');
  const runnerCppPath = path.join(uniqueDir, 'runner.cpp');
  const runnerExecutablePath = path.join(uniqueDir, 'runner');

  await compileCode('cxxtestgen', ['--error-printer', '-o', runnerCppPath, testHeaderPath], uniqueDir);
  await compileCode('g++', ['-std=c++20', '-o', runnerExecutablePath, runnerCppPath], uniqueDir);
}

function extractFunctionDeclarations(cppCode) {
  // Regular expression to match typical C++ function signatures
  const regex = /\b(?:int|bool|void|float|double|string|char)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)\s*(?=\{)/g;
  
  const matches = cppCode.match(regex);
  if (!matches) return '';

  // Turn function definitions into declarations by adding semicolons
  return matches.map(fn => fn.trim() + ';').join('\n');
}

/**
 * Sets up the testing environment based on language.
 * @param {string} language - The programming language.
 * @param {string} uniqueDir - The temporary directory.
 * @param {string} className - The class name for Java.
 * @param {string} testCode - The test code.
 */
async function handleTestSetup(language, uniqueDir, className, testCode) {
  switch (language.toLowerCase()) {
    case 'python':
      try {
        await fs.writeFile(path.join(uniqueDir, 'test_program.py'), testCode);
      } catch (error) {
        console.error('Failed to write Python test code.');
        throw new Error(`Compilation failed: ${error.message}`);
      }
      break;

    case 'cpp':
      const programCppPath = path.join(uniqueDir, 'program.cpp');
      const studentCode = await fs.readFile(programCppPath, 'utf-8');

      const declarations = extractFunctionDeclarations(studentCode);

      const finalTestCode = `
${declarations}

${testCode}
      `.trim();

      await fs.writeFile(path.join(uniqueDir, 'test_program.h'), finalTestCode);
      await generateCppTestRunner(uniqueDir);
      break;

    case 'java':
      const testClassName = extractClassName(testCode);
      await fs.writeFile(path.join(uniqueDir, `${testClassName}.java`), testCode);
      const runnerTemplate = await fs.readFile(
        path.join(__dirname, 'TestRunner.java'),
        'utf-8'
      );
      const runnerFinalCode = runnerTemplate.replace(/MainTest/g, testClassName);
      await fs.writeFile(path.join(uniqueDir, 'TestRunner.java'), runnerFinalCode);
      
      const testRunnerPath = path.join(uniqueDir, 'TestRunner.java');
      try {
        await compileCode(
          'javac',
          [
            '-cp',
            path.join(__dirname, 'lib', 'junit-platform-console-standalone-1.10.2.jar') +
              path.delimiter +
              uniqueDir,
            path.join(uniqueDir, `${className}.java`),
            path.join(uniqueDir, `${testClassName}.java`),
            testRunnerPath,
          ],
          uniqueDir
        );
      } catch (error) {
        console.error('Failed to compile Java test classes.');
        throw new Error(`Compilation failed: ${error.message}`);
      }
      break;
  }
}

/**
 * Parses pytest output to extract structured test results.
 * @param {string} stdout - The stdout from pytest.
 * @param {string} [stderr=''] - The stderr from pytest.
 * @param {number|null} [exitCode=null] - The pytest process exit code.
 * @returns {object} - The test summary.
 */
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

function extractPytestShortSummaryTarget(output, prefix) {
  const line = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${prefix} `));

  return line ? line.slice(prefix.length + 1).trim() : '';
}

function extractPytestErrorMessage(output, stderr = '') {
  const combined = buildRawOutput(output, stderr);
  const patterns = [
    /^E\s+([A-Za-z_.]+(?:Error|Exception): .+)$/m,
    /^([A-Za-z_.]+(?:Error|Exception): .+)$/m,
    /^(ImportError while importing test module .+)$/m,
    /^E\s+(.+)$/m,
  ];

  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return 'Pytest error during collection or execution';
}

function parsePytestOutput(stdout = '', stderr = '', exitCode = null) {
  const summary = extractPytestSummary(stdout);
  const rawout = buildRawOutput(stdout, stderr);
  const passed_tests = extractPytestCount(summary, 'passed');
  const failed_tests = extractPytestCount(summary, 'failed');
  const errors = extractPytestCount(summary, 'error(?:s)?');
  const no_tests_collected = exitCode === 5 || /\bno tests ran\b/.test(summary);
  const failures = [];

  const failureBlocks = stdout.split(/={10,} FAILURES ={10,}/)[1]?.split(/={10,}/)[0] || '';
  const matches = [...failureBlocks.matchAll(
    /_{5,}\s*(.*?)\s*_{5,}[\s\S]*?>\s*assert\s+(.*?)\s*?\nE\s+assert\s+(.*?)\s*?(?:\nE\s+\+\s+where\s+(.*?)\s+=)?/g
  )];

  matches.forEach((match, index) => {
    const test_case = match[1]?.trim() || `Test ${index + 1}`;
    const assertionLine = match[2]?.trim();
    const failedExpr = match[3]?.trim();
    const evaluated = match[4]?.trim() || '';

    failures.push({
      test_case,
      expected: failedExpr.split('==')[1]?.trim() || '',
      received: evaluated || failedExpr.split('==')[0]?.trim(),
      error_message: `Assertion failed: ${assertionLine}`,
      rawout,
    });
  });

  if (failed_tests > 0 && failures.length === 0) {
    failures.push({
      test_case: extractPytestShortSummaryTarget(stdout, 'FAILED') || 'pytest assertion failure',
      expected: '',
      received: '',
      error_message: 'Pytest reported one or more failed assertions',
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

function parseCppTestOutput(output, stdout = '', stderr = '') {
  output = output.toString();
  let total_tests = 0;
  let passed_tests = 0;
  let failed_tests = 0;
  let failures = [];

  const totalMatch = output.match(/Running cxxtest tests \((\d+) tests?\)/);
  if (totalMatch) {
      total_tests = parseInt(totalMatch[1]);
  }

  const failedMatch = output.match(/Failed (\d+) and Skipped \d+ of (\d+) tests/);
  if (failedMatch) {
      failed_tests = parseInt(failedMatch[1]);
      total_tests = parseInt(failedMatch[2]);
  }

  passed_tests = total_tests - failed_tests;

  const failureMatches = [...output.matchAll(/Error: Expected \((.*?)\), found \((.*?)\)/g)];
  failureMatches.forEach((match, index) => {
    const expectedExpr = match[1].split("==")[1]?.trim() || match[1].trim();
    const receivedValue = match[2].split("!=")[0]?.trim() || match[2].trim();

    failures.push({
      test_case: `Test ${index + 1}`,
      expected: expectedExpr,
      received: receivedValue,
      error_message: "AssertionError: Output did not match expected result",
      rawout: `${stdout}\n${stderr}`,
      stderr,
    });
  });

  return {
    tests_run: total_tests,
    passed: passed_tests,
    failed: failed_tests,
    failure_details: failures,
  };
}

/**
 * Executes the code (and tests, if provided) based on language.
 * @param {string} language - The programming language.
 * @param {string} code - The source code.
 * @param {string} stdin - Input for the program.
 * @param {string} expectedOutput - The expected output.
 * @param {boolean} [runTests=false] - Whether to run tests.
 * @param {string} [testCode=''] - The test code.
 * @returns {Promise<object>} - The execution result.
 */
async function executeCode(language, code, stdin, expectedOutput, runTests = false, testCode = '') {
  let response = {
    state: 'execution_error',
    tests_run: 0,
    passed: 0,
    failed: 0,
    errors: 0,
    no_tests_collected: false,
    exit_code: null,
    failure_details: [],
    compilation_error: '',
    runtime_error: '',
    execution_time_exceeded: false,
    memory_exceeded: false,
  };
  
  if (language.toLowerCase() === 'cpp' && process.env.ENABLE_CPP !== 'true') {
    console.log('C++ execution is disabled.');
    response.state = 'execution_blocked';
    response.runtime_error = 'C++ execution is disabled';
    return response;
  }
  const uniqueDir = await createUniqueDirectory();
  await ensureDatasetsRepo(uniqueDir);
  const executionConfig = configureExecution(language, code, uniqueDir);

  try {
    const sourceFilePath = await writeCodeToFile(
      uniqueDir,
      executionConfig.extension,
      code,
      executionConfig.className
    );

    if (!runTests) {
      try {
        await compilationHandler(executionConfig, uniqueDir);
      } catch (compilationError) {
        console.error('Compilation failed:', compilationError.message);
        response.state = 'compile_error';
        response.compilation_error = compilationError.message;
        return response;
      }
    }

    if (runTests && testCode) {
      try {
        await handleTestSetup(language, uniqueDir, executionConfig.className, testCode);
      } catch (compilationError) {
        console.error('Test setup or compilation failed:', compilationError.message);
        response.state = 'compile_error';
        response.compilation_error = compilationError.message;
        return response;
      }
    }

    let output;
    if (runTests && testCode) {
      if (language.toLowerCase() === 'python') {
        executionConfig.runCommand = 'pytest';
        executionConfig.runArgs = [path.join(uniqueDir, 'test_program.py')];
      } else if (language.toLowerCase() === 'cpp') {
        executionConfig.runCommand = path.join(uniqueDir, 'runner');
        executionConfig.runArgs = [];
      } else if (language.toLowerCase() === 'java') {
        executionConfig.runCommand = 'java';
        executionConfig.runArgs = [
          '-cp',
          uniqueDir +
            path.delimiter +
            path.join(__dirname, 'lib', 'junit-platform-console-standalone-1.10.2.jar'),
          'TestRunner',
        ];
      }

      try {
        output = await runProgram(
        executionConfig.runCommand,
        executionConfig.runArgs,
        stdin,
        3000,
        uniqueDir   // pass temp dir
      );
      } catch (executionError) {
        console.error('Test execution failed:', executionError);
        response.state = 'failed';
        response.exit_code = executionError.exitCode ?? null;
        output = {
          stdout: executionError.stdout || '',
          stderr: executionError.stderr || '',
          exitCode: executionError.exitCode ?? null,
        };
        response.runtime_error = executionError.message;
      }
    } else {
      try {
        output = await runProgram(
        executionConfig.runCommand,
        executionConfig.runArgs,
        stdin,
        3000,
        uniqueDir   // pass temp dir
      );
      } catch (executionError) {
        console.error('Program execution failed:', executionError);
        if (language.toLowerCase() === 'python') {
          response.state = 'failed';
        } else {
          response.state = 'runtime_error';
        }
        response.exit_code = executionError.exitCode ?? null;
        response.runtime_error = executionError.message;
        return response;
      }
    }

    response.exit_code = output.exitCode ?? response.exit_code;

    if (runTests && testCode) {
      if (language.toLowerCase() === 'python') {
        const testResults = parsePytestOutput(output.stdout, output.stderr, output.exitCode ?? null);
        const keepGenericRuntimeError = output.exitCode == null || (
          output.exitCode !== 0 &&
          output.exitCode !== 1 &&
          output.exitCode !== 5 &&
          testResults.errors === 0
        );
        const runtime_error = testResults.runtime_error || (keepGenericRuntimeError ? response.runtime_error : '');
        const hasUnexpectedPytestExecutionError = Boolean(runtime_error) && (
          testResults.failed === 0 &&
          testResults.errors === 0 &&
          !testResults.no_tests_collected
        );

        response = { ...response, ...testResults };
        response.runtime_error = runtime_error;
        response.state = (
          testResults.failed === 0 &&
          testResults.errors === 0 &&
          !testResults.no_tests_collected &&
          !hasUnexpectedPytestExecutionError
        ) ? 'passed' : 'failed';
        return response;
      }

      if (language.toLowerCase() === 'cpp') {
        const testResults = parseCppTestOutput(output.stdout || output, output.stdout, output.stderr);
        response = { ...response, ...testResults };
        response.state = testResults.failed === 0 ? 'passed' : 'failed';
        return response;
      }

      const stdout = (output.stdout || output).toString();
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}') + 1;

      if (jsonStart === -1 || jsonEnd === -1) {
        console.error('Could not find valid JSON in Java test output');
        throw new Error('Invalid JSON structure in Java test stdout');
      }

      const jsonString = stdout.substring(jsonStart, jsonEnd);
      let testResults;
      try {
        testResults = JSON.parse(jsonString);
      } catch (err) {
        console.error('Failed to parse Java test JSON:', err.message);
        throw new Error('Failed to parse JSON from Java test output');
      }
      response = { ...response, ...testResults };
      return response;
    } else {
      response.tests_run = 1;
      response.passed = output.stdout.trim() === expectedOutput.trim() ? 1 : 0;
      response.failed = response.passed === 0 ? 1 : 0;
      response.exit_code = output.exitCode ?? response.exit_code;
      response.state = response.passed === 1 ? 'passed' : 'failed';

      if (response.failed) {
        response.failure_details.push({
          test_case: 1,
          expected: expectedOutput,
          received: output.stdout,
          error_message: 'Output did not match expected output',
          rawout: output.stdout + output.stderr
        });
      }
    }
  } catch (err) {
    console.error(`Error during execution: ${err.message}`);
    response.runtime_error = err.message;
    response.state = 'execution_error';
  } finally {
    await cleanupDir(uniqueDir);
    console.log(`Cleaned up directory: ${uniqueDir}`);
  }
  return response;
}

/**
 * Compiles code using the specified command and arguments.
 * @param {string} command - The compilation command.
 * @param {string[]} args - The command arguments.
 * @param {string} cwd - The working directory.
 * @returns {Promise<void>}
 */
function compileCode(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { cwd });

    let stderr = '';

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        console.error(`Compilation failed with code ${code}: ${stderr}`);
        return reject(new Error(`Compilation failed: ${stderr}`));
      }
      resolve();
    });

    process.on('error', (err) => {
      console.error(`Failed to start compilation process: ${err.message}`);
      reject(err);
    });
  });
}

/**
 * Runs a program using the specified command and arguments.
 * @param {string} command - The command to run.
 * @param {string[]} args - The command arguments.
 * @param {string} [stdin=''] - Input for the process.
 * @param {number} [timeout=3000] - Timeout in milliseconds.
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>} - The program output.
 */
function runProgram(command, args, stdin = '', timeout = 3000, workingDir = null) {
  return new Promise((resolve, reject) => {
    const shell = 'bash';
    const wrapperArgs = [
      '-c',
      `ulimit -u 50; ulimit -f 20480; exec "$@"`,
      'cmd',
      command,
      ...args
    ];

    let stdout = '';
    let stderr = '';
    let finished = false;
    let killedByEvaluator = false;

    const proc = spawn(shell, wrapperArgs, {
      cwd: workingDir || process.cwd(),   // fixed
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const killGroup = (pid) => {
      killedByEvaluator = true;
      try { process.kill(-pid, 'SIGTERM'); } catch (_) {}
      setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch (_) {} }, 400);
    };

    const timer = setTimeout(() => {
      if (!finished) {
        killGroup(proc.pid);
        finished = true;
        return reject(new Error('Execution timed out'));
      }
    }, timeout);

    if (stdin) {
      proc.stdin.write(stdin);
    }
    proc.stdin.end();

    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());

    proc.on('close', (code, signal) => {
      if (finished) return;

      clearTimeout(timer);
      finished = true;

      if (signal || killedByEvaluator) {
        const reason = signal
          ? `terminated by signal ${signal}`
          : 'terminated by evaluator';
        const err = new Error(`Execution terminated: ${reason}`);
        err.stdout = stdout;
        err.stderr = stderr;
        err.exitCode = null;
        return reject(err);
      }

      if (code !== 0) {
        const err = new Error(`Execution failed with code ${code}`);
        err.stdout = stdout;
        err.stderr = stderr;
        err.exitCode = code;
        return reject(err);
      }

      resolve({ stdout, stderr, exitCode: code });
    });

    proc.on('error', err => {
      if (finished) return;
      clearTimeout(timer);
      finished = true;
      reject(new Error(`Failed to start process: ${err.message}`));
    });
  });
}

/**
 * Cleans up the temporary directory.
 * @param {string} dirPath - The directory path to delete.
 */
async function cleanupDir(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    console.log(`Successfully deleted directory: ${dirPath}`);
  } catch (err) {
    console.error(`Failed to delete directory ${dirPath}: ${err.message}`);
  }
}

module.exports = { executeCode };
