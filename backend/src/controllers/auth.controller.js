const userModel = require("../models/user.model");
const jwt = require("jsonwebtoken");
const emailService = require("../services/email.service");
const tokenBlacklistModel = require("../models/blackList.model");
const { logAuditEvent } = require("../services/auditLog.service");
const notificationService = require("../services/notification.service");

const SYSTEM_LOGIN_MAX_ATTEMPTS = parseInt(process.env.SYSTEM_LOGIN_MAX_ATTEMPTS || "5", 10);
const SYSTEM_LOGIN_LOCKOUT_MINUTES = parseInt(process.env.SYSTEM_LOGIN_LOCKOUT_MINUTES || "15", 10);

function getCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 3 * 24 * 60 * 60 * 1000 // 3 days
    };
}

/**
 * Server-side password policy validation helper
 */
function validatePasswordPolicy(password) {
    if (typeof password !== "string") {
        return { valid: false, message: "Password must be a string" };
    }
    if (password.trim().length === 0) {
        return { valid: false, message: "Password cannot be empty or whitespace only" };
    }
    if (password.length < 8 || password.length > 128) {
        return { valid: false, message: "Password must be between 8 and 128 characters" };
    }
    // Must contain at least one uppercase, one lowercase, and at least one digit or special character
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigitOrSpecial = /[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (!hasUpper || !hasLower || !hasDigitOrSpecial) {
        return {
            valid: false,
            message: "Password must contain at least one uppercase letter, one lowercase letter, and one number or special character"
        };
    }

    return { valid: true };
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

        const policyCheck = validatePasswordPolicy(password);
        if (!policyCheck.valid) {
            return res.status(400).json({
                status: "error",
                message: policyCheck.message
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
            password,
            sessionVersion: 1
        });

        const token = jwt.sign(
            { id: user._id, sessionVersion: user.sessionVersion || 1 },
            process.env.JWT_SECRET,
            { expiresIn: "3d" }
        );
        res.cookie("token", token, getCookieOptions());
        res.status(201).json({
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                systemUser: Boolean(user.systemUser),
                sessionVersion: user.sessionVersion || 1
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
        if (trimmedEmail.length > 150 || typeof password !== "string" || password.length > 128) {
            return res.status(401).json({
                status: "error",
                message: "Invalid email or password"
            });
        }

        const user = await userModel.findOne({ email: trimmedEmail }).select("+password +systemUser +failedLoginAttempts +lockedUntil +sessionVersion +lastLoginAt +passwordChangedAt");

        if (!user) {
            try {
                await logAuditEvent({
                    actor: null,
                    action: "LOGIN_FAILED",
                    resourceType: "USER",
                    reason: "User not found with provided email",
                    metadata: {
                        email: trimmedEmail
                    },
                    req
                });
            } catch (auditErr) {
                // Ignore audit error during login
            }
            return res.status(401).json({
                status: "error",
                message: "Invalid email or password"
            });
        }

        // Account Lockout check
        if (user.lockedUntil) {
            if (new Date(user.lockedUntil) > new Date()) {
                try {
                    await logAuditEvent({
                        actor: user._id,
                        action: "LOGIN_FAILED",
                        resourceType: "USER",
                        resourceId: user._id,
                        reason: "Account is currently locked",
                        metadata: {
                            email: user.email,
                            lockedUntil: user.lockedUntil
                        },
                        req
                    });
                } catch (auditErr) {}

                return res.status(423).json({
                    status: "error",
                    message: "Account is temporarily locked due to consecutive failed login attempts. Please try again later.",
                    lockedUntil: user.lockedUntil
                });
            } else {
                // Lockout duration expired: reset counter and clear lock
                user.lockedUntil = null;
                user.failedLoginAttempts = 0;
            }
        }

        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
            let isLockedNow = false;

            if (user.systemUser && user.failedLoginAttempts >= SYSTEM_LOGIN_MAX_ATTEMPTS) {
                user.lockedUntil = new Date(Date.now() + SYSTEM_LOGIN_LOCKOUT_MINUTES * 60 * 1000);
                isLockedNow = true;
            }

            await user.save();

            try {
                await logAuditEvent({
                    actor: user._id,
                    action: isLockedNow ? "SYSTEM_ACCOUNT_LOCKED" : "LOGIN_FAILED",
                    resourceType: "USER",
                    resourceId: user._id,
                    reason: isLockedNow
                        ? `Exceeded max failed login attempts (${SYSTEM_LOGIN_MAX_ATTEMPTS})`
                        : "Invalid password attempt",
                    metadata: {
                        email: user.email,
                        failedAttempts: user.failedLoginAttempts,
                        lockedUntil: user.lockedUntil
                    },
                    req
                });
            } catch (auditErr) {
                console.error("Failed to log audit event on failed login:", auditErr.message);
            }

            try {
                if (isLockedNow) {
                    await notificationService.createNotification({
                        recipient: user._id,
                        type: "SECURITY_ACCOUNT_LOCKED",
                        title: "Account Temporarily Locked",
                        message: `Your account has been temporarily locked due to consecutive failed login attempts. Lockout until ${user.lockedUntil ? new Date(user.lockedUntil).toLocaleTimeString() : '15 minutes'}.`,
                        severity: "ERROR",
                        relatedResourceType: "USER",
                        relatedResourceId: user._id,
                        metadata: { failedAttempts: user.failedLoginAttempts, lockedUntil: user.lockedUntil }
                    });
                } else {
                    await notificationService.createNotification({
                        recipient: user._id,
                        type: "SECURITY_LOGIN_FAILED",
                        title: "Failed Login Attempt",
                        message: `A failed login attempt was detected on your account (Attempt ${user.failedLoginAttempts}).`,
                        severity: "WARNING",
                        relatedResourceType: "USER",
                        relatedResourceId: user._id,
                        metadata: { failedAttempts: user.failedLoginAttempts }
                    });
                }
            } catch (notifErr) {
                console.error("Failed to emit notification on failed login:", notifErr.message);
            }

            if (isLockedNow) {
                return res.status(423).json({
                    status: "error",
                    message: "Account is temporarily locked due to consecutive failed login attempts. Please try again later.",
                    lockedUntil: user.lockedUntil
                });
            }

            return res.status(401).json({
                status: "error",
                message: "Invalid email or password"
            });
        }

        // Successful authentication: Reset failed attempts, update lastLoginAt
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
        user.lastLoginAt = new Date();
        await user.save();

        const sessionVersion = user.sessionVersion || 1;
        const token = jwt.sign(
            { id: user._id, sessionVersion },
            process.env.JWT_SECRET,
            { expiresIn: "3d" }
        );
        res.cookie("token", token, getCookieOptions());

        if (user.systemUser) {
            try {
                await logAuditEvent({
                    actor: user._id,
                    action: "SYSTEM_LOGIN",
                    resourceType: "USER",
                    resourceId: user._id,
                    previousState: null,
                    newState: { loginTime: user.lastLoginAt, sessionVersion },
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

        try {
            await notificationService.createNotification({
                recipient: user._id,
                type: "SECURITY_LOGIN",
                title: "New Login Detected",
                message: `You have successfully signed in to your account at ${new Date().toLocaleTimeString()}.`,
                severity: "INFO",
                relatedResourceType: "USER",
                relatedResourceId: user._id,
                metadata: { loginTime: user.lastLoginAt }
            });
        } catch (notifErr) {
            console.error("Failed to emit notification on successful login:", notifErr.message);
        }

        return res.status(200).json({
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                systemUser: Boolean(user.systemUser),
                sessionVersion,
                lastLoginAt: user.lastLoginAt,
                passwordChangedAt: user.passwordChangedAt
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
                systemUser: Boolean(user.systemUser),
                sessionVersion: user.sessionVersion || 1,
                lastLoginAt: user.lastLoginAt,
                passwordChangedAt: user.passwordChangedAt
            }
        });
    } catch (err) {
        next(err);
    }
}

/**
 * Change Password Controller
 * POST /api/auth/change-password
 */
async function changePasswordController(req, res, next) {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body || {};

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                status: "error",
                message: "Current password and new password are required"
            });
        }

        if (confirmPassword !== undefined && newPassword !== confirmPassword) {
            return res.status(400).json({
                status: "error",
                message: "New password and confirm password do not match"
            });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({
                status: "error",
                message: "New password cannot be identical to the current password"
            });
        }

        const policyCheck = validatePasswordPolicy(newPassword);
        if (!policyCheck.valid) {
            return res.status(400).json({
                status: "error",
                message: policyCheck.message
            });
        }

        const user = await userModel.findById(req.user._id).select("+password +systemUser +sessionVersion");
        if (!user) {
            return res.status(404).json({
                status: "error",
                message: "User not found"
            });
        }

        const isCurrentValid = await user.comparePassword(currentPassword);
        if (!isCurrentValid) {
            return res.status(400).json({
                status: "error",
                message: "Current password is incorrect"
            });
        }

        // Apply password change, update timestamp, and increment session version to invalidate old tokens
        user.password = newPassword;
        user.passwordChangedAt = new Date();
        user.sessionVersion = (user.sessionVersion || 1) + 1;
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
        await user.save();

        // Sign new JWT token for the current session with updated session version
        const token = jwt.sign(
            { id: user._id, sessionVersion: user.sessionVersion },
            process.env.JWT_SECRET,
            { expiresIn: "3d" }
        );
        res.cookie("token", token, getCookieOptions());

        try {
            await logAuditEvent({
                actor: user._id,
                action: "PASSWORD_CHANGED",
                resourceType: "USER",
                resourceId: user._id,
                reason: "Account password changed successfully",
                metadata: {
                    sessionVersion: user.sessionVersion,
                    passwordChangedAt: user.passwordChangedAt
                },
                req
            });
        } catch (auditErr) {
            console.error("Failed to log PASSWORD_CHANGED audit event:", auditErr.message);
        }

        try {
            await notificationService.createNotification({
                recipient: user._id,
                type: "SECURITY_PASSWORD_CHANGED",
                title: "Password Changed",
                message: "Your account password was updated successfully. Previous active sessions were revoked.",
                severity: "WARNING",
                relatedResourceType: "USER",
                relatedResourceId: user._id,
                metadata: { sessionVersion: user.sessionVersion }
            });
        } catch (notifErr) {
            console.error("Failed to emit notification on password change:", notifErr.message);
        }

        return res.status(200).json({
            status: "success",
            message: "Password changed successfully. Previous sessions have been revoked.",
            sessionVersion: user.sessionVersion,
            token
        });
    } catch (err) {
        next(err);
    }
}

/**
 * Revoke Active Sessions Controller
 * POST /api/auth/revoke-sessions
 */
async function revokeSessionsController(req, res, next) {
    try {
        const user = await userModel.findById(req.user._id).select("+systemUser +sessionVersion");
        if (!user) {
            return res.status(404).json({
                status: "error",
                message: "User not found"
            });
        }

        // Increment session version so previously issued tokens with the older version are rejected
        user.sessionVersion = (user.sessionVersion || 1) + 1;
        await user.save();

        // Issue fresh token for the current session
        const token = jwt.sign(
            { id: user._id, sessionVersion: user.sessionVersion },
            process.env.JWT_SECRET,
            { expiresIn: "3d" }
        );
        res.cookie("token", token, getCookieOptions());

        try {
            await logAuditEvent({
                actor: user._id,
                action: "SESSIONS_REVOKED",
                resourceType: "USER",
                resourceId: user._id,
                reason: "User triggered session revocation",
                metadata: {
                    newSessionVersion: user.sessionVersion
                },
                req
            });
        } catch (auditErr) {
            console.error("Failed to log SESSIONS_REVOKED audit event:", auditErr.message);
        }

        try {
            await notificationService.createNotification({
                recipient: user._id,
                type: "SECURITY_SESSIONS_REVOKED",
                title: "Sessions Revoked",
                message: "All other active sessions for your account have been successfully terminated.",
                severity: "WARNING",
                relatedResourceType: "USER",
                relatedResourceId: user._id,
                metadata: { sessionVersion: user.sessionVersion }
            });
        } catch (notifErr) {
            console.error("Failed to emit notification on sessions revoked:", notifErr.message);
        }

        return res.status(200).json({
            status: "success",
            message: "All other active sessions have been revoked successfully",
            sessionVersion: user.sessionVersion,
            token
        });
    } catch (err) {
        next(err);
    }
}

/**
 * Get Session & Security Status Controller
 * GET /api/auth/session-status
 */
async function getSessionStatusController(req, res, next) {
    try {
        const user = req.user;

        return res.status(200).json({
            status: "success",
            session: {
                active: true,
                sessionVersion: user.sessionVersion || 1,
                lastLoginAt: user.lastLoginAt || null,
                passwordChangedAt: user.passwordChangedAt || null,
                lockedUntil: user.lockedUntil || null,
                failedLoginAttempts: user.failedLoginAttempts || 0
            },
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
    validatePasswordPolicy,
    userRegisterController,
    userloginController,
    userLogoutController,
    userMeController,
    changePasswordController,
    revokeSessionsController,
    getSessionStatusController
};
