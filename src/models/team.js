// Archivo: src/models/team.js

const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
    // El nombre del equipo, debe ser único en el servidor.
    name: { type: String, required: true, unique: true },
    // El ID del servidor de Discord al que pertenece este equipo.
    guildId: { type: String, required: true },
    // La liga en la que compite.
    league: { type: String, required: true },
    // La URL del escudo del equipo.
    logoUrl: { type: String, required: true },
    
    // Roles asociados al equipo. Guardaremos los IDs de los roles de Discord.
    managerRoleId: { type: String, required: true },
    captainRoleId: { type: String, required: true },
    playerRoleId: { type: String, required: true },

    // Miembros del equipo. Guardaremos los IDs de los usuarios de Discord.
    managerId: { type: String, required: true },
    captains: [{ type: String }], // Un array para los capitanes
    players: [{ type: String }],  // Un array para los jugadores
});

module.exports = mongoose.model('Team', teamSchema, 'teams');
