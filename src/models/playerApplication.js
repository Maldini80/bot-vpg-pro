// src/models/playerApplication.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const playerApplicationSchema = new Schema({
    userId: { type: String, required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    presentation: { type: String, required: true, maxLength: 200 },
    status: { type: String, required: true, default: 'pending', enum: ['pending', 'accepted', 'rejected'] },
}, { timestamps: true });

// Índice para evitar que un usuario envíe múltiples solicitudes pendientes
playerApplicationSchema.index({ userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

module.exports = mongoose.model('PlayerApplication', playerApplicationSchema);
