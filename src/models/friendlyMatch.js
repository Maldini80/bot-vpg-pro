// src/models/friendlyMatch.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const friendlyMatchSchema = new Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    postedById: { type: String, required: true },
    matchType: { type: String, required: true, enum: ['SCHEDULED', 'INSTANT'] },
    scheduledTime: { type: String, default: null }, // ej. "22:40"
    status: { type: String, required: true, default: 'OPEN', enum: ['OPEN', 'PENDING_APPROVAL', 'CONFIRMED'] },
    challengerTeamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    challengerUserId: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('FriendlyMatch', friendlyMatchSchema);
