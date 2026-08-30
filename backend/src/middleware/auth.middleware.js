const usermodel = require("../models/user.model")
const jwt = require("jsonwebtoken")
const tokenBlacklistModel = require("../models/blackList.model")

async function authMiddleware(req, res, next) {
    let token = req.cookies?.token;
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({
            message: "Unauthorized access, token is missing"
        })
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        const isBlacklisted = await tokenBlacklistModel.findOne({ token })
        if (isBlacklisted) {
            return res.status(401).json({
                message: "Unauthorized access, token is invalid"
            })
        }

        const user = await usermodel.findById(decoded.id).select("+systemUser +sessionVersion +lockedUntil +lastLoginAt +passwordChangedAt")
        if (!user) {
            return res.status(401).json({
                message: "Unauthorized access, user not found"
            })
        }

        // Account Lockout check
        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
            return res.status(423).json({
                message: "Account is temporarily locked due to consecutive failed login attempts. Please try again later.",
                lockedUntil: user.lockedUntil
            })
        }

        // Session Version / Revocation check
        if (decoded.sessionVersion !== undefined && user.sessionVersion !== undefined && decoded.sessionVersion !== user.sessionVersion) {
            return res.status(401).json({
                message: "Unauthorized access, session has been revoked or expired"
            })
        }

        req.user = user
        return next()
    } catch(err) {
        return res.status(401).json({
            message: "Unauthorized access, invalid token"
        })
    }
}

async function authSystemUserMiddleware(req, res, next) {
    let token = req.cookies?.token;
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({
            message: "Unauthorized access, token is missing"
        })
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        const isBlacklisted = await tokenBlacklistModel.findOne({ token })
        if (isBlacklisted) {
            return res.status(401).json({
                message: "Unauthorized access, token is invalid"
            })
        }

        const user = await usermodel.findById(decoded.id).select("+systemUser +sessionVersion +lockedUntil +lastLoginAt +passwordChangedAt")
        if (!user) {
            return res.status(401).json({
                message: "Unauthorized access, user not found"
            })
        }

        // Account Lockout check
        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
            return res.status(423).json({
                message: "Account is temporarily locked due to consecutive failed login attempts. Please try again later.",
                lockedUntil: user.lockedUntil
            })
        }

        // Session Version / Revocation check
        if (decoded.sessionVersion !== undefined && user.sessionVersion !== undefined && decoded.sessionVersion !== user.sessionVersion) {
            return res.status(401).json({
                message: "Unauthorized access, session has been revoked or expired"
            })
        }

        if (!user.systemUser) {
            return res.status(403).json({
                message: "Forbidden access, user is not a system user"
            })
        }

        req.user = user
        return next()
    } catch(err) {
        return res.status(401).json({
            message: "Unauthorized access, invalid token"
        })
    }
}

module.exports = {
    authMiddleware,
    authSystemUserMiddleware
}