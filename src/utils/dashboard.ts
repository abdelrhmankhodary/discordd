/**
 * Console Dashboard — real-time stats display for the script.
 */

const COLORS = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
    bgBlue: "\x1b[44m",
};

export interface DashboardStats {
    totalAttempts: number;
    successCount: number;
    failCount: number;
    rateLimits: number;
    lastToken: string | null;
    startTime: number;
    activeThreads: number;
    totalThreads: number;
    proxiesRemaining: number;
    currentRetryDelay: number;
}

export class Dashboard {
    private stats: DashboardStats;

    constructor(totalThreads: number) {
        this.stats = {
            totalAttempts: 0,
            successCount: 0,
            failCount: 0,
            rateLimits: 0,
            lastToken: null,
            startTime: Date.now(),
            activeThreads: 0,
            totalThreads,
            proxiesRemaining: 0,
            currentRetryDelay: 0,
        };
    }

    // ---- Update methods ----

    recordAttempt(): void {
        this.stats.totalAttempts++;
    }

    recordSuccess(token: string): void {
        this.stats.successCount++;
        this.stats.lastToken = token;
    }

    recordFailure(): void {
        this.stats.failCount++;
    }

    recordRateLimit(): void {
        this.stats.rateLimits++;
    }

    setActiveThreads(count: number): void {
        this.stats.activeThreads = count;
    }

    setProxiesRemaining(count: number): void {
        this.stats.proxiesRemaining = count;
    }

    setRetryDelay(delay: number): void {
        this.stats.currentRetryDelay = delay;
    }

    // ---- Display ----

    private getUptime(): string {
        const elapsed = Date.now() - this.stats.startTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    private getSuccessRate(): string {
        if (this.stats.totalAttempts === 0) return "0.0";
        return ((this.stats.successCount / this.stats.totalAttempts) * 100).toFixed(1);
    }

    private maskToken(token: string): string {
        if (token.length <= 20) return token.slice(0, 10) + "...";
        return token.slice(0, 20) + "..." + token.slice(-8);
    }

    /**
     * Render the dashboard to the console (clears screen first).
     */
    render(): void {
        console.clear();

        const c = COLORS;
        const s = this.stats;

        const lines = [
            "",
            `${c.cyan}${c.bright}╔════════════════════════════════════════════════════════╗${c.reset}`,
            `${c.cyan}${c.bright}║        🚀  Discord Team Script — Dashboard  🚀        ║${c.reset}`,
            `${c.cyan}${c.bright}╚════════════════════════════════════════════════════════╝${c.reset}`,
            "",
            `  ${c.white}⏱️  Uptime:            ${c.bright}${this.getUptime()}${c.reset}`,
            `  ${c.white}🧵 Threads:            ${c.bright}${s.activeThreads}/${s.totalThreads}${c.reset}`,
            "",
            `  ${c.cyan}──── Statistics ────${c.reset}`,
            `  ${c.white}📊 Total Attempts:     ${c.bright}${s.totalAttempts}${c.reset}`,
            `  ${c.green}✅ Success:            ${c.bright}${s.successCount}${c.reset}`,
            `  ${c.red}❌ Failed:             ${c.bright}${s.failCount}${c.reset}`,
            `  ${c.yellow}⚠️  Rate Limits:       ${c.bright}${s.rateLimits}${c.reset}`,
            `  ${c.magenta}📈 Success Rate:       ${c.bright}${this.getSuccessRate()}%${c.reset}`,
            "",
            `  ${c.cyan}──── Network ────${c.reset}`,
            `  ${c.white}🌐 Proxies Left:       ${c.bright}${s.proxiesRemaining}${c.reset}`,
            `  ${c.white}⏳ Retry Delay:        ${c.bright}${s.currentRetryDelay}s${c.reset}`,
            "",
        ];

        if (s.lastToken) {
            lines.push(
                `  ${c.cyan}──── Last Token ────${c.reset}`,
                `  ${c.green}🔑 ${this.maskToken(s.lastToken)}${c.reset}`,
                ""
            );
        }

        lines.push(
            `  ${c.gray}Press Ctrl+C to stop${c.reset}`,
            ""
        );

        console.log(lines.join("\n"));
    }

    /**
     * Get raw stats for external use.
     */
    getStats(): Readonly<DashboardStats> {
        return { ...this.stats };
    }
}
