const express = require("express");
const authController = require("../controllers/auth.controller");
const { authMiddleware } = require("../middleware/auth.middleware");
const { authLimiter } = require("../middleware/rateLimiter.middleware");

const router = express.Router();

/* POST /api/auth/register (Rate limited: 10 req / 15 min) */
router.post("/register", authLimiter, authController.userRegisterController);

/* POST /api/auth/login (Rate limited: 10 req / 15 min) */
router.post("/login", authLimiter, authController.userloginController);

/* GET /api/auth/me */
router.get("/me", authMiddleware, authController.userMeController);

/* POST /api/auth/logout */
router.post("/logout", authController.userLogoutController);

/* POST /api/auth/change-password (Rate limited: 10 req / 15 min) */
router.post("/change-password", authMiddleware, authLimiter, authController.changePasswordController);

/* POST /api/auth/revoke-sessions (Rate limited: 10 req / 15 min) */
router.post("/revoke-sessions", authMiddleware, authLimiter, authController.revokeSessionsController);

/* GET /api/auth/session-status */
router.get("/session-status", authMiddleware, authController.getSessionStatusController);

module.exports = router;