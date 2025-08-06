// src/models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    vpgUsername: { type: String, default: null },
    // NUEVOS CAMPOS PARA LAS POSICIONES
    primaryPosition: { type: String, default: null },
    secondaryPosition: { type: String, default: null },
    twitterHandle: { type: String, default: null },
    teamName: { type: String, default: null },
    teamLogoUrl: { type: String, default: null },
    isManager: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now },
});

module.exports = mongoose.model('VPGUser', userSchema, 'vpg_users');
