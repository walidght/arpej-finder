require('dotenv').config();
const express = require('express');
const { main } = require('./main');

const app = express();

app.get('/', async (req, res) => {
    try {
        // Call the main function and capture its output
        const result = await main();
        res.type('text/plain');
        res.send('Operation completed.');
    } catch (error) {
        console.error(`Error: ${error.message}`);
        res.status(500).send('An error occurred during the operation.');
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
