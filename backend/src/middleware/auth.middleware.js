const usermodel = require("../models/user.model")
const jwt = require("jsonwebtoken")
const tokenBlacklistModel = require("../models/blackList.model")

async function authMiddleware(req,res,next) {
    let token = req.cookies?.token;
    if(!token && req.headers.authorization?.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if(!token) {
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

        const user = await usermodel.findById(decoded.id).select("+systemUser")
        if (!user) {
            return res.status(401).json({
                message: "Unauthorized access, user not found"
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

async function authSystemUserMiddleware(req,res,next) {
    let token = req.cookies?.token;
    if(!token && req.headers.authorization?.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if(!token) {
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

        const user = await usermodel.findById(decoded.id).select("+systemUser")
        if (!user) {
            return res.status(401).json({
                message: "Unauthorized access, user not found"
            })
        }

        if(!user.systemUser) {
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