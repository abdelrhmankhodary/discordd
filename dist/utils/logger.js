"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = void 0;
const tslib_1 = require("tslib");
const promises_1 = require("fs/promises");
const path_1 = tslib_1.__importDefault(require("path"));
// ANSI color codes
const COLORS = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    // Foreground
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
    // Background
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
};
const LEVEL_STYLES = {
    INFO: { color: COLORS.cyan, icon: "ℹ️ " },
    SUCCESS: { color: COLORS.green, icon: "✅" },
    WARN: { color: COLORS.yellow, icon: "⚠️ " },
    ERROR: { color: COLORS.red, icon: "❌" },
    DEBUG: { color: COLORS.gray, icon: "🔍" },
    THREAD: { color: COLORS.magenta, icon: "🧵" },
};
const getExecutableDir = () => {
    if (process.pkg) {
        return path_1.default.dirname(process.execPath);
    }
    return process.cwd();
};
const LOG_FILE = path_1.default.join(getExecutableDir(), "data", "errors.log");
class Logger {
    threadId;
    totalThreads;
    constructor(threadId = null, totalThreads = 1) {
        this.threadId = threadId;
        this.totalThreads = totalThreads;
    }
    getPrefix() {
        if (this.threadId !== null && this.totalThreads > 1) {
            return `${COLORS.magenta}[Thread ${this.threadId + 1}/${this.totalThreads}]${COLORS.reset} `;
        }
        return "";
    }
    getTimestamp() {
        const now = new Date();
        const time = now.toLocaleTimeString("en-GB", { hour12: false });
        return `${COLORS.gray}[${time}]${COLORS.reset}`;
    }
    formatMessage(level, message, ...args) {
        const style = LEVEL_STYLES[level];
        const timestamp = this.getTimestamp();
        const prefix = this.getPrefix();
        const levelTag = `${style.color}${COLORS.bright}[${level}]${COLORS.reset}`;
        const icon = style.icon;
        return `${timestamp} ${prefix}${levelTag} ${icon} ${message}`;
    }
    info(message, ...args) {
        console.log(this.formatMessage("INFO", message), ...args);
    }
    success(message, ...args) {
        console.log(this.formatMessage("SUCCESS", message), ...args);
    }
    warn(message, ...args) {
        console.warn(this.formatMessage("WARN", message), ...args);
    }
    error(message, ...args) {
        console.error(this.formatMessage("ERROR", message), ...args);
    }
    debug(message, ...args) {
        console.log(this.formatMessage("DEBUG", message), ...args);
    }
    thread(message, ...args) {
        console.log(this.formatMessage("THREAD", message), ...args);
    }
    /**
     * Log error with full stack trace to file.
     */
    async logToFile(err, context) {
        const timestamp = new Date().toISOString();
        const message = err instanceof Error ? err.stack : String(err);
        const entry = `[${timestamp}] ${context}: ${message}\n\n`;
        try {
            await (0, promises_1.appendFile)(LOG_FILE, entry);
        }
        catch {
            // Silent — can't even log the logging failure
        }
    }
    /**
     * Create a child logger scoped to a specific thread.
     */
    forThread(threadId, totalThreads) {
        return new Logger(threadId, totalThreads);
    }
}
exports.Logger = Logger;
// Global logger instance
exports.logger = new Logger();
