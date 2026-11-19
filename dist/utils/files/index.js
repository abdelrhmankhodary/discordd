"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.popFirstLine = popFirstLine;
const fs_1 = require("fs");
/**
 * Sleeps for the given number of milliseconds.
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Reads the first non-empty line from a file, removes it from the file, and returns it.
 * If the first line is empty (i.e. just `'\n'` or `''`), waits 1 second and retries.
 *
 * @param filePath - Path to the text file.
 * @returns The first non-empty line (without the trailing newline).
 * @throws If the file does not exist or cannot be read/written.
 */
async function popFirstLine(filePath) {
    // Keep trying until we get a non-empty first line
    while (true) {
        let fileContents;
        try {
            // Read the entire file as UTF-8 text
            fileContents = await fs_1.promises.readFile(filePath, "utf-8");
        }
        catch (err) {
            // If file doesn't exist or is otherwise unreadable, rethrow
            throw new Error(`Failed to read file "${filePath}": ${err.message}`);
        }
        // Split on U+000A (LF). We preserve empty strings if there are leading newlines.
        const lines = fileContents.split("\n");
        // If the file is completely empty, wait and retry
        if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
            await sleep(1000);
            continue;
        }
        // Extract the first line (could be empty string if file began with a newline)
        const firstLine = lines[0];
        if (firstLine.trim() === "") {
            // First line is empty or whitespace only: wait 1 second, then retry
            await sleep(1000);
            continue;
        }
        // Build the "remainder" of the file by skipping the first line
        // If there was only one line, remainder should be an empty string
        const remainder = lines.length > 1 ? lines.slice(1).join("\n") : "";
        try {
            // Overwrite the file with the remainder (which may be empty)
            await fs_1.promises.writeFile(filePath, remainder, "utf-8");
        }
        catch (err) {
            throw new Error(`Failed to write file "${filePath}": ${err.message}`);
        }
        // Return the first non-empty line (without the newline)
        return firstLine;
    }
}
// Example usage:
// async function example() {
//   const file = join(__dirname, "../../data/someFile.txt");
//   try {
//     const line = await popFirstLine(file);
//     console.log("Popped line:", line);
//   } catch (err) {
//     console.error(err);
//   }
// }
// example();
