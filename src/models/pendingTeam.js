// src/models/pendingTeam.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const pendingTeamSchema = new Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    vpgUsername: { type: String, required: true },
    teamName: { type: String, required: true },
    teamAbbr: { type: String, required: true },
    teamTwitter: { type: String, required: false },
    leagueName: { type: String, required: true },
    // Este índice hace que MongoDB borre automáticamente los documentos
    // que lleven más de 15 minutos en la base de datos.
    // Así se limpian solas las solicitudes abandonadas.
    createdAt: { type: Date, expires: '15m', default: Date.now }
});

module.exports = mongoose.model('PendingTeam', pendingTeamSchema);
