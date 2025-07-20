// src/models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    vpgUsername: { type: String, required: true },
    position: { type: String, default: null }, // <-- CAMPO NUEVO
    teamName: { type: String, default: null },
    teamLogoUrl: { type: String, default: null },
    isManager: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now },
});

module.exports = mongoose.model('VPGUser', userSchema, 'vpg_users');
