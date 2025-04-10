const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const { createClient } = require("redis");
const { executeCode } = require("./executor");

const app = express();

app.use(cookieParser());
app.use(bodyParser.json());

const REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
const REDIS_PORT = process.env.REDIS_PORT
  ? Number(process.env.REDIS_PORT)
  : 6379;
const REDIS_PREFIX = process.env.REDIS_PREFIX ?? "codewit";

let redisClient = createClient({
  url: `redis://172.17.0.3:6379`,
});
redisClient.connect().catch(console.error);

const decodeURIComponentSafe = (str) => {
  try {
    return decodeURIComponent(str);
  } catch (error) {
    return str;
  }
};

const checkSession = async (req, res, next) => {
  try {
    const sessionCookie = req.cookies["connect.sid"];
    if (!sessionCookie) {
      return res.status(401).json({ error: "Unauthorized: No session cookie" });
    }

    const decodedCookie = decodeURIComponentSafe(sessionCookie);

    const sessionId = decodedCookie.startsWith("s:")
      ? decodedCookie.substring(2).split(".")[0]
      : decodedCookie.split(".")[0];

    if (!sessionId) {
      return res
        .status(401)
        .json({ error: "Unauthorized: Invalid session ID: " });
    }

    const sessionKey = `${REDIS_PREFIX}:${sessionId}`;
    const sessionData = await redisClient.get(sessionKey);

    // if (!sessionData) {
    //   return res.status(401).json({
    //     error: "Unauthorized: Session not found or expired:",
    //   });
    // }

    const session = JSON.parse(sessionData);

    // if (!session?.passport?.user) {
    //   return res
    //     .status(401)
    //     .json({ error: "Unauthorized: User not authenticated" });
    // }

    req.user = "K";
    next();
  } catch (error) {
    console.error("Error verifying session:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

app.post("/execute", checkSession, async (req, res) => {
  const { language, code, stdin, expectedOutput, runTests, testCode } =
    req.body;

  if (!language || !code) {
    return res
      .status(400)
      .json({ error: "Language and code fields are required." });
  }

  try {
    const result = await executeCode(
      language,
      code,
      stdin,
      expectedOutput,
      runTests,
      testCode
    );
    res.json(result);
  } catch (error) {
    console.error(`Execution error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0" || "localhost";
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
