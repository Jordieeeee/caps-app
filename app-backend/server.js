const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Mongo connected'))
    .catch(err => console.error(err));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(process.env.PORT, () => console.log(`Running on ${process.env.PORT}`));