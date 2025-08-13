const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    channelId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    status: { type: String, default: 'open', enum: ['open', 'claimed', 'closed'] },
    claimedBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
});

module.exports = mongoose.model('Ticket', ticketSchema);