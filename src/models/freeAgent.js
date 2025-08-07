// src/models/freeAgent.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const freeAgentSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    // --- NUEVO CAMPO AÑADIDO ---
    messageId: { type: String, default: null }, // Para guardar el ID del mensaje del anuncio
    // --- FIN DEL CAMPO AÑADIDO ---
    experience: { type: String, maxLength: 500 },
    seeking: { type: String, maxLength: 500 },
    availability: { type: String, maxLength: 200 },
    status: { type: String, default: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] },
}, { timestamps: true });

module.exports = mongoose.model('FreeAgent', freeAgentSchema);
