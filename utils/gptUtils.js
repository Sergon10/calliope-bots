
export async function gptInit(page, url) {

    try {

        // Entra en chatGPT
        await page.goto(url, { waitUntil: 'networkidle2' });

        console.info(`INFO: Se ha entrado con exito en el GPT personalizado`);

    } catch (error) {
        console.error(`ERROR: Ha sucedido un error al abrir ChatGPT ->`, error.message);
    }
}