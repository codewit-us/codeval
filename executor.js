const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

/**
 * Extracts the public class name from Java code.
 * @param {string} javaCode - The Java source code.
 * @returns {string} - The name of the public class.
 * @throws {Error} - If no public class is found.
 */
function extractClassName(javaCode) {
  const classNameMatch = javaCode.match(/public\s+class\s+(\w+)/);
  if (classNameMatch) {
    return classNameMatch[1];
  }
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

/**
 * Handles compilation for languages that require it.
 * @param {object} config - The execution configuration.
 * @param {string} uniqueDir - The temporary directory.
 */
async function compilationHandler(config, uniqueDir) {
  if (config.compileCommand === 'g++') {
    await compileCode(
      config.compileCommand,
      ['-o', path.join(uniqueDir, 'program'), path.join(uniqueDir, 'program.cpp')],
      uniqueDir
    );
  } else if (config.compileCommand === 'javac') {
    const javaFilePath = path.join(uniqueDir, `${config.className}.java`);
    // await fs.rename(path.join(uniqueDir, 'program.java'), javaFilePath);
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
        throw new Error(`Compilation failed: ${error.message}`); // Capture Python test file syntax errors
      }
      break;

    case 'cpp':
      await fs.writeFile(path.join(uniqueDir, 'test_program.h'), testCode);
      await generateCppTestRunner(uniqueDir);
      break;

    case 'java':
      await fs.writeFile(path.join(uniqueDir, `${className}Test.java`), testCode);
      await fs.copyFile(
        path.join(__dirname, 'TestRunner.java'),
        path.join(uniqueDir, 'TestRunner.java')
      );
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
            path.join(uniqueDir, `${className}Test.java`),
            testRunnerPath,
          ],
          uniqueDir
        );
      } catch (error) {
        throw new Error(`Compilation failed: ${error.message}`); // Pass error up
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


    // Extract failure details from:
    // "/usr/src/app/temp/.../test_program.h:7: Error: Expected (add(-1, 1) == 1), found (0 != 1)"
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
  const uniqueDir = await createUniqueDirectory();
  const executionConfig = configureExecution(language, code, uniqueDir);

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

  try {

    // Write the main code to the source file
    const sourceFilePath = await writeCodeToFile(
      uniqueDir,
      executionConfig.extension,
      code,
      executionConfig.className
    );
    console.log(`Main code written to ${sourceFilePath}`);

    if (!runTests) {
      try {
        await compilationHandler(executionConfig, uniqueDir);
      } catch (compilationError) {
        response.state = 'compile_error';
        response.compilation_error = compilationError.message;
        return response;
      }
    }

    // If tests are to be run, handle test scripts
    if (runTests && testCode) {
      try {
        const decodedTestCode = JSON.parse(`"${testCode}"`);
        await handleTestSetup(language, uniqueDir, executionConfig.className, decodedTestCode);
      } catch (compilationError) {
        response.state = 'compile_error';
        response.compilation_error = compilationError.message;
        return response;
      }
    }

    // Execute the program or tests
    let output;
    if (runTests && testCode) {
      if (language.toLowerCase() === 'python') {
        // Run pytest
        executionConfig.runCommand = 'pytest';
        executionConfig.runArgs = [path.join(uniqueDir, 'test_program.py')];
        console.log(`Running pytest on ${executionConfig.runArgs}`);
      } else if (language.toLowerCase() === 'cpp') {
        // Run the CxxTest runner
        executionConfig.runCommand = path.join(uniqueDir, 'runner');
        executionConfig.runArgs = [];
        console.log(`Running CxxTest runner: ${executionConfig.runCommand}`);
      } else if (language.toLowerCase() === 'java') {
        // Run JUnit tests
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
        console.log(`Running JUnit tests: ${executionConfig.runCommand} ${executionConfig.runArgs.join(' ')}`);
      }
      
      // Run program with Test Cases 
      try {
        output = await runProgram(executionConfig.runCommand, executionConfig.runArgs, stdin);
      } catch (executionError) {
        console.error("Python test execution failed:", executionError);
        response.state = 'failed';
        output = {
          stdout: executionError.stdout || '',
          stderr: executionError.stderr || '',
        };
        response.runtime_error = executionError.message;
      }

    } else {
      // Run the main program
      console.log(`Executing program: ${executionConfig.runCommand} ${executionConfig.runArgs.join(' ')}`);
      try {
        output = await runProgram(executionConfig.runCommand, executionConfig.runArgs, stdin);
      } catch (executionError) {
        if (language.toLowerCase() === 'python') {
          response.state = 'failed';
        } else {
          response.state = 'runtime_error';
        }
        response.runtime_error = executionError.message;
        return response;
      }
    }

    // Determine success based on output
    if (runTests && testCode) {
      if (language.toLowerCase() === 'python') {
        const testResults = parsePytestOutput(output.stdout, output.stdout, output.stderr);
        response.tests_run = testResults.tests_run;
        response.passed = testResults.passed;
        response.failed = testResults.failed;
        response.failure_details = testResults.failure_details;
        response.state = testResults.failed === 0 ? 'passed' : 'failed';
        return response;
      }

        if (language.toLowerCase() === 'cpp') {
            executionConfig.runCommand = path.join(uniqueDir, 'runner');
            executionConfig.runArgs = [];

            try {
                output = await runProgram(executionConfig.runCommand, executionConfig.runArgs, stdin);
            } catch (executionError) {
                response.state = "failed";
                response.runtime_error = executionError.message;
                output = executionError
            }


            const testResults = parseCppTestOutput(output.stdout || output, output.stdout, output.stderr);
            response.tests_run = testResults.tests_run;
            response.passed = testResults.passed;
            response.failed = testResults.failed;
            response.failure_details = testResults.failure_details;
            response.state = testResults.failed === 0 ? "passed" : "failed";
            return response;
        }

      // For Java, parse JSON output from tests
      const stdout = (output.stdout || output).toString();
      
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}') + 1;
      
      if (jsonStart === -1 || jsonEnd === -1) {
        console.error("Could not find valid JSON in Java test output");
        throw new Error("Invalid JSON structure in Java test stdout");
      }
      
      const jsonString = stdout.substring(jsonStart, jsonEnd);
      
      let testResults;
      try {
        testResults = JSON.parse(jsonString);
      } catch (err) {
        console.error("Failed to parse Java test JSON:", err.message);
        throw new Error("Failed to parse JSON from Java test output");
      }
      response = {
        state: testResults.state,
        tests_run: testResults.tests_run,
        passed: testResults.passed,
        failed: testResults.failed,
        failure_details: testResults.failure_details,
        compilation_error: response.compilation_error || '',
        runtime_error: response.runtime_error || '',
        execution_time_exceeded: testResults.execution_time_exceeded || false,
        memory_exceeded: testResults.memory_exceeded || false,
      };
    } else {
      // Compare output with expected output
      response.tests_run = 1;
      response.passed = response.stdout === expectedOutput ? 1 : 0;
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
    console.log(`Compiling with command: ${command} ${args.join(' ')}, cwd: ${cwd}`);
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
      console.log(`Compilation succeeded for command: ${command} ${args.join(' ')}`);
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
    console.log(`Running command: ${command} ${args.join(' ')}`);
    const process = spawn(command, args, { cwd: path.dirname(command) });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        process.kill('SIGTERM');
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
          console.error(`Execution failed with code: ${code}: stderr: ${stderr}, stdout: ${stdout}`);
          const error = new Error(`Execution failed with code ${code}`);
          error.stdout = stdout;
          error.stderr = stderr;
          return reject(error);
        }
        console.log(`Execution succeeded for command: ${command} ${args.join(' ')}`);
        resolve({stdout, stderr});
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
    await fs.rm(dirPath, { recursive: true, force: true });
    console.log(`Successfully deleted directory: ${dirPath}`);
  } catch (err) {
    console.error(`Failed to delete directory ${dirPath}: ${err.message}`);
  }
}

module.exports = { executeCode };
