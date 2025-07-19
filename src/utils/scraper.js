const axios = require('axios');

// Esta es la nueva función que usa la API oficial de VPG. Es mucho más fiable.
async function getVpgProfile(vpgUsername) {
    try {
        // 1. Buscamos el ID interno del usuario a partir de su nombre de usuario.
        const searchUrl = `https://virtualprogaming.com/api/v1/users/search?q=${vpgUsername}`;
        const searchResponse = await axios.get(searchUrl);

        // Filtramos para encontrar una coincidencia exacta, ignorando mayúsculas/minúsculas.
        const user = searchResponse.data.find(u => u.username.toLowerCase() === vpgUsername.toLowerCase());
        
        if (!user) {
            return { error: `No se pudo encontrar un usuario de VPG con el nombre exacto **${vpgUsername}**.` };
        }

        const userId = user.id;

        // 2. Con el ID del usuario, obtenemos su perfil completo.
        const profileUrl = `https://virtualprogaming.com/api/v1/users/${userId}/profile`;
        const profileResponse = await axios.get(profileUrl);
        const profileData = profileResponse.data;

        // 3. Extraemos la información que necesitamos del perfil.
        const team = profileData.contract?.team; // El '?' evita errores si el usuario no tiene contrato/equipo
        if (!team) {
            return { error: `El usuario **${vpgUsername}** no parece tener un equipo activo en este momento.` };
        }

        // Comprobamos si el usuario es mánager en el equipo.
        const isManager = team.managers.some(manager => manager.id === userId);

        // 4. Devolvemos los datos limpios.
        return {
            vpgUsername: profileData.user.username,
            teamName: team.name,
            teamLogoUrl: team.logo,
            isManager: isManager
        };

    } catch (error) {
        console.error("Error en la llamada a la API de VPG:", error.message);
        return { error: "Ocurrió un error inesperado al comunicarnos con los servidores de VPG." };
    }
}

module.exports = { getVpgProfile };
