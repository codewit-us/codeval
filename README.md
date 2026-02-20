# CodeEval

![License](https://img.shields.io/badge/License-MIT-blue.svg)

## Features
- **Unit Testing Integration:** Utilize CxxTest for C++, JUnit for Java, and Pytest for Python.
- **Automated Cleanup:** Temporary files and directories are cleaned after execution.

## How to Run

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/codewit-us/codeval
   cd codeeval
   ```

2. **Build the Docker Image:**
   ```bash
   docker build -t codeeval .
   ```

3. **Run the Docker Container:**
   ```bash
   docker run -d -p 3000:3000 --name codeeval-container codeeval
   ```

## Usage

### API Endpoint

**POST** `/execute`

- **Description:** Execute code and optionally run unit tests.
- **Headers:** `Content-Type: application/json`
- **Body Parameters:**
  - `language` (String): `"cpp"`, `"java"`, or `"python"`.
  - `code` (String): Main code to execute.
  - `stdin` (String, optional): Input for the program.
  - `expectedOutput` (String, optional): Expected output for validation.
  - `runTests` (Boolean, optional): Whether to run unit tests.
  - `testCode` (String, optional): Unit test code.
  
**Note:**

For testing purposes, you can use the `codeeval.http` file in VS Code with this extension: [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client). (Don't forget to update the cookie for connect.sid in headers.)


### Example `curl` Requests

#### 1. Execute Code Without Tests

- C++

```bash
curl -X POST http://localhost:3000/execute \
-H "Content-Type: application/json" \
-d '{
    "language": "cpp",
    "code": "#include <iostream>\n\nint add(int a, int b) { return a + b; }\n\nint main() { std::cout << add(2, 3) << std::endl; return 0; }",
    "expectedOutput": "5",
    "runTests": false
}'
```
- Java

```bash
curl -X POST http://localhost:3000/execute \
-H "Content-Type: application/json" \
-d '{
    "language": "java",
    "code": "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello, World!\");\n    }\n}",
    "stdin": "",
    "expectedOutput": "Hello, World!\n",
    "runTests": false,
    "testCode": ""
}'
```

- Python

```bash
curl -X POST http://localhost:3000/execute \
-H "Content-Type: application/json" \
-d '{
    "language": "python",
    "code": "print(\"Hello, World!\")",
    "stdin": "",
    "expectedOutput": "Hello, World!\n",
    "runTests": false,
    "testCode": ""
}'
```

#### 2. Execute Code With Unit Tests
- C++

```bash
curl -X POST http://localhost:3000/execute \
-H "Content-Type: application/json" \
-d '{
    "language": "cpp",
    "code": "#include <iostream>\nusing namespace std;\nint main(){\ncout<<\"Hola!\n\";\nreturn 0;\n}\n",                                  
    "runTests": true,
    "testCode": "#include <cxxtest/TestSuite.h>\n#include <sstream>\n#include <iostream>\n#define main program_main\n#include \"program.cpp\"\n#undef main\nclass codewit_test : public CxxTest::TestSuite {\npublic:\nvoid testHolaMundo(){\nstd::stringstream out;\nstd::streambuf* cout_buf = std::cout.rdbuf();\nstd::cout.rdbuf(out.rdbuf());\nprogram_main();\nstd::cout.rdbuf(cout_buf);\nTS_ASSERT_EQUALS(\"Hola!\n\",out.str());}};\n"
}'
```

- Java

```bash
curl -X POST http://localhost:3000/execute \
-H "Content-Type: application/json" \
-d '{
    "language": "java",
    "code": "public class Main {\n    public int add(int a, int b) {\n        return a + b;\n    }\n}",
    "stdin": "",
    "expectedOutput": "",
    "runTests": true,
    "testCode": "import org.junit.Test;\nimport static org.junit.Assert.*;\n\npublic class MainTest {\n    @Test\n    public void testAdd() {\n        Main main = new Main();\n        assertEquals(5, main.add(2, 3));\n        assertEquals(0, main.add(-1, 1));\n    }\n}"
}'
```

- Python

```bash
curl -X POST http://localhost:3000/execute \
-H "Content-Type: application/json" \
-d '{
    "language": "python",
    "code": "def add(a, b):\n    return a + b\n\nif __name__ == \"__main__\":\n    print(add(2, 3))",
    "stdin": "",
    "expectedOutput": "",
    "runTests": true,
    "testCode": "import pytest\nfrom program import add\n\ndef test_add():\n    assert add(2, 3) == 5\n    assert add(-1, 1) == 0\n"
}'
```


## Project Structure

```
codeeval-engine/
├── Dockerfile
├── package.json
├── server.js
├── executor.js
├── lib/
│   ├── junit-4.13.2.jar
│   └── hamcrest-core-1.3.jar
├── temp/ (auto-generated)
├── README.md
└── .gitignore
```

## License

This project is licensed under the [MIT License](LICENSE).

---

**Happy Coding! 🚀**