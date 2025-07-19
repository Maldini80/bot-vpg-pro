const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    league: { type: String, required: true },
    logoUrl: { type: String, required: true },
    
    managerId: { type: String, unique: true, sparse: true }, // sparse permite multiples 'null'
    captains: [{ type: String }],
    players: [{ type: String }],

    // Guardamos los datos del webhook para cada equipo
    webhookId: { type: String },
    webhookToken: { type: String },
});

module.exports = mongoose.model('Team', teamSchema, 'teams');
