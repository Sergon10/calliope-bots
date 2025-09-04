#!/usr/bin/env node

// -- SCRIPT START --
import fs from 'fs';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import { pathToFileURL } from 'url';

// Import custom utility functions
import { gptInit } from './utils/gptUtils.js';
import { pausaGauss, browserInit, navigateAndFullFill, navigateAndClick } from './utils/puppeteerUtils.js';
import { ordenarArchivos_js } from './utils/fileManager.js';

puppeteer.use(StealthPlugin());

async function gptGetImage(page, prompt, x0, y0, respuestasDOM = 0) {
    let x1, y1, aparentesRespuestas = [];
    let respuesta = "";
    let diagnostico = "";
    try {
        // Selector for the prompt input textarea
        const selectorIntroducirPrompt = 'div[id="prompt-textarea"]';

        // Fill the textarea with the prompt
        ({ x1, y1 } = await navigateAndFullFill(page, selectorIntroducirPrompt, prompt, "fast", x0, y0, true));

        // 1. Send the message
        await pausaGauss(300, 20);
        await page.keyboard.press('Enter');
        await pausaGauss(500, 20);

        // 2. Wait for the response to complete
        let generatedFlag = false;
        let secondsWaiting = 0;
        let nAparentesRespuestas = respuestasDOM;
        while (nAparentesRespuestas <= respuestasDOM && secondsWaiting < 200) {
            // 2.1 Extract containers from the DOM
            aparentesRespuestas = await page.$$('button[aria-label="Download this image"]');
            nAparentesRespuestas = aparentesRespuestas.length;

            // 2.2 Detect new response
            if (nAparentesRespuestas > respuestasDOM) {
                generatedFlag = true;
                console.log("INFO (gptGetImage): Response detected, attempting to click 'download' button...");
                break;
            } else {
                secondsWaiting += 0.5;
                await pausaGauss(500, 1);
            }
        }

        if (!generatedFlag) {
            throw new Error(`No image container found within 200s.`);
        }

        // ---- Download Image ----
        if (aparentesRespuestas.length > respuestasDOM) {
            const botonDownload = aparentesRespuestas[aparentesRespuestas.length - 1];
            await page.mouse.wheel({ deltaY: 600 });
            // A.2.1 Click on the 'Download this image' button
            ({ x1, y1 } = await navigateAndClick(page, botonDownload, x1, y1));
            await pausaGauss(8000, 1000);
        }

    } catch (error) {
        console.log(`ERROR (gptGetImage): Error downloading image #${respuestasDOM + 1}:`, error);
        try {
            // 1. Extract text from the error container
            aparentesRespuestas = await page.$$('div[class="markdown prose dark:prose-invert w-full break-words dark"]');
            const textContainers = await aparentesRespuestas.at(-1)?.$$('p[data-start][data-end]');
            if (!textContainers || textContainers.length === 0) {
                throw new Error("No 'p[data-start][data-end]' elements found in the markdown container");
            }
            for (const container of textContainers) {
                const containerText = await container.getProperty('textContent');
                respuesta += await containerText.jsonValue();
            }

            // 2. Generate diagnostic
            // E2.1 Rate limit
            const limitRelatedWords = ['limit', 'limite', 'límite', 'frecuencia', 'velocidad', 'frecuency', 'temporal', 'minutos', 'minutes'];
            for (let word of limitRelatedWords) {
                if (respuesta.includes(word)) {
                    diagnostico = "(E2.1) Rate limit error...";
                    const matchMin = respuesta.match(/(\d+)\s*minutos?/i);
                    if (matchMin) {
                        const minutos = parseInt(matchMin[1], 10);
                        const delayMs = minutos * 60 * 1000;
                        console.log(`WARNING (bot_Sora): Rate limit – waiting ${minutos} minutes (${delayMs} ms) before retrying.`);
                        await pausaGauss(delayMs, 10);
                        break;
                    }
                }
            }
            // E2.2 Policy violation
            const politicsRelatedWords = ['políticas', 'infringe', 'infring', 'infringir', 'violate', 'violates', 'polices', 'viola'];
            for (let word of politicsRelatedWords) {
                if (respuesta.includes(word)) {
                    diagnostico = '(E2.2) Adjusting prompt to comply with policy: create the closest possible image without prohibited elements.';
                    break;
                }
            }
        } catch (error) {
            console.log(`Could not identify or resolve the underlying cause: ${error}. Setting diagnostic to blank.`);
            diagnostico = " ";
        }
    }
    return { x1, y1, diagnostico };
}

async function bot_Sora(jsonPrompts, contentType, imagesStyle = "Neutral style") { 
    let AR;
    let page, browser, x1, y1, carpetaDescargas, outputsDir, respuestasDOM = 0;

    if (contentType === 'video') {
        AR = '16:9';
    } else if (contentType === 'short') {
        AR = '9:16';
    }

    try {
        // Initialize browser and open a new page
        ({ browser, page, x0: x1, y0: y1, carpetaDescargas, carpetaOutputs: outputsDir } = await browserInit(puppeteer));

        // Initial check for pre-existing .png files in the download directory
        const initCount = ordenarArchivos_js(carpetaDescargas, 'png').length;
        if (initCount > 0) {
            throw new Error(
                `Found ${initCount} .png files in the downloads directory (${carpetaDescargas}). ` +
                `Please remove them before running the bot again.`
            );
        }

        // Declare the function to wait and validate image download
        async function waitAndCheckImage(imageIndex, carpetaOutputs) {
            console.log("INFO (waitAndCheckImage): Proceeding to validate download...");

            const timeoutMs = 10_000;
            const intervalMs = 1_000;
            const t0 = Date.now();

            while (Date.now() - t0 < timeoutMs) {
                const pngFiles = ordenarArchivos_js(carpetaDescargas, "png");
                const outputsDirectory = carpetaOutputs;

                if (pngFiles.length === 1) {
                    // Image detected
                    const rutaVieja = pngFiles.at(-1);
                    let rutaNueva = path.join(outputsDirectory, `${imageIndex}_calliopeBot_image.png`);

                    try {
                        fs.mkdirSync(outputsDirectory, { recursive: true });
                        fs.renameSync(rutaVieja, rutaNueva);
                        console.log(`INFO (waitAndCheckImage): Image #${imageIndex} detected and moved as '${path.basename(rutaNueva)}'.`);
                    } catch (e) {
                        console.log(`WARNING (waitAndCheckImage): Could not rename '${rutaVieja}' → '${rutaNueva}':`, e.message);
                    }
                    return "";
                }

                if (pngFiles.length < 1) {
                    console.log("INFO (waitAndCheckImage): No images found in downloads; waiting...");
                } else {
                    console.log(`WARNING (waitAndCheckImage): More PNGs than expected (${pngFiles.length}).`);
                    throw new Error("Unexpected additional images detected; manual review required.");
                }

                await pausaGauss(intervalMs, 10);
            }

            const pngCount = ordenarArchivos_js(carpetaDescargas, "png").length;
            console.log(`WARNING (waitAndCheckImage): 10s timeout – only ${pngCount}/${imageIndex} images found.`);
            return `Missing images: ${pngCount}/${imageIndex} detected`;
        }

        // Declare function to reset chat session
        async function resetChatSession() {
            if (browser) { await browser.close(); }
            ({ browser, page, x0: x1, y0: y1, carpetaDescargas } = await browserInit(puppeteer));
            await pausaGauss(600, 100);
            await gptInit(page, 'https://chatgpt.com/?model=gpt-4o');
            respuestasDOM = 0;
            await pausaGauss(600, 100);
            return { browser, page, x1, y1 };
        }

        // Enter the custom GPT session
        await gptInit(page, 'https://chatgpt.com/?model=gpt-4o');
        await pausaGauss(600, 100);

        // Generate images based on provided prompts
        let diagnostico = "";
        for (let i = 0; i < jsonPrompts.length; i++) {
            // Required format check
            let positivePrompt = "";
            let negativePrompt = "";
            try {            
                positivePrompt = jsonPrompts[i].positivePrompt;
                negativePrompt = jsonPrompts[i].negativePrompt;
            } catch (error) { throw new Error("ERROR (bot_Sora): The json with the prompts must be a list of objects with two entries (exactly 'positivePrompt' and 'negativePrompt'). Review documentation."); }
            // Prompt declaration
            let prompt = `Create the following image in ${AR} AR for a YouTube ${contentType}. Stick to the image. You can put words in objects but DO NOT INCLUDE RAW TEXT (never include the title or any text in the image beyond words on objects). Keep in mind that each of the following prompts corresponds to a phrase from the ${contentType} script. Each image will be placed synchronously with that phrase in the ${contentType} montage. Therefore, stick to the positive prompt and avoid the negative. The image title is for reference only (DO NOT INCLUDE THAT TEXT IN THE IMAGE). REMEMBER ${AR}. Remember to include text if specific text is mentioned. positive prompt: ${positivePrompt}; negative prompt: ${negativePrompt}.`;
            prompt += `Apply the following image style: ${imagesStyle}`;

            try {
                // Attempt to generate and download image
                ({ x1, y1, diagnostico } = await gptGetImage(page, prompt, x1, y1, respuestasDOM));
                respuestasDOM++;
                await pausaGauss(5000, 100);
                diagnostico += await waitAndCheckImage(i + 1, outputsDir);

                // Handle error diagnostics
                if (diagnostico !== "") {
                    let abrirNuevaVentana = true;
                    let promptRetry = prompt;
                    let trials = 1;
                    const maxDelay = 30 * 60 * 1000;
                    const ratio = Math.pow(maxDelay / 5000, 1 / (10 - 1));

                    while (diagnostico !== "" && trials <= 10) {
                        if (diagnostico.includes('violation')) {
                            promptRetry = `${diagnostico}!. `;
                            abrirNuevaVentana = false;
                        }
                        console.log(`WARNING (bot_Sora): Detected diagnostic: '${diagnostico}'.`);
                        diagnostico = "";
                        console.log("WARNING (bot_Sora): Opening new browser and chat session...");
                        if (abrirNuevaVentana) {
                            ({ browser, page, x1, y1 } = await resetChatSession());
                        }
                        console.log("WARNING (bot_Sora): Retrying download...");
                        ({ x1, y1, diagnostico } = await gptGetImage(page, promptRetry, x1, y1, respuestasDOM));
                        respuestasDOM++;
                        await pausaGauss(5000, 100);
                        diagnostico += await waitAndCheckImage(i + 1, outputsDir);

                        if (diagnostico !== "") {
                            if (diagnostico.includes('violation') && trials > 3) {
                                abrirNuevaVentana = true;
                                promptRetry = prompt + diagnostico;
                                console.log("WARNING (bot_Sora): Policy violation persists after 3 attempts, restarting chat session.");
                            }
                            let delay = Math.round(5000 * Math.pow(ratio, trials - 1));
                            console.log(`WARNING (bot_Sora): Attempt ${trials} failed. Waiting ${Math.round(delay / 1000)}s before next attempt...`);
                            await pausaGauss(delay, 500);
                            trials++;
                        }
                    }
                    if (trials > 10) {
                        const imagenesDetectadas = ordenarArchivos_js(carpetaDescargas, 'png');
                        throw new Error(`Download not detected after ${trials - 1} attempts. Manual intervention required. Detected ${imagenesDetectadas.length} images so far; loop index was i=${i}`);
                    }
                }
            } catch (error) {
                console.log(`WARNING (bot_Sora): Unexpected error on image #${i + 1}:`, error);
                console.log("WARNING (bot_Sora): Gathering diagnostic of the failure...");
                let diagnosticoDeUrgencia = await waitAndCheckImage(i + 1, outputsDir);
                if (diagnosticoDeUrgencia !== "") {
                    console.log(`WARNING (bot_Sora): Image #${i + 1} was NOT generated. Urgent diagnostic -> ${diagnosticoDeUrgencia}`);
                    console.log("WARNING (bot_Sora): Restarting browser, opening new chat session, and retrying the failed image.");
                    i--;
                    ({ browser, page, x1, y1 } = await resetChatSession());
                    continue;
                } else {
                    console.log(`WARNING (bot_Sora): Despite the error, image #${i + 1} was generated.`);
                    console.log("WARNING (bot_Sora): Restarting browser, opening new chat session, and proceeding with next image.");
                    ({ browser, page, x1, y1 } = await resetChatSession());
                    continue;
                }
            }
        }

        // Finish up and close browser
        console.log("Script completed without errors.");
        if (browser) await browser.close();

    } catch (error) {
        if (browser && page) {
            const screenshotPath = path.join(process.cwd(), 'error-screenshot.png');
            await page.screenshot({ path: screenshotPath });
            console.log(`WARNING (bot_Sora): Captured screenshot for error analysis. Saved at: ${screenshotPath}`);
            await pausaGauss(1000, 200);
            await browser.close();
        }
        throw (`ERROR (bot_Sora): ${error}`);
    }
}

// ENTRY POINT:
const thisFileUrl = pathToFileURL(process.argv[1]).href;
if (import.meta.url === thisFileUrl) {
    const [,, promptsPath, contentTypeArg, imageStyleArg] = process.argv;
    if (!promptsPath) {
        console.error('Usage: calliope-sora <prompts.json path> [video|short] "<image_style>"');
        process.exit(1);
    }

    // Read and parse prompts JSON
    let parsedPrompts;
    try {
        parsedPrompts = JSON.parse(fs.readFileSync(path.resolve(promptsPath), 'utf-8'));
    } catch (err) {
        console.error('Error reading prompts file:', err);
        process.exit(1);
    }

    bot_Sora(parsedPrompts, contentTypeArg, imageStyleArg)
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

// -- SCRIPT END --

/**
    // Local tests
    const promptsPath = './prompts.json';
    const contentTypeArg = 'short';
    let parsedPrompts = JSON.parse(fs.readFileSync(path.resolve(promptsPath), 'utf-8'));
    await bot_Sora(parsedPrompts, contentTypeArg);

 * CAMBIOS *
 * - Cambiar 'contentTypeArg' directamente por el AR deseado.
 * - Image Style debe poder ser el 'json prompting' base de los sliders.
 * - El prompt base debe poder ser modificado, el de ahora puede servir como el default.
*/