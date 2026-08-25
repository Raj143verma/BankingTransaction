require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./src/app');

const connectToDB = require('./src/config/db.js');
connectToDB();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});