const express = require('express');
const app = express();
const port = 3000;

// Import handlers
const fundsHandler = require('./api/funds');
const fundHistoryHandler = require('./api/fund-history');

// Mock Vercel req/res
const wrapHandler = (handler) => async (req, res) => {
    const vercelReq = {
        query: req.query,
        body: req.body,
    };
    const vercelRes = {
        status: (code) => ({
            json: (data) => res.status(code).json(data),
            send: (data) => res.status(code).send(data),
        }),
        setHeader: (name, value) => res.setHeader(name, value),
    };
    try {
        await handler(vercelReq, {
            status: (code) => ({
                json: (data) => {
                    if (code >= 400) {
                        console.error(`[DevServer] Error ${code}:`, JSON.stringify(data, null, 2));
                    }
                    res.status(code).json(data);
                },
                send: (data) => res.status(code).send(data),
            }),
            setHeader: (name, value) => res.setHeader(name, value),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

app.get('/api/funds', wrapHandler(fundsHandler));
app.get('/api/fund-history', (req, res, next) => {
    console.log(`[DevServer] History request: code=${req.query.code}, days=${req.query.days}`);
    next();
}, wrapHandler(fundHistoryHandler));

app.listen(port, () => {
    console.log(`Dev API server listening at http://localhost:${port}`);
});
