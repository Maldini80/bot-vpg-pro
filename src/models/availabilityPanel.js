// src/models/availabilityPanel.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const timeSlotSchema = new Schema({
    time: { type: String, required: true }, // "22:00", "INSTANT", etc.
    status: { type: String, required: true, default: 'UNAVAILABLE', enum: ['UNAVAILABLE', 'AVAILABLE', 'PENDING', 'CONFIRMED'] },
    challengerTeamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    challengerUserId: { type: String, default: null }
});

const availabilityPanelSchema = new Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, unique: true }, // Un panel por equipo
    postedById: { type: String, required: true },
    panelType: { type: String, required: true, enum: ['SCHEDULED', 'INSTANT'] },
    timeSlots: [timeSlotSchema]
}, { timestamps: true });

module.exports = mongoose.model('AvailabilityPanel', availabilityPanelSchema);
