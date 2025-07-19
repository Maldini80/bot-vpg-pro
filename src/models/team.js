// src/models/team.js
const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    league: { type: String, required: true },
    logoUrl: { type: String, required: true },
    managerId: { type: String, unique: true, sparse: true },
    captains: [{ type: String }],
    players: [{ type: String }],
    // Los campos webhookId y webhookToken han sido eliminados.
});

module.exports = mongoose.model('Team', teamSchema, 'teams');
