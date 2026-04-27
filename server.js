require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./src/app');

const connectToDB = require('./src/config/db.js');
connectToDB();

app.listen(3000, () => {
  console.log(`Server is running on port 3000`);
});