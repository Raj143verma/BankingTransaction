const userModel = require("../models/user.model")
const jwt = require("jsonwebtoken")
const emailService = require("../services/email.service")
const tokenBlacklistModel = require("../models/blackList.model")
const { logAuditEvent } = require("../services/auditLog.service")

function getCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 3 * 24 * 60 * 60 * 1000 // 3 days
    }
}

/**
 * User Register Controller
 * POST /api/auth/register
 */
async function userRegisterController(req, res, next) {
    try {
        const { email, name, password } = req.body || {};

        if (!email || !name || !password) {
            return res.status(400).json({
                status: "error",
                message: "Email, name, and password are required"
            });
        }

        const trimmedEmail = String(email).trim().toLowerCase();
        const trimmedName = String(name).trim();

        if (trimmedEmail.length > 150) {
            return res.status(400).json({
                status: "error",
                message: "Email address cannot exceed 150 characters"
            });
        }

        if (trimmedName.length < 2 || trimmedName.length > 100) {
            return res.status(400).json({
                status: "error",
                message: "Name must be between 2 and 100 characters"
            });
        }

        if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
            return res.status(400).json({
                status: "error",
                message: "Password must be between 8 and 128 characters"
            });
        }

        const isExits = await userModel.findOne({ email: trimmedEmail });
        if (isExits) {
            return res.status(422).json({
                status: "failed",
                message: "User already exists with this email address, Please try with another email address"
            });
        }

        const user = await userModel.create({
            email: trimmedEmail,
            name: trimmedName,
            password
        });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "3d" });
        res.cookie("token", token, getCookieOptions());
        res.status(201).json({
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                systemUser: Boolean(user.systemUser)
            },
            token
        });

        try {
            await emailService.sendRegisterEmail(user.email, user.name);
        } catch (emailErr) {
            console.error("Failed to send welcome email:", emailErr.message);
        }
    } catch (err) {
        if (err.code === 11000) {
            return res.status(422).json({
                status: "failed",
                message: "User already exists with this email address, Please try with another email address"
            });
        }
        if (err.name === "ValidationError") {
            return res.status(400).json({
                status: "error",
                message: err.message
            });
        }
        next(err);
    }
}

/**
 * User Login Controller
 * POST /api/auth/login
 */
async function userloginController(req, res, next) {
    try {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({
                status: "error",
                message: "Email and password are required"
            });
        }

        const trimmedEmail = String(email).trim().toLowerCase();
        if (trimmedEmail.length > 150 || typeof password !== 'string' || password.length > 128) {
            return res.status(401).json({
                status: "error",
                message: "Invalid email or password"
            });
        }

        const user = await userModel.findOne({ email: trimmedEmail }).select("+password +systemUser");

        if (!user) {
            return res.status(401).json({
                status: "error",
                message: "Invalid email or password"
            });
        }
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            return res.status(401).json({
                status: "error",
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "3d" });
        res.cookie("token", token, getCookieOptions());

        if (user.systemUser) {
            try {
                await logAuditEvent({
                    actor: user._id,
                    action: "SYSTEM_LOGIN",
                    resourceType: "USER",
                    resourceId: user._id,
                    previousState: null,
                    newState: { loginTime: new Date() },
                    metadata: {
                        name: user.name,
                        email: user.email
                    },
                    req
                });
            } catch (auditErr) {
                console.error("Failed to log SYSTEM_LOGIN event:", auditErr.message);
            }
        }

        return res.status(200).json({
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                systemUser: Boolean(user.systemUser)
            },
            token
        });
    } catch (err) {
        next(err);
    }
}

/**
 * User Logout Controller
 * POST /api/auth/logout
 */
async function userLogoutController(req, res, next) {
    try {
        let token = req.cookies?.token;
        if (!token && req.headers.authorization?.startsWith("Bearer ")) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (!token) {
            return res.status(200).json({
                message: "User is logged out successfully"
            });
        }
        res.cookie("token", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            expires: new Date(0)
        });

        try {
            await tokenBlacklistModel.create({
                token: token
            });
        } catch (err) {
            if (err.code !== 11000) {
                throw err;
            }
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const loggingOutUser = await userModel.findById(decoded.id).select("+systemUser");
            if (loggingOutUser && loggingOutUser.systemUser) {
                await logAuditEvent({
                    actor: loggingOutUser._id,
                    action: "SYSTEM_LOGOUT",
                    resourceType: "USER",
                    resourceId: loggingOutUser._id,
                    previousState: null,
                    newState: { logoutTime: new Date() },
                    metadata: {
                        name: loggingOutUser.name,
                        email: loggingOutUser.email
                    },
                    req
                });
            }
        } catch (auditErr) {
            // Ignore audit/token verification errors on logout
        }

        return res.status(200).json({
            message: "User logged out successfully"
        });
    } catch (err) {
        next(err);
    }
}

/**
 * Get current user profile Controller
 * GET /api/auth/me
 */
async function userMeController(req, res, next) {
    try {
        const user = req.user;

        return res.status(200).json({
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                systemUser: Boolean(user.systemUser)
            }
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    userRegisterController,
    userloginController,
    userLogoutController,
    userMeController
}


