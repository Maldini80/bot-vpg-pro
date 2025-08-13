const mongoose = require('mongoose');

const ticketConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    logChannelId: { type: String, required: true },
    supportRoleId: { type: String, required: true },
    // Add other config options if needed, e.g., category for tickets
});

module.exports = mongoose.model('TicketConfig', ticketConfigSchema);