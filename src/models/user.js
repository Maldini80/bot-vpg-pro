const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    vpgUsername: { type: String, required: true },
    teamName: { type: String, default: null },
    teamLogoUrl: { type: String, default: null },
    isManager: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now },
});

module.exports = mongoose.model('VPGUser', userSchema, 'vpg_users'); // Especificamos nombre de la colección
