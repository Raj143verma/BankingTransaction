const express = require('express');
const cors = require('cors');
const cookiesParser = require('cookie-parser');

/** Routes required here
 * - 
*/
const authRouter = require("./routes/auth.routes")
const accountRouter = require("./routes/account.routes")
const transactionRouter = require("./routes/transaction.routes")
const accountApplicationRouter = require("./routes/accountApplication.routes")

const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true
}));

app.use(express.json())
app.use(cookiesParser())

//  Use Routes

app.use("/api/auth", authRouter)
app.use("/api/accounts", accountRouter)
app.use("/api/transactions", transactionRouter)
app.use("/api/account-applications", accountApplicationRouter)

module.exports = app;