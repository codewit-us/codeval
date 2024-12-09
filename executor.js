const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

function extractClassName(javaCode) {
    const classNameMatch = javaCode.match(/public\s+class\s+(\w+)/);
    if (classNameMatch) {
        return classNameMatch[1]; // return the class name
    }
    throw new Error('Invalid Java code: public class not found.');
}

async function executeCode(language, code, stdin, expectedOutput, runTests = false, testCode = '') {
    const tempDir = path.resolve('./temp');
    const uniqueDir = path.join(tempDir, uuidv4());
    await fs.mkdir(uniqueDir, { recursive: true });

    let extension = '';
    let compileCommand = '';
    let runCommand = '';
    let runArgs = [];
    let className = '';

    switch (language.toLowerCase()) {
        case 'python':
            extension = '.py';
            runCommand = 'python3';
            runArgs = [path.join(uniqueDir, `program${extension}`)];
            break;
        case 'cpp':
            extension = '.cpp';
            compileCommand = 'g++';
            runCommand = path.join(uniqueDir, 'program');
            runArgs = [];
            break;
        case 'java':
            try {
                className = extractClassName(code); // extract class name for Java
            } catch (err) {
                await cleanupDir(uniqueDir);
                return { success: false, actualOutput: '', expectedOutput, error: err.message };
            }
            extension = '.java';
            compileCommand = 'javac';
            runCommand = 'java';
            runArgs = ['-cp', uniqueDir, className];
            break;
        default:
            await cleanupDir(uniqueDir);
            throw new Error('Unsupported language');
    }

    try {
        // write the main code to the source file
        const sourceFilePath = path.join(uniqueDir, `program${extension}`);
        await fs.writeFile(sourceFilePath, code);
        console.log(`Main code written to ${sourceFilePath}`);

        // handle compilation if necessary
        if (language.toLowerCase() === 'cpp') {
            if (runTests) {
                console.log('Running tests for C++');
                // compilation will be handled after generating test runner
            } else {
                console.log(`Compiling C++ program: ${sourceFilePath}`);
                await compileCode(compileCommand, ['-o', path.join(uniqueDir, 'program'), sourceFilePath], uniqueDir);
                await fs.chmod(path.join(uniqueDir, 'program'), '755'); // Set executable permission
                console.log('C++ program compiled successfully');
            }
        } else if (language.toLowerCase() === 'java') {
            const javaFilePath = path.join(uniqueDir, `${className}${extension}`); // Java file must match class name
            await fs.rename(sourceFilePath, javaFilePath); // Rename file to class name
            console.log(`Java code renamed to ${javaFilePath}`);
            if (!runTests) {
                await compileCode(compileCommand, ['-d', uniqueDir, javaFilePath]);
                console.log('Java program compiled successfully');
            }
        }

        // if tests are to be run, handle test scripts
        if (runTests && testCode) {
            if (language.toLowerCase() === 'python') {
                await handlePythonTests(uniqueDir, testCode);
            } else if (language.toLowerCase() === 'cpp') {
                await handleCppTests(uniqueDir, code, testCode);
            } else if (language.toLowerCase() === 'java') {
                await handleJavaTests(uniqueDir, className, testCode);
            }
        }

        // execute the program or tests
        let output;
        if (runTests && testCode) {
            if (language.toLowerCase() === 'python') {
                // run pytest
                runCommand = 'pytest';
                runArgs = [path.join(uniqueDir, 'test_program.py')];
                console.log(`Running pytest on ${runArgs}`);
            } else if (language.toLowerCase() === 'cpp') {
                // run the CxxTest runner
                runCommand = path.join(uniqueDir, 'runner');
                runArgs = [];
                console.log(`Running CxxTest runner: ${runCommand}`);
            } else if (language.toLowerCase() === 'java') {
                // run JUnit tests
                runCommand = 'java';
                runArgs = ['-cp', uniqueDir + path.delimiter + path.join(__dirname, 'lib', 'junit-4.13.2.jar') + path.delimiter + path.join(__dirname, 'lib', 'hamcrest-core-1.3.jar'), 'org.junit.runner.JUnitCore', `${className}Test`];
                console.log(`Running JUnit tests: ${runCommand} ${runArgs.join(' ')}`);
            }

            output = await runProgram(runCommand, runArgs, stdin);
        } else {
            // run the main program
            console.log(`Executing program: ${runCommand} ${runArgs.join(' ')}`);
            output = await runProgram(runCommand, runArgs, stdin);
        }

        // determine success based on output
        let isCorrect = false;
        if (runTests && testCode) {
            if (language.toLowerCase() === 'python') {
                isCorrect = !output.includes('fail');
                return {
                    actualOutput: output,
                    error: isCorrect ? null : 'Tests failed'
                };
            } else if (language.toLowerCase() === 'cpp') {
                isCorrect = !output.includes('Failed');
                return {
                    actualOutput: output,
                    error: isCorrect ? null : 'Tests failed'
                };
            } else if (language.toLowerCase() === 'java') {
                isCorrect = !output.includes('failure')
                return {
                    actualOutput: output,
                    error: isCorrect ? null : 'Tests failed'
                };
            }
        } else {
            // compare output with expected output
            isCorrect = output.trim() === expectedOutput.trim();
            return {
                actualOutput: output,
                expectedOutput,
                error: isCorrect ? null : 'Output did not match expected output'
            };
        }
    } catch (err) {
        // capture any errors during execution or compilation
        console.error(`Error during execution: ${err.message}`);
        return { success: false, actualOutput: '', expectedOutput, error: err.message };
    } finally {
        await cleanupDir(uniqueDir); // Ensure cleanup
        console.log(`Cleaned up directory: ${uniqueDir}`);
    }
}

async function handlePythonTests(uniqueDir, testCode) {
    const testFilePath = path.join(uniqueDir, 'test_program.py');
    await fs.writeFile(testFilePath, testCode);
    console.log(`Python test code written to ${testFilePath}`);
}

async function handleCppTests(uniqueDir, mainCode, testCode) {
    const testHeaderPath = path.join(uniqueDir, 'test_program.h');
    await fs.writeFile(testHeaderPath, testCode);
    console.log(`C++ test header written to ${testHeaderPath}`);

    // generate CxxTest runner
    console.log('Generating CxxTest runner');
    await compileCode(
        'cxxtestgen',
        ['--error-printer', '-o', path.join(uniqueDir, 'runner.cpp'), testHeaderPath],
        uniqueDir
    );
    console.log(`CxxTest runner.cpp generated at ${path.join(uniqueDir, 'runner.cpp')}`);

    // compile the runner with the main program
    console.log('Compiling CxxTest runner with main program');
    const runnerExecutablePath = path.join(uniqueDir, 'runner');
    const mainCppPath = path.join(uniqueDir, 'program.cpp');

    // ensure main program is saved as 'program.cpp'
    await fs.writeFile(mainCppPath, mainCode);
    console.log(`Main C++ program written to ${mainCppPath}`);

    await compileCode(
        'g++',
        ['-o', runnerExecutablePath, path.join(uniqueDir, 'runner.cpp'), mainCppPath],
        uniqueDir
    );
    console.log(`CxxTest runner executable created at ${runnerExecutablePath}`);
}

async function handleJavaTests(uniqueDir, className, testCode) {
    // write the test code to a Java file
    const testFilePath = path.join(uniqueDir, `${className}Test.java`);
    await fs.writeFile(testFilePath, testCode);
    console.log(`Java test code written to ${testFilePath}`);

    // compile the test code along with the main code, including JUnit and Hamcrest in the classpath
    console.log('Compiling Java test code with main program');
    await compileCode(
        'javac',
        ['-cp', path.join(__dirname, 'lib', 'junit-4.13.2.jar') + path.delimiter + path.join(__dirname, 'lib', 'hamcrest-core-1.3.jar') + path.delimiter + uniqueDir, path.join(uniqueDir, `${className}.java`), testFilePath],
        uniqueDir
    );
    console.log('Java test code compiled successfully');
}

function compileCode(command, args, cwd) {
    return new Promise((resolve, reject) => {
        console.log(`Compiling with command: ${command} ${args.join(' ')}, cwd: ${cwd}`);
        const process = spawn(command, args, { cwd: cwd });

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

function runProgram(command, args, stdin = '', timeout = 5000) { // default timeout: 5 seconds
    return new Promise((resolve, reject) => {
        console.log(`Running command: ${command} ${args.join(' ')}`);
        const process = spawn(command, args, { cwd: path.dirname(command) });

        let stdout = '';
        let stderr = '';
        let finished = false;

        // set up a timeout
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
                    return reject(new Error(`Execution failed with code ${code}: ${stderr}, stdout: ${stdout}`));
                }
                console.log(`Execution succeeded for command: ${command} ${args.join(' ')}`);
                resolve(stdout);
            }
        });

        // handle stderror
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

async function cleanupDir(dirPath) {
    try {
        await fs.rm(dirPath, { recursive: true, force: true });
        console.log(`Successfully deleted directory: ${dirPath}`);
    } catch (err) {
        console.error(`Failed to delete directory ${dirPath}: ${err.message}`);
    }
}

module.exports = { executeCode };
