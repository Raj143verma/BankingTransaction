const usermodel = require("../models/user.model")
const jwt = require("jsonwebtoken")
const tokenBlacklistModel = require("../models/blackList.model")



async function authMiddleware(req,res,next) {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1]
    if(!token) {
        return res.status(401).json({
            message: "Unauthorized access, token is missing"
        })
}
const isBlacklisted = await tokenBlacklistModel.findOne({ token })

    if (isBlacklisted) {
        return res.status(401).json({
            message: "Unauthorized access, token is invalid"
        })
    }




try{
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
    const user = await usermodel.findById(decoded.id)
    
    req.user = user

    return next()

}catch(err) {
    return res.status(401).json({
        message: "Unauthorized access, invalid token"
    })
}

}

async function authSystemUserMiddleware(req,res,next) {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1]
    if(!token) {
        return res.status(401).json({
            message: "Unauthorized access, token is missing"
        })
}

const isBlacklisted = await tokenBlacklistModel.findOne({ token })

    if (isBlacklisted) {
        return res.status(401).json({
            message: "Unauthorized access, token is invalid"
        })
    }

try{
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await usermodel.findById(decoded.id).select("+systemUser")
    if(!user.systemUser) {
        return res.status(403).json({
            message: "Forbidden access, user is not a system user"
        })
    }
    req.user = user

    return next()
}
catch(err) {
    return res.status(401).json({
        message: "Unauthorized access, invalid token"
    })
}
}

module.exports = {
    authMiddleware,
    authSystemUserMiddleware
}