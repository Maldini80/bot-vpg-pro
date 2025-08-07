// src/models/teamOffer.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const teamOfferSchema = new Schema({
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, unique: true },
    guildId: { type: String, required: true },
    postedById: { type: String, required: true },
    positions: [{ type: String, required: true }],
    requirements: { type: String, maxLength: 500 },
    status: { type: String, default: 'ACTIVE', enum: ['ACTIVE', 'CLOSED'] },
    // ESTA ES LA LÍNEA NUEVA, AHORA EN SU SITIO CORRECTO
    messageId: { type: String, default: null }, 
}, { timestamps: true });

module.exports = mongoose.model('TeamOffer', teamOfferSchema);
