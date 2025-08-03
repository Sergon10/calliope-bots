import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

/**
 * Copies a long string to the user’s clipboard by writing it to a temporary file
 * and using PowerShell to set the clipboard contents.
 *
 * @param {string} text The text to copy.
 * @throws {Error} If any step in the process fails.
 */
export function copiarTextoLargoPortapapeles(text) {
  try {
    // 1. Create a uniquely named temporary file in the current working directory
    const tempFilePath = path.join(
      process.cwd(),
      `temp-clipboard-${randomUUID()}.txt`
    );

    // 2. Write the text into that file
    fs.writeFileSync(tempFilePath, text, 'utf8');

    // 3. Use PowerShell to copy its contents to the clipboard (preserving UTF-8)
    execSync(
      `powershell -Command "Get-Content -Path '${tempFilePath}' -Raw -Encoding UTF8 | Set-Clipboard"`
    );

    // 4. Remove the temporary file
    fs.unlinkSync(tempFilePath);

  } catch (error) {
    throw new Error(`Failed to copy text to clipboard: ${error.message}`);
  }
}

/**
 * Reads all files in a directory, filters by given extension(s), and
 * returns their absolute paths sorted by creation time (oldest first).
 *
 * @param {string} directory The path to scan.
 * @param {string|string[]} exts One or more extensions (without dot).
 * @returns {string[]} Sorted array of file paths.
 */
export function ordenarArchivos_js(directory, exts) {
  const extensions = (Array.isArray(exts) ? exts : [exts])
    .map(e => e.replace(/^\./, '').toLowerCase());

  let filesArray = [];
  try {
    const entries = fs.readdirSync(directory);
    for (const name of entries) {
      const fullPath = path.join(directory, name);
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const fileExt = path.extname(name).replace(/^\./, '').toLowerCase();
        if (extensions.includes(fileExt)) {
          filesArray.push({ path: fullPath, ctime: stat.birthtime });
        }
      }
    }
  } catch (err) {
    console.error(`ERROR (ordenarArchivos_js): Cannot read directory ${directory}:`, err);
    return [];
  }

  // Sort by creation time ascending
  filesArray.sort((a, b) => a.ctime - b.ctime);
  return filesArray.map(item => item.path);
}
