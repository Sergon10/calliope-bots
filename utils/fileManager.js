import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto'; // ← Usa la función nativa en vez de 'uuid'


// Extraer project_root del config


export function copiarTextoLargoPortapapeles(texto) {
  try {
    // 1. Crear un archivo temporal con un nombre único en la raíz del proyecto
    const rutaArchivoTemporal = path.join(
      process.cwd(), // Raiz desde donde se ejecuta el script
      `temp-clipboard-${randomUUID()}.txt`
    );

    // 2. Guardar el texto en el archivo temporal
    fs.writeFileSync(rutaArchivoTemporal, texto, 'utf8');

    // 3. Ejecutar el comando de PowerShell usando -Raw y -Encoding UTF8 para preservar caracteres especiales
    execSync(`powershell -Command "Get-Content -Path '${rutaArchivoTemporal}' -Raw -Encoding UTF8 | Set-Clipboard"`);

    // 4. Eliminar el archivo temporal después de copiarlo
    fs.unlinkSync(rutaArchivoTemporal);

  } catch (error) {
    throw new Error(`ERROR: No se pudo copiar el texto al portapapeles: ${error.message}`);
  }
}

export function ordenarArchivos_js(directory, exts) {
  // Normalizar extensions a array de strings sin punto y en minúsculas
  const extensions = (Array.isArray(exts) ? exts : [exts])
    .map(e => e.replace(/^\./, '').toLowerCase());

  let filesArray = [];
  try {
    // Listar todos los elementos
    const entries = fs.readdirSync(directory);
    for (const name of entries) {
      const fullPath = path.join(directory, name);
      const stat = fs.statSync(fullPath);
      // Filtrar solo ficheros
      if (stat.isFile()) {
        const fileExt = path.extname(name).replace(/^\./, '').toLowerCase();
        if (extensions.includes(fileExt)) {
          filesArray.push({ path: fullPath, ctime: stat.birthtime });
        }
      }
    }
  } catch (err) {
    console.log(`ERROR (ordenarArchivos_js): Imposible leer directorio ${directory}:`, err);
    return [];
  }

  // Ordenar por fecha de creación (el más antiguo primero)
  filesArray.sort((a, b) => a.ctime - b.ctime);

  // Devolver únicamente el array de rutas
  return filesArray.map(item => item.path);
}
