const fs = require('fs');
const path = require('path');

// Mapeo de IDs de Rol a códigos de idioma (los archivos .json)
const roleToLang = {
    '1392409960322826270': 'es', // Español
    '1392410199490302043': 'en', // English
    '1392410102706737282': 'it', // Italiano
    '1392410295044931746': 'fr', // Français
    '1392410361063276575': 'pt', // Português
    '1392410401391775814': 'de', // Deutsch
    '1392410445578637342': 'tr', // Türkçe
};

const translations = {};

// Cargar todos los archivos de idioma de la carpeta 'locales'
const localesDir = path.join(__dirname, '../locales');
fs.readdirSync(localesDir).forEach(file => {
    if (file.endsWith('.json')) {
        const lang = path.basename(file, '.json');
        translations[lang] = require(path.join(localesDir, file));
    }
});

/**
 * Obtiene el texto traducido para un usuario.
 * @param {string} key La clave del texto a buscar (ej: 'playerActionsTitle').
 * @param {import('discord.js').GuildMember} member El miembro de Discord.
 * @returns {string} El texto en el idioma correcto.
 */
function t(key, member) {
    let userLang = 'es'; // Idioma por defecto es Español

    // Busca si el miembro tiene alguno de los roles de idioma
    for (const roleId in roleToLang) {
        if (member.roles.cache.has(roleId)) {
            userLang = roleToLang[roleId];
            break; // Encontramos un idioma, dejamos de buscar
        }
    }

    // Devuelve el texto del diccionario correcto. Si no existe, devuelve la clave.
    return translations[userLang]?.[key] || key;
}

module.exports = t;
