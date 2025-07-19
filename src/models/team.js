const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    league: { type: String, required: true },
    logoUrl: { type: String, required: true },
    
    // Ya no guardamos los IDs de los roles aquí.

    managerId: { type: String, required: true, unique: true }, // Solo puede haber un mánager
    captains: [{ type: String }],
    players: [{ type: String }],
});

module.exports = mongoose.model('Team', teamSchema, 'teams');
