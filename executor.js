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
  const repoUrl = 'https://github.com/codewit-us/datasets.git';

  try {
    await fs.access(datasetsPath);
    console.log('Datasets folder exists. Pulling latest changes...');
    await runShellCommand('git pull', { cwd: datasetsPath });
  } catch (err) {
    console.log('Datasets folder does not exist. Cloning repo...');
    await runShellCommand(`git clone ${repoUrl} datasets`, { cwd: uniqueDir });
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
  const mainCppPath = path.join(uniqueDir, 'program.cpp');

  await compileCode('cxxtestgen', ['--error-printer', '-o', runnerCppPath, testHeaderPath], uniqueDir);
  await compileCode('g++', ['-o', runnerExecutablePath, runnerCppPath, mainCppPath], uniqueDir);
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
            path.join(__dirname, 'lib', 'junit-4.13.2.jar') +
              path.delimiter +
              path.join(__dirname, 'lib', 'hamcrest-core-1.3.jar') +
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
 * Parses pytest output to extract test results.
 * @param {string} output - The output from pytest.
 * @returns {object} - The test summary.
 */
function parsePytestOutput(output, stdout = '', stderr = '') {
  let total_tests = 0;
  let passed_tests = 0;
  let failed_tests = 0;
  let failures = [];

  const match = output.match(/(\d+) passed, (\d+) failed/);
  if (match) {
    passed_tests = parseInt(match[1]);
    failed_tests = parseInt(match[2]);
    total_tests = passed_tests + failed_tests;
  } else {
    const singlePassMatch = output.match(/(\d+) passed/);
    if (singlePassMatch) {
      passed_tests = parseInt(singlePassMatch[1]);
      total_tests = passed_tests;
    }
    const singleFailMatch = output.match(/(\d+) failed/);
    if (singleFailMatch) {
      failed_tests = parseInt(singleFailMatch[1]);
      total_tests += failed_tests;
    }
  }

  
  const failureBlocks = output.split(/={10,} FAILURES ={10,}/)[1]?.split(/={10,}/)[0] || '';

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
      rawout: `${stdout}\n${stderr}`
    });
  });

  return {
    tests_run: total_tests,
    passed: passed_tests,
    failed: failed_tests,
    failure_details: failures,
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
            path.join(__dirname, 'lib', 'junit-4.13.2.jar') +
            path.delimiter +
            path.join(__dirname, 'lib', 'hamcrest-core-1.3.jar'),
          'TestRunner',
        ];
      }

      try {
        output = await runProgram(executionConfig.runCommand, executionConfig.runArgs, stdin);
      } catch (executionError) {
        console.error('Test execution failed:', executionError);
        response.state = 'failed';
        output = {
          stdout: executionError.stdout || '',
          stderr: executionError.stderr || '',
        };
        response.runtime_error = executionError.message;
      }
    } else {
      try {
        output = await runProgram(executionConfig.runCommand, executionConfig.runArgs, stdin);
      } catch (executionError) {
        console.error('Program execution failed:', executionError);
        if (language.toLowerCase() === 'python') {
          response.state = 'failed';
        } else {
          response.state = 'runtime_error';
        }
        response.runtime_error = executionError.message;
        return response;
      }
    }

    if (runTests && testCode) {
      if (language.toLowerCase() === 'python') {
        const testResults = parsePytestOutput(output.stdout, output.stdout, output.stderr);
        response = { ...response, ...testResults };
        response.state = testResults.failed === 0 ? 'passed' : 'failed';
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
 * @returns {Promise<string>} - The program's stdout.
 */
function runProgram(command, args, stdin = '', timeout = 3000) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { cwd: path.dirname(command) });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        process.kill('SIGTERM');
        console.error('Execution timed out.');
        reject(new Error('Execution timed out'));
      }
    }, timeout);

    if (stdin) {
      process.stdin.write(stdin);
    }
    process.stdin.end();

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (!finished) {
        clearTimeout(timer);
        finished = true;
        if (code !== 0) {
          console.error(`Execution failed with code ${code}: stderr: ${stderr}, stdout: ${stdout}`);
          const error = new Error(`Execution failed with code ${code}`);
          error.stdout = stdout;
          error.stderr = stderr;
          return reject(error);
        }
        resolve({ stdout, stderr });
      }
    });

    process.on('error', (err) => {
      if (!finished) {
        clearTimeout(timer);
        finished = true;
        console.error(`Failed to start execution process: ${err.message}`);
        reject(err);
      }
    });
  });
}

/**
 * Cleans up the temporary directory.
 * @param {string} dirPath - The directory path to delete.
 */
async function cleanupDir(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true }); // if you really want to delete
    console.log(`Successfully deleted directory: ${dirPath}`);
  } catch (err) {
    console.error(`Failed to delete directory ${dirPath}: ${err.message}`);
  }
}

module.exports = { executeCode };