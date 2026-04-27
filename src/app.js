const express = require('express');
const cookiesParser = require('cookie-parser');

/** Routes required here
 * - 
*/
const authRouter = require("./routes/auth.routes")
const accountRouter = require("./routes/account.routes")
const transactionRouter = require("./routes/transaction.routes")

const userModel = require("./models/user.model")
const jwt = require("jsonwebtoken")

const app = express();

app.use(express.json())
app.use(cookiesParser())

//  Use Routes

app.use("/api/auth", authRouter)
app.use("/api/accounts", accountRouter)
app.use("/api/transactions", transactionRouter)

module.exports = app;