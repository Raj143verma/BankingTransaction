const userModel = require("../models/user.model")
const jwt = require("jsonwebtoken")
const  emailService = require("../services/email.service")
const tokenBlacklistModel = require("../models/blacklist.model")

/*
* user register controller 
* post /api/auth/register
 */

 async function userRegisterController(req,res) {
    const {email,name,password} = req.body

    const isExits =  await userModel.findOne({
        email: email
    })
    if(isExits){
        return res.status(422).json({
            message: "User already exits with this email address, Please try with another email address",
            status: "failed"
        })
    }

    const user  = await userModel.create({
        email, name, password
    })

    const token = jwt.sign({id: user._id}, process.env.JWT_SECRET, { expiresIn: "3d"} )
    res.cookie("token", token)
    res.status(201).json({
        user: {
            _id: user._id,
            email: user.email,
            name: user.name
        },
        token
    })
    await emailService.sendRegisterEmail(user.email, user.name)
}

  /*
  * - user Login Controller
  * - post /api/auth/login
   */
  async function userloginController(req,res) {
    const {email,password} = req.body

    const user = await userModel.findOne({email}).select("+password")

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
    res.cookie("token", token)
    res.status(200).json({
        user: {
            _id: user._id,
            email: user.email,
            name: user.name
        },
        token
    })
}

/**
 * - user Logout Controller
 * - post /api/auth/logout
 */

async function userLogoutController(req,res) {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if(!token) {
        return res.status(200).json({
            message: "User is logged out successfully"
        })
    }
    res.cookie("token", "")

    await tokenBlacklistModel.create({
        token: token
    })

        return res.status(200).json({
            message: "User logged out successfully"
        })
}





module.exports = {
    userRegisterController,
    userloginController,
    userLogoutController
}
