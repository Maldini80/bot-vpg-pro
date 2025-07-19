const axios = require('axios');

async function getVpgProfile(vpgUsername) {
    try {
        // 1. Buscamos al usuario para obtener su ID.
        const searchUrl = `https://virtualprogaming.com/api/v1/users/search?q=${vpgUsername}`;
        const searchResponse = await axios.get(searchUrl);

        // --- CORRECCIÓN CLAVE ---
        // El error nos dijo que 'searchResponse.data' no es un array.
        // La hipótesis es que el array está dentro de una propiedad, comúnmente llamada 'data'.
        const userArray = searchResponse.data.data;

        // Añadimos una comprobación para asegurarnos de que nuestra hipótesis es correcta.
        if (!Array.isArray(userArray)) {
            console.error("Respuesta inesperada de la API de búsqueda VPG:", searchResponse.data);
            return { error: `La respuesta de la API de VPG no tuvo el formato esperado. No se pudo procesar.` };
        }

        const user = userArray.find(u => u.username.toLowerCase() === vpgUsername.toLowerCase());
        
        if (!user) {
            return { error: `No se pudo encontrar un usuario de VPG con el nombre exacto **${vpgUsername}**.` };
        }

        const userId = user.id;

        // 2. Con el ID, obtenemos el perfil completo.
        const profileUrl = `https://virtualprogaming.com/api/v1/users/${userId}/profile`;
        const profileResponse = await axios.get(profileUrl);
        const profileData = profileResponse.data;

        // 3. Extraemos la información.
        const team = profileData.contract?.team;
        if (!team) {
            return { error: `El usuario **${vpgUsername}** no parece tener un equipo activo en este momento.` };
        }

        const isManager = team.managers.some(manager => manager.id === userId);

        // 4. Devolvemos los datos.
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
