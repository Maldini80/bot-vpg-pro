// src/models/availabilityPanel.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// AÑADIDO: Schema para guardar las peticiones pendientes de desafío por separado.
// Esto permite que un mismo horario reciba múltiples desafíos a la vez.
const pendingChallengeSchema = new Schema({
    _id: { type: Schema.Types.ObjectId, required: true, default: () => new mongoose.Types.ObjectId() },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    userId: { type: String, required: true }
});

const timeSlotSchema = new Schema({
    time: { type: String, required: true },
    // MODIFICADO: Un horario ahora solo puede estar 'DISPONIBLE' o 'CONFIRMADO'.
    // El estado 'PENDIENTE' se gestiona a través del array de abajo.
    status: { type: String, required: true, default: 'AVAILABLE', enum: ['AVAILABLE', 'CONFIRMED'] },
    // Este campo solo se rellena cuando un desafío es aceptado.
    challengerTeamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    // MODIFICADO: Este array contendrá todas las peticiones de desafío pendientes para este horario.
    pendingChallenges: [pendingChallengeSchema]
});

const availabilityPanelSchema = new Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    postedById: { type: String, required: true },
    panelType: { type: String, required: true, enum: ['SCHEDULED', 'INSTANT'] },
    // AÑADIDO: Campo para almacenar las ligas seleccionadas en el filtro.
    leagues: [{ type: String }],
    timeSlots: [timeSlotSchema]
}, { timestamps: true });

// AÑADIDO: Índice compuesto para asegurar que un equipo solo pueda tener
// un panel de cada tipo (SCHEDULED o INSTANT) activo a la vez.
availabilityPanelSchema.index({ teamId: 1, panelType: 1 }, { unique: true });

module.exports = mongoose.model('AvailabilityPanel', availabilityPanelSchema);
