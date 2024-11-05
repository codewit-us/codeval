const express = require('express');
const bodyParser = require('body-parser');
const { executeCode } = require('./executor');

const app = express();
app.use(bodyParser.json());

app.post('/execute', async (req, res) => {
    const { language, code, stdin, expectedOutput, runTests, testCode } = req.body;

    // Basic validation
    if (!language || !code) {
        return res.status(400).json({ error: 'Language and code fields are required.' });
    }

    try {
        const result = await executeCode(language, code, stdin, expectedOutput, runTests, testCode);
        res.json(result);
    } catch (error) {
        console.error(`Execution error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
