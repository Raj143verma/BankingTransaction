const userModel = require("../models/user.model")
const jwt = require("jsonwebtoken")
const emailService = require("../services/email.service")
const tokenBlacklistModel = require("../models/blackList.model")

function getCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 3 * 24 * 60 * 60 * 1000 // 3 days
    }
}

/*
* user register controller 
* post /api/auth/register
 */

 async function userRegisterController(req,res) {
    try {
        const {email,name,password} = req.body

        const isExits = await userModel.findOne({
            email: email
        })
        if(isExits){
            return res.status(422).json({
                message: "User already exists with this email address, Please try with another email address",
                status: "failed"
            })
        }

        const user = await userModel.create({
            email, name, password
        })

        const token = jwt.sign({id: user._id}, process.env.JWT_SECRET, { expiresIn: "3d"} )
        res.cookie("token", token, getCookieOptions())
        res.status(201).json({
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                systemUser: Boolean(user.systemUser)
            },
            token
        })
        try {
            await emailService.sendRegisterEmail(user.email, user.name)
        } catch(emailErr) {
            console.error("Failed to send welcome email:", emailErr.message)
        }
    } catch(err) {
        if(err.code === 11000) {
            return res.status(422).json({
                message: "User already exists with this email address, Please try with another email address",
                status: "failed"
            })
        }
        if(err.name === "ValidationError") {
            return res.status(400).json({
                message: err.message
            })
        }
        return res.status(500).json({
            message: err.message || "Registration failed"
        })
    }
}

  /*
  * - user Login Controller
  * - post /api/auth/login
   */
  async function userloginController(req,res) {
    try {
        const {email,password} = req.body

        const user = await userModel.findOne({email}).select("+password +systemUser")

        if(!user) {
            return res.status(401).json({
                message: " Invalid email or password"
            })
        }
        const isValidPassword = await user.comparePassword(password)
        if(!isValidPassword){
            return res.status(401).json({
                message: "Invalid email or password"
            })
        }

        const token = jwt.sign({id: user._id}, process.env.JWT_SECRET, { expiresIn: "3d"} )
        res.cookie("token", token, getCookieOptions())
        return res.status(200).json({
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                systemUser: Boolean(user.systemUser)
            },
            token
        })
    } catch(err) {
        return res.status(500).json({
            message: err.message || "Login failed"
        })
    }
}

/**
 * - user Logout Controller
 * - post /api/auth/logout
 */

async function userLogoutController(req,res) {
    try {
        let token = req.cookies?.token;
        if(!token && req.headers.authorization?.startsWith("Bearer ")) {
            token = req.headers.authorization.split(" ")[1];
        }

        if(!token) {
            return res.status(200).json({
                message: "User is logged out successfully"
            })
        }
        res.cookie("token", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            expires: new Date(0)
        })

        try {
            await tokenBlacklistModel.create({
                token: token
            })
        } catch(err) {
            if(err.code !== 11000) {
                throw err;
            }
        }

        return res.status(200).json({
            message: "User logged out successfully"
        })
    } catch(err) {
        return res.status(500).json({
            message: err.message || "Logout failed"
        })
    }
}

/**
 * - get current user profile Controller
 * - get /api/auth/me
 */
async function userMeController(req,res) {
    try {
        const user = req.user;

        return res.status(200).json({
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                systemUser: Boolean(user.systemUser)
            }
        })
    } catch(err) {
        return res.status(500).json({
            message: err.message || "Failed to fetch user profile"
        })
    }
}

module.exports = {
    userRegisterController,
    userloginController,
    userLogoutController,
    userMeController
}


