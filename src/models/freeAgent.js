// src/models/freeAgent.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const freeAgentSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    // --- CAMPOS MODIFICADOS ---
    experience: { type: String, maxLength: 500 }, // Para la experiencia
    seeking: { type: String, maxLength: 500 },    // Para 'Qué busca'
    availability: { type: String, maxLength: 200 }, // Disponibilidad horaria
    // --- FIN DE CAMPOS MODIFICADOS ---
    status: { type: String, default: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] },
}, { timestamps: true });

module.exports = mongoose.model('FreeAgent', freeAgentSchema);
