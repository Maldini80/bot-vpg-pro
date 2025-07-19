// Este archivo guardará IDs importantes para que no estén esparcidos por el código.
// Iremos añadiendo más cosas aquí a medida que construyamos los módulos.

module.exports = {
    // ID del rol que pueden aprobar/rechazar solicitudes (Árbitros/Admins)
    // Asegúrate de que esta variable de entorno esté en Render.
    ROL_APROBADOR_ID: process.env.APPROVER_ROLE_ID, // Ejemplo: '1393505777443930183'

    // ID del canal donde los usuarios inician la solicitud de mánager.
    CANAL_SOLICITUDES_ID: process.env.REQUEST_CHANNEL_ID,

    // ID del canal privado donde los admins/árbitros ven las solicitudes.
    CANAL_APROBACIONES_ID: process.env.APPROVAL_CHANNEL_ID
};

module.exports = { getVpgProfile };
