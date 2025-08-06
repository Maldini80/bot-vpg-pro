// src/models/teamOffer.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const teamOfferSchema = new Schema({
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, unique: true }, // Un equipo solo puede tener una oferta activa
    guildId: { type: String, required: true },
    postedById: { type: String, required: true }, // ID del mánager/capi que la publicó
    positions: [{ type: String, required: true }], // Array con las posiciones buscadas, ej: ['DFC', 'MCD']
    requirements: { type: String, maxLength: 500 }, // Descripción de lo que se busca
    status: { type: String, default: 'ACTIVE', enum: ['ACTIVE', 'CLOSED'] },
}, { timestamps: true }); // timestamps añade createdAt y updatedAt

module.exports = mongoose.model('TeamOffer', teamOfferSchema);
