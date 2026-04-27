const express = require("express")
const authController = require("../controllers/auth.controller")

const router = express.Router()

/*post/api/auth/register */
router.post("/register",authController.userRegisterController)

/*post/api/auth/login */
router.post("/login", authController.userloginController)



/*post/api/auth/logout */
router.post("/logout", authController.userLogoutController)



module.exports = router