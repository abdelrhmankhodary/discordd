"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TorManager = void 0;
const tslib_1 = require("tslib");
const child_process_1 = require("child_process");
const path_1 = tslib_1.__importDefault(require("path"));
const fs_1 = tslib_1.__importDefault(require("fs"));
const https_1 = tslib_1.__importDefault(require("https"));
const net_1 = tslib_1.__importDefault(require("net"));
const child_process_2 = require("child_process");
/**
 * Tor Manager - handles downloading, starting, and managing Tor process
 */
class TorManager {
    torProcess = null;
    torDir;
    torExePath;
    torDataDir;
    socksPort;
    instanceId;
    constructor(instanceId = 0) {
        const getExecutableDir = () => {
            if (process.pkg) {
                return path_1.default.dirname(process.execPath);
            }
            return process.cwd();
        };
        this.instanceId = instanceId;
        this.socksPort = 9050 + instanceId; // Each instance gets different port
        this.torDir = path_1.default.join(getExecutableDir(), "tor");
        this.torExePath = path_1.default.join(this.torDir, "Tor", "tor.exe");
        this.torDataDir = path_1.default.join(this.torDir, `data-${instanceId}`); // Separate data dir per instance
    }
    /**
     * Check if Tor is already installed
     */
    isTorInstalled() {
        return fs_1.default.existsSync(this.torExePath);
    }
    /**
     * Download Tor Expert Bundle for Windows
     */
    async downloadTor() {
        if (this.isTorInstalled()) {
            console.log("✅ Tor already installed.");
            return;
        }
        console.log("📥 Downloading Tor Expert Bundle...");
        console.log("⏳ This may take a few minutes...");
        // Create tor directory
        fs_1.default.mkdirSync(this.torDir, { recursive: true });
        // Tor Expert Bundle URL (Windows 64-bit) - using direct download
        const torUrl = "https://archive.torproject.org/tor-package-archive/torbrowser/13.0.8/tor-expert-bundle-windows-x86_64-13.0.8.tar.gz";
        const torArchivePath = path_1.default.join(this.torDir, "tor.tar.gz");
        try {
            // Download Tor
            await this.downloadFile(torUrl, torArchivePath);
            console.log("📦 Extracting Tor (using PowerShell)...");
            // Use PowerShell to extract tar.gz (available in Windows 10+)
            const extractDir = this.torDir;
            // PowerShell command to extract tar.gz
            const psCommand = `tar -xzf "${torArchivePath}" -C "${extractDir}"`;
            try {
                (0, child_process_2.execSync)(psCommand, { stdio: 'inherit' });
                console.log("✅ Tor extracted successfully!");
            }
            catch (e) {
                console.error("❌ Failed to extract Tor. Please extract manually.");
                console.log(`Archive location: ${torArchivePath}`);
                console.log(`Extract to: ${extractDir}`);
                throw new Error("Tor extraction failed");
            }
            // Clean up archive
            if (fs_1.default.existsSync(torArchivePath)) {
                fs_1.default.unlinkSync(torArchivePath);
            }
            console.log("✅ Tor installed successfully!");
        }
        catch (error) {
            console.error("❌ Failed to download/install Tor:", error);
            throw error;
        }
    }
    /**
     * Download a file from URL
     */
    downloadFile(url, dest) {
        return new Promise((resolve, reject) => {
            const file = fs_1.default.createWriteStream(dest);
            const request = (downloadUrl) => {
                https_1.default.get(downloadUrl, (response) => {
                    // Handle redirects
                    if (response.statusCode === 302 || response.statusCode === 301) {
                        const redirectUrl = response.headers.location;
                        if (redirectUrl) {
                            file.close();
                            fs_1.default.unlinkSync(dest);
                            request(redirectUrl);
                            return;
                        }
                    }
                    if (response.statusCode !== 200) {
                        file.close();
                        fs_1.default.unlinkSync(dest);
                        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
                        return;
                    }
                    const totalSize = parseInt(response.headers['content-length'] || '0', 10);
                    let downloadedSize = 0;
                    let lastProgress = 0;
                    response.on('data', (chunk) => {
                        downloadedSize += chunk.length;
                        const progress = Math.floor((downloadedSize / totalSize) * 100);
                        // Show progress every 10%
                        if (progress >= lastProgress + 10) {
                            console.log(`📥 Downloaded: ${progress}%`);
                            lastProgress = progress;
                        }
                    });
                    response.pipe(file);
                    file.on("finish", () => {
                        file.close();
                        console.log("✅ Download complete!");
                        resolve();
                    });
                }).on("error", (err) => {
                    file.close();
                    if (fs_1.default.existsSync(dest)) {
                        fs_1.default.unlinkSync(dest);
                    }
                    reject(err);
                });
            };
            request(url);
        });
    }
    /**
     * Check if Tor is running and connected
     */
    async isTorConnected() {
        return new Promise((resolve) => {
            const socket = new net_1.default.Socket();
            socket.setTimeout(1000);
            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            socket.on('error', () => {
                resolve(false);
            });
            socket.connect(this.socksPort, '127.0.0.1');
        });
    }
    /**
     * Start Tor process
     */
    async startTor() {
        // Ensure Tor is installed
        await this.downloadTor();
        // Check if already running
        if (await this.isTorConnected()) {
            console.log(`✅ Tor instance ${this.instanceId} (port ${this.socksPort}) is already running!`);
            return;
        }
        console.log(`🔄 Starting Tor instance ${this.instanceId} on port ${this.socksPort}...`);
        // Create data directory
        fs_1.default.mkdirSync(this.torDataDir, { recursive: true });
        // Start Tor process
        this.torProcess = (0, child_process_1.spawn)(this.torExePath, [
            '--SocksPort', this.socksPort.toString(),
            '--DataDirectory', this.torDataDir,
        ], {
            cwd: path_1.default.dirname(this.torExePath),
            stdio: 'pipe'
        });
        let bootstrapComplete = false;
        // Listen to Tor output
        this.torProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            if (output.includes('Bootstrapped 100%') && !bootstrapComplete) {
                bootstrapComplete = true;
                console.log("✅ Tor connected successfully!");
            }
        });
        this.torProcess.stderr?.on('data', (data) => {
            const output = data.toString();
            // Show bootstrap progress
            if (output.includes('Bootstrapped')) {
                const match = output.match(/Bootstrapped (\d+)%/);
                if (match) {
                    console.log(`🔄 Tor connecting: ${match[1]}%`);
                }
            }
        });
        this.torProcess.on('error', (error) => {
            console.error('❌ Tor process error:', error);
        });
        this.torProcess.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                console.error(`❌ Tor process exited with code ${code}`);
            }
        });
        // Wait for Tor to connect
        console.log("⏳ Waiting for Tor to connect...");
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds timeout
        while (attempts < maxAttempts) {
            if (await this.isTorConnected()) {
                console.log(`✅ Tor instance ${this.instanceId} is ready!`);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
            if (attempts % 10 === 0) {
                console.log(`⏳ Still connecting... (${attempts}s)`);
            }
        }
        throw new Error("Tor failed to connect within 60 seconds");
    }
    /**
     * Stop Tor process
     */
    stopTor() {
        if (this.torProcess) {
            console.log("🛑 Stopping Tor...");
            this.torProcess.kill();
            this.torProcess = null;
        }
    }
    /**
     * Get Tor SOCKS5 proxy address
     */
    getProxyAddress() {
        return `socks5://127.0.0.1:${this.socksPort}`;
    }
}
exports.TorManager = TorManager;
