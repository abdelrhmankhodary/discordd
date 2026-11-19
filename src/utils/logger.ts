import { appendFile } from "fs/promises";
import path from "path";

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

type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR" | "DEBUG" | "THREAD";

const LEVEL_STYLES: Record<LogLevel, { color: string; icon: string }> = {
    INFO: { color: COLORS.cyan, icon: "ℹ️ " },
    SUCCESS: { color: COLORS.green, icon: "✅" },
    WARN: { color: COLORS.yellow, icon: "⚠️ " },
    ERROR: { color: COLORS.red, icon: "❌" },
    DEBUG: { color: COLORS.gray, icon: "🔍" },
    THREAD: { color: COLORS.magenta, icon: "🧵" },
};

const getExecutableDir = () => {
    if ((process as any).pkg) {
        return path.dirname(process.execPath);
    }
    return process.cwd();
};

const LOG_FILE = path.join(getExecutableDir(), "data", "errors.log");

export class Logger {
    private threadId: number | null;
    private totalThreads: number;

    constructor(threadId: number | null = null, totalThreads: number = 1) {
        this.threadId = threadId;
        this.totalThreads = totalThreads;
    }

    private getPrefix(): string {
        if (this.threadId !== null && this.totalThreads > 1) {
            return `${COLORS.magenta}[Thread ${this.threadId + 1}/${this.totalThreads}]${COLORS.reset} `;
        }
        return "";
    }

    private getTimestamp(): string {
        const now = new Date();
        const time = now.toLocaleTimeString("en-GB", { hour12: false });
        return `${COLORS.gray}[${time}]${COLORS.reset}`;
    }

    private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
        const style = LEVEL_STYLES[level];
        const timestamp = this.getTimestamp();
        const prefix = this.getPrefix();
        const levelTag = `${style.color}${COLORS.bright}[${level}]${COLORS.reset}`;
        const icon = style.icon;

        return `${timestamp} ${prefix}${levelTag} ${icon} ${message}`;
    }

    info(message: string, ...args: any[]): void {
        console.log(this.formatMessage("INFO", message), ...args);
    }

    success(message: string, ...args: any[]): void {
        console.log(this.formatMessage("SUCCESS", message), ...args);
    }

    warn(message: string, ...args: any[]): void {
        console.warn(this.formatMessage("WARN", message), ...args);
    }

    error(message: string, ...args: any[]): void {
        console.error(this.formatMessage("ERROR", message), ...args);
    }

    debug(message: string, ...args: any[]): void {
        console.log(this.formatMessage("DEBUG", message), ...args);
    }

    thread(message: string, ...args: any[]): void {
        console.log(this.formatMessage("THREAD", message), ...args);
    }

    /**
     * Log error with full stack trace to file.
     */
    async logToFile(err: unknown, context: string): Promise<void> {
        const timestamp = new Date().toISOString();
        const message = err instanceof Error ? err.stack : String(err);
        const entry = `[${timestamp}] ${context}: ${message}\n\n`;

        try {
            await appendFile(LOG_FILE, entry);
        } catch {
            // Silent — can't even log the logging failure
        }
    }

    /**
     * Create a child logger scoped to a specific thread.
     */
    forThread(threadId: number, totalThreads: number): Logger {
        return new Logger(threadId, totalThreads);
    }
}

// Global logger instance
export const logger = new Logger();
