"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const tslib_1 = require("tslib");
const fs_1 = require("fs");
const path_1 = tslib_1.__importDefault(require("path"));
/**
 * Simple YAML parser for flat key-value config files.
 * Supports string, number, and boolean values. No external dependency needed.
 */
function parseSimpleYaml(content) {
    const result = {};
    const lines = content.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const colonIndex = trimmed.indexOf(":");
        if (colonIndex === -1)
            continue;
        const key = trimmed.slice(0, colonIndex).trim();
        let value = trimmed.slice(colonIndex + 1).trim();
        // Remove inline comments
        const commentIndex = value.indexOf("#");
        if (commentIndex > 0) {
            value = value.slice(0, commentIndex).trim();
        }
        // Parse boolean
        if (value === "true") {
            result[key] = true;
        }
        else if (value === "false") {
            result[key] = false;
        }
        // Parse number
        else if (!isNaN(Number(value)) && value !== "") {
            result[key] = Number(value);
        }
        // String
        else {
            result[key] = value;
        }
    }
    return result;
}
const DEFAULT_CONFIG = {
    browser: "msedge",
    threads: 1,
    proxies: false,
    proxy_type: "http",
    invite_link: "https://discord.gg/MXyWJnxqP8",
    retry_delay_base: 5,
    retry_delay_max: 60,
    retry_backoff_multiplier: 2,
    captcha_api_key: "",
};
/**
 * Load configuration from config.yml, falling back to defaults.
 */
function loadConfig() {
    const getExecutableDir = () => {
        if (process.pkg) {
            return path_1.default.dirname(process.execPath);
        }
        return process.cwd();
    };
    const configPath = path_1.default.join(getExecutableDir(), "config.yml");
    try {
        const raw = (0, fs_1.readFileSync)(configPath, "utf-8");
        const parsed = parseSimpleYaml(raw);
        return {
            browser: parsed.browser || DEFAULT_CONFIG.browser,
            threads: typeof parsed.threads === "number" ? parsed.threads : DEFAULT_CONFIG.threads,
            proxies: typeof parsed.proxies === "boolean" ? parsed.proxies : DEFAULT_CONFIG.proxies,
            proxy_type: parsed.proxy_type || DEFAULT_CONFIG.proxy_type,
            invite_link: typeof parsed.invite_link === "string" ? parsed.invite_link : DEFAULT_CONFIG.invite_link,
            retry_delay_base: typeof parsed.retry_delay_base === "number" ? parsed.retry_delay_base : DEFAULT_CONFIG.retry_delay_base,
            retry_delay_max: typeof parsed.retry_delay_max === "number" ? parsed.retry_delay_max : DEFAULT_CONFIG.retry_delay_max,
            retry_backoff_multiplier: typeof parsed.retry_backoff_multiplier === "number" ? parsed.retry_backoff_multiplier : DEFAULT_CONFIG.retry_backoff_multiplier,
            captcha_api_key: typeof parsed.captcha_api_key === "string" ? parsed.captcha_api_key : DEFAULT_CONFIG.captcha_api_key,
        };
    }
    catch (e) {
        console.warn("⚠️  Could not read config.yml, using defaults.");
        return { ...DEFAULT_CONFIG };
    }
}
