// src/models/freeAgent.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const freeAgentSchema = new Schema({
    userId: { type: String, required: true, unique: true }, // El ID de Discord del jugador
    guildId: { type: String, required: true },
    description: { type: String, maxLength: 500 }, // Descripción del jugador
    availability: { type: String, maxLength: 200 }, // Disponibilidad horaria
    status: { type: String, default: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] }, // Por si en el futuro queremos desactivarlos
}, { timestamps: true }); // timestamps añade createdAt y updatedAt automáticamente

module.exports = mongoose.model('FreeAgent', freeAgentSchema);
