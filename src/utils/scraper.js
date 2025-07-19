const puppeteer = require('puppeteer');
const axios = require('axios');

async function getVpgProfile(vpgUsername) {
    let browser = null;
    try {
        console.log(`PUPPETEER-API: Iniciando navegador para obtener sesión para ${vpgUsername}...`);
        
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        
        // 1. Navegamos a la página principal para obtener las cookies de sesión
        await page.goto('https://virtualprogaming.com', { waitUntil: 'networkidle2' });
        
        // Esperamos un momento para asegurar que cualquier script de Cloudflare se ejecute
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 2. Extraemos las cookies y el user-agent del navegador
        const cookies = await page.cookies();
        const userAgent = await page.evaluate(() => navigator.userAgent);
        
        await browser.close();
        browser = null;
        console.log('PUPPETEER-API: Navegador cerrado. Sesión obtenida.');

        // 3. Preparamos las cookies para la petición de Axios
        const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

        // 4. Buscamos al usuario usando la API, pero ahora con las cookies y cabeceras de la sesión válida
        const searchUrl = `https://virtualprogaming.com/api/v1/users/search?q=${vpgUsername}`;
        const searchResponse = await axios.get(searchUrl, {
            headers: {
                'Cookie': cookieString,
                'User-Agent': userAgent,
                'Referer': 'https://virtualprogaming.com/'
            }
        });

        const userArray = searchResponse.data.data;
        if (!Array.isArray(userArray)) {
            console.error("Respuesta inesperada de la API de búsqueda VPG:", searchResponse.data);
            return { error: `La respuesta de la API de VPG no tuvo el formato esperado.` };
        }
        
        const user = userArray.find(u => u.username.toLowerCase() === vpgUsername.toLowerCase());
        if (!user) {
            return { error: `No se pudo encontrar un usuario de VPG con el nombre exacto **${vpgUsername}**.` };
        }

        const userId = user.id;

        // 5. Obtenemos el perfil completo usando la misma sesión
        const profileUrl = `https://virtualprogaming.com/api/v1/users/${userId}/profile`;
        const profileResponse = await axios.get(profileUrl, {
            headers: {
                'Cookie': cookieString,
                'User-Agent': userAgent,
                'Referer': `https://virtualprogaming.com/user/${vpgUsername}`
            }
        });
        const profileData = profileResponse.data;

        const team = profileData.contract?.team;
        if (!team) {
            return { error: `El usuario **${vpgUsername}** no parece tener un equipo activo en este momento.` };
        }

        const isManager = team.managers.some(manager => manager.id === userId);

        return {
            vpgUsername: profileData.user.username,
            teamName: team.name,
            teamLogoUrl: team.logo,
            isManager: isManager
        };

    } catch (error) {
        console.error(`PUPPETEER-API ERROR para ${vpgUsername}:`, error.message);
        return { error: `No se pudo obtener la información de VPG para **${vpgUsername}**. El sitio podría estar bajo protección intensa.` };
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { getVpgProfile };
