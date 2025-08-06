// src/models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    // CAMBIO: Hacemos que no sea requerido para que el perfil pueda crearse primero
    vpgUsername: { type: String, default: null },
    position: { type: String, default: null },
    // NUEVO: Campo para el Twitter del usuario
    twitterHandle: { type: String, default: null },
    teamName: { type: String, default: null },
    teamLogoUrl: { type: String, default: null },
    isManager: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now },
});

module.exports = mongoose.model('VPGUser', userSchema, 'vpg_users');
