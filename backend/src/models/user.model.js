const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");



const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, "Email is required for creating an account"],
        trim: true,
        lowercase: true,
        maxlength: [150, "Email address cannot exceed 150 characters"],
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid email address"],
        unique: true
    },
    name: {
        type: String,
        required: [true, "Name is required for creating an account"],
        trim: true,
        minlength: [2, "Name must be at least 2 characters long"],
        maxlength: [100, "Name cannot exceed 100 characters"]
    },
    password: {
        type: String,
        required: [true, "Password is required for creating an account"],
        minlength: [8, "Password must be at least 8 characters long"],
        select: false
    },
    systemUser: {
        type: Boolean,
        default: false,
        immutable: true
    },
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockedUntil: {
        type: Date,
        default: null
    },
    lastLoginAt: {
        type: Date,
        default: null
    },
    passwordChangedAt: {
        type: Date,
        default: null
    },
    sessionVersion: {
        type: Number,
        default: 1
    }
}, {
    timestamps: true
});

userSchema.pre("save", async function ( ) {
    if (!this.isModified("password")) {
        return 
    }
    const hash = await bcrypt.hash(this.password, 10)
    this.password = hash
    return 
})


userSchema.methods.comparePassword = async function (password) {
    return await bcrypt.compare(password, this.password)
}

const userModel = mongoose.model("User", userSchema)

module.exports = userModel