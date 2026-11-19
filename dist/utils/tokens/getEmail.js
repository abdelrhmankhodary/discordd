"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmail = getEmail;
const index_1 = require("../files/index");
const path_1 = require("path");
const EMAILS_INPUT_PATH = (0, path_1.join)(__dirname, "../../../data/input/emails.txt");
async function getEmail() {
    try {
        const emailLine = await (0, index_1.popFirstLine)(EMAILS_INPUT_PATH);
        if (!emailLine) {
            throw new Error("No API key available in keys.txt");
        }
        return emailLine.trim();
    }
    catch (err) {
        console.error("[getEmail] Failed to retrieve email:", err);
        throw err;
    }
}
