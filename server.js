const express = require("express");
const bodyParser = require("body-parser");
import cookieParser from "cookie-parser";
import { createClient } from "redis";
const { executeCode } = require("./executor");

const app = express();

app.use(cookieParser());
app.use(bodyParser.json());

let redisClient = createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
});
redisClient.connect().catch(console.error);

const checkSession = async (req, res, next) => {
  try {
    const sessionId = req.cookies["connect.sid"]
      ?.replace("s:", "")
      .split(".")[0];
    if (!sessionId) {
      return res.status(401).json({ error: "Unauthorized: No session ID" });
    }

    const sessionKey = `${REDIS_PREFIX}sess:${sessionId}`;
    const sessionData = await redisClient.get(sessionKey);

    if (!sessionData) {
      return res.status(401).json({ error: "Unauthorized: Session not found" });
    }

    const session = JSON.parse(sessionData);

    if (!session.passport || !session.passport.user) {
      return res
        .status(401)
        .json({ error: "Unauthorized: User not authenticated" });
    }

    req.user = session.passport.user;
    next();
  } catch (error) {
    console.error("Error verifying session:", error);
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
const HOST = process.env.HOST || "localhost";
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
