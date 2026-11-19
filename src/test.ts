import { Page } from "patchright";
import { mkdir, appendFile, rm, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { faker } from "@faker-js/faker";
import axios from "axios";

// Project modules
import { launchContext } from "./utils/context/launch";
import { getDiscordToken } from "./utils/discord";
import { loadConfig, AppConfig } from "./utils/config";
import { Logger, logger } from "./utils/logger";
import { Dashboard } from "./utils/dashboard";
import { TorManager } from "./utils/tor/manager";

// hCaptcha interface definition
declare global {
    interface Window {
        hcaptcha?: {
            execute: (widgetId?: string, options?: any) => Promise<{ response: string; key: string }>;
            render: (container: string | HTMLElement, options: any) => string;
            reset: (widgetId?: string) => void;
            remove: (widgetId: string) => void;
            getResponse: (widgetId?: string) => string;
        };
    }
}

// -------- Global State --------
let config: AppConfig;
let useProxies = false;
let proxies: string[] = [];
let dashboard: Dashboard;
let torManager: TorManager | null = null;

// Handle paths for both bundled (pkg) and normal execution
const getExecutableDir = () => {
    if ((process as any).pkg) {
        return path.dirname(process.execPath);
    }
    return process.cwd();
};

const DATA_DIR = path.resolve(getExecutableDir(), "data");
const OUT_FILE = path.join(DATA_DIR, "output", "tokens.txt");
const ERR_FILE = path.join(DATA_DIR, "errors.txt");
const IP_FILE = path.join(DATA_DIR, "output", "ips.txt");
const PROXIES_FILE = path.join(DATA_DIR, "input", "proxies.txt");

// Use system temp directory or local tmp folder
const TMP_DIR = path.join(getExecutableDir(), "tmp");

// Track active profiles for cleanup on exit
const activeProfiles = new Set<string>();

// -------- Name & DOB Generation (Faker) --------

function generateRealisticName(): string {
    // Random strategy: username, firstName, or firstName + number
    const strategy = Math.floor(Math.random() * 4);

    switch (strategy) {
        case 0:
            return faker.internet.username().slice(0, 20);
        case 1:
            return faker.person.firstName().toLowerCase();
        case 2: {
            const name = faker.person.firstName().toLowerCase();
            const num = Math.floor(Math.random() * 9999);
            return `${name}${num}`.slice(0, 20);
        }
        case 3: {
            const adj = faker.word.adjective();
            const noun = faker.word.noun();
            return `${adj}${noun}`.slice(0, 20);
        }
        default:
            return faker.internet.username().slice(0, 20);
    }
}

function generateRandomDOB(): { month: string; day: string; year: string } {
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const year = 1990 + Math.floor(Math.random() * 15); // 1990-2004
    const monthIndex = Math.floor(Math.random() * 12);
    const month = months[monthIndex];

    // Max days per month (simplified)
    const maxDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const day = 1 + Math.floor(Math.random() * maxDays[monthIndex]);

    return { month, day: day.toString(), year: year.toString() };
}

// -------- Utilities --------

async function logError(err: unknown, context: string, log: Logger): Promise<void> {
    await log.logToFile(err, context);
}

// -------- CLEAN BROWSER DATA --------
async function cleanBrowserData(page: Page, context: any) {
    try {
        await context.clearCookies();
        await page.evaluate(() => {
            try {
                localStorage.clear();
                sessionStorage.clear();
            } catch { }
        });

        try {
            const client = await context.newCDPSession(page);
            await client.send("Network.clearBrowserCache").catch(() => { });
            await client.send("Network.clearBrowserCookies").catch(() => { });
        } catch { }
    } catch {
        // Silent cleanup
    }
}

// -------- DELETE SPECIFIC PROFILE --------
async function deleteProfile(fingerprintID: string) {
    try {
        const profilePath = path.join(TMP_DIR, `discord-${fingerprintID}`);
        await rm(profilePath, { recursive: true, force: true });
        activeProfiles.delete(fingerprintID);
    } catch {
        // Silent delete
    }
}

// -------- DELETE TEMP FOLDERS --------
async function deleteTempFolders() {
    try {
        const files = await readdir(TMP_DIR);
        const discordFolders = files.filter(f => f.startsWith("discord-"));
        for (const folder of discordFolders) {
            const fullPath = path.join(TMP_DIR, folder);
            await rm(fullPath, { recursive: true, force: true });
        }
        activeProfiles.clear();
    } catch {
        // Silent
    }
}

// -------- REMOVE PROXY FROM FILE --------
async function removeProxyFromFile(proxyToRemove: string, log: Logger) {
    try {
        const proxyData = await readFile(PROXIES_FILE, 'utf-8');
        const currentProxies = proxyData.split('\n').map(p => p.trim()).filter(p => p.length > 0);
        const updatedProxies = currentProxies.filter(p => p !== proxyToRemove);
        await writeFile(PROXIES_FILE, updatedProxies.join('\n') + '\n', 'utf-8');
        proxies = updatedProxies;

        log.info(`Removed used proxy: ${proxyToRemove}`);
        log.info(`Remaining proxies: ${updatedProxies.length}`);
        dashboard.setProxiesRemaining(updatedProxies.length);
    } catch (e) {
        log.error(`Failed to remove proxy from file: ${e}`);
    }
}

// -------- CLICK TERMS CHECKBOX IF EXISTS --------
async function clickTermsCheckbox(page: Page) {
    try {
        const selector = 'label.checkboxWrapper__09aca input[type="checkbox"]';
        const exists = await page.$(selector);
        if (exists) {
            await page.click(selector);
            await page.waitForTimeout(500);
        }
    } catch {
        // Silent
    }
}

// -------- GET AND SAVE IP ADDRESS --------
async function getAndSaveIP(page: Page, log: Logger): Promise<string | null> {
    try {
        await page.goto("https://api.ipify.org?format=json", { timeout: 30000, waitUntil: "domcontentloaded" });
        const content = await page.textContent("body");

        if (content) {
            try {
                const data = JSON.parse(content);
                const ipAddress = data.ip;
                const timestamp = new Date().toISOString();
                const logEntry = `[${timestamp}] ${ipAddress}\n`;
                await appendFile(IP_FILE, logEntry);
                log.info(`IP Address: ${ipAddress}`);
                return ipAddress;
            } catch {
                return null;
            }
        }
        return null;
    } catch {
        return null;
    }
}

// -------- SETUP NETWORK BLOCKING (SAVE DATA, ALLOW CAPTCHA) --------
async function setupNetworkBlocking(page: Page, log: Logger): Promise<void> {
    await page.route("**/*", (route) => {
        const url = route.request().url();
        const resourceType = route.request().resourceType();

        // Allow HTML, JavaScript, CSS, and WebSocket
        if (
            resourceType === "document" ||
            resourceType === "script" ||
            resourceType === "stylesheet" ||
            resourceType === "websocket"
        ) {
            route.continue();
            return;
        }

        // Allow captcha-related domains
        const captchaDomains = [
            "google.com/recaptcha", "gstatic.com/recaptcha", "hcaptcha.com",
            "hcaptchaapi.com", "cloudflare.com/cdn-cgi/challenge",
            "challenges.cloudflare.com", "recaptcha.net",
            "googleapis.com/recaptcha", "recaptcha/api2", "recaptcha/enterprise"
        ];

        if (captchaDomains.some(domain => url.includes(domain))) {
            route.continue();
            return;
        }

        // Block images, media, and fonts
        if (resourceType === "image" || resourceType === "media" || resourceType === "font") {
            route.abort();
            return;
        }

        // Allow XHR/Fetch
        if (resourceType === "xhr" || resourceType === "fetch") {
            route.continue();
            return;
        }

        // Default: continue
        route.continue();
    });

    log.debug("Network blocking enabled: Images & Media blocked, Captcha allowed.");
}

// -------- MAIN TOKEN SNATCHER --------
async function tokenizer(
    fingerprintID: string,
    threadID: number = 0,
    totalThreads: number = 1,
    proxy?: string
): Promise<void> {
    const log = logger.forThread(threadID, totalThreads);

    // Calculate viewport for multiple windows side by side
    let viewportConfig: { width: number; height: number; x?: number; y?: number } | undefined;

    if (totalThreads > 1) {
        const screenWidth = 1920;
        const screenHeight = 1000;
        const windowWidth = Math.floor(screenWidth / totalThreads);

        viewportConfig = {
            width: windowWidth,
            height: screenHeight,
            x: threadID * windowWidth,
            y: 0,
        };
    }

    // Track this profile
    activeProfiles.add(fingerprintID);

    if (proxy) {
        log.info(`Using proxy: ${proxy}`);
    }

    let context = await launchContext(fingerprintID, false, viewportConfig, config.browser, proxy);
    let page = await context.newPage();

    // Remove proxy from file immediately after browser opens
    if (proxy) {
        await removeProxyFromFile(proxy, log);
    }

    try {
        // -------- WebRTC IP Leak Protection --------
        await page.addInitScript(() => {
            if ('RTCPeerConnection' in window) {
                const OriginalRTCPeerConnection = (window as any).RTCPeerConnection;
                (window as any).RTCPeerConnection = function (...args: any[]) {
                    if (args[0] && args[0].iceServers) {
                        args[0].iceServers = [];
                    }
                    return new OriginalRTCPeerConnection(...args);
                };
            }

            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia = function () {
                    return Promise.reject(new Error('Permission denied'));
                };
            }

            if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
                navigator.mediaDevices.enumerateDevices = function () {
                    return Promise.resolve([]);
                };
            }
        });

        // Setup network blocking
        await setupNetworkBlocking(page, log);

        // Set window position via CDP
        if (viewportConfig && viewportConfig.x !== undefined && viewportConfig.y !== undefined) {
            try {
                await page.waitForTimeout(500);
                const client = await context.newCDPSession(page);
                const targets = await client.send("Target.getTargets");
                if (targets && (targets as any).targetInfos && (targets as any).targetInfos.length > 0) {
                    const targetId = (targets as any).targetInfos[0].targetId;
                    const windowResult = await client.send("Browser.getWindowForTarget", { targetId });
                    if (windowResult && (windowResult as any).windowId) {
                        await client.send("Browser.setWindowBounds", {
                            windowId: (windowResult as any).windowId,
                            bounds: {
                                left: viewportConfig.x!,
                                top: viewportConfig.y!,
                                width: viewportConfig.width,
                                height: viewportConfig.height,
                                windowState: "normal"
                            }
                        });
                        log.debug(`Window positioned at ${viewportConfig.x},${viewportConfig.y}`);
                    }
                }
            } catch {
                log.debug("Window positioning via CDP failed, using launch args.");
            }
        }

        log.info("Waiting 2s before opening invite link...");
        await page.waitForTimeout(2000);

        // Get and save IP
        await getAndSaveIP(page, log);

        // Navigate to invite link (from config)
        await page.goto(config.invite_link, { timeout: 60000, waitUntil: "domcontentloaded" });
        log.info("Opened invite link. Filling display name...");

        await page.waitForSelector('input[placeholder="What should everyone call you?"]', { timeout: 50000 });

        // Use Faker for realistic name
        const randomName = generateRealisticName();
        await page.fill('input[placeholder="What should everyone call you?"]', randomName);
        log.success(`Display name entered: ${randomName}`);

        await page.waitForTimeout(1000);

        // Helper to select date components
        const selectDateComponent = async (placeholder: string, value: string) => {
            const selector = `div[class*="wrapper"][class*="select"]:has-text("${placeholder}")`;
            try {
                await page.waitForSelector(selector, { timeout: 10000 });
                await page.click(selector);

                const optionSelector = `div[class*="option"]:has-text("${value}")`;
                await page.waitForSelector(optionSelector, { timeout: 5000 });
                await page.click(optionSelector);
                await page.waitForTimeout(500);
            } catch (e) {
                log.warn(`Failed to select ${placeholder}, retrying with keyboard...`);
                try {
                    await page.click(selector);
                    await page.keyboard.type(value);
                    await page.keyboard.press('Enter');
                } catch (e2) {
                    throw new Error(`Could not select ${placeholder}: ${e2}`);
                }
            }
        };

        // Generate random DOB
        const dob = generateRandomDOB();
        try {
            log.info(`Selecting DOB: ${dob.month} ${dob.day}, ${dob.year}`);
            await selectDateComponent("Month", dob.month);
            await selectDateComponent("Day", dob.day);
            await selectDateComponent("Year", dob.year);
            log.success("Date of birth selected.");
        } catch (e) {
            log.error(`Date selection failed: ${e}`);
            throw e;
        }

        // Try clicking checkbox
        await clickTermsCheckbox(page);

        await page.waitForSelector('span:has-text("Create Account")', { timeout: 50000 });

        // Setup listener for rate limit detection
        let rateLimitDetected = false;
        const responseListener = async (response: any) => {
            const url = response.url();
            if (url.includes('/api/v9/auth/register')) {
                const status = response.status();
                if (status === 429) {
                    rateLimitDetected = true;
                    log.warn("Rate limit detected (429)!");
                    dashboard.recordRateLimit();
                    return;
                }

                try {
                    const responseBody = await response.text();
                    const bodyLower = responseBody.toLowerCase();
                    if (bodyLower.includes('rate_limit') || bodyLower.includes('ratelimit') || bodyLower.includes('too many requests')) {
                        rateLimitDetected = true;
                        log.warn("Rate limit message detected in response!");
                        dashboard.recordRateLimit();
                    }
                } catch { }
            }
        };

        page.on('response', responseListener);

        await page.click('span:has-text("Create Account")');
        log.info("Account creation button clicked.");

        await page.waitForTimeout(3000);
        
        // -------- Captcha Solving --------
        if (config.captcha_api_key) {
            log.info("Checking for hCaptcha...");
            try {
                // Check if any hcaptcha iframe appeared
                const hcaptchaIframe = await page.$('iframe[src*="hcaptcha.com"]');
                if (hcaptchaIframe) {
                    log.info("Captcha detected! Attempting to solve with 2Captcha...");
                    const src = await hcaptchaIframe.getAttribute("src");
                    const sitekeyMatch = src?.match(/sitekey=([^&]+)/);
                    
                    if (sitekeyMatch && sitekeyMatch[1]) {
                        const sitekey = sitekeyMatch[1];
                        log.debug(`Extracted sitekey: ${sitekey}`);
                        
                        // -------- CapSolver API --------
                        log.info("Sending captcha to CapSolver... (this takes 10-30 seconds)");
                        try {
                            // 1. Create Task
                            const createTaskRes = await axios.post("https://api.capsolver.com/createTask", {
                                clientKey: config.captcha_api_key,
                                task: {
                                    type: "HCaptchaTaskProxyless",
                                    websiteURL: page.url(),
                                    websiteKey: sitekey
                                }
                            });

                            if (createTaskRes.data.errorId !== 0) {
                                throw new Error(`CapSolver CreateTask Error: ${createTaskRes.data.errorDescription}`);
                            }

                            const taskId = createTaskRes.data.taskId;
                            log.debug(`CapSolver Task Created: ${taskId}. Waiting for solution...`);

                            // 2. Poll for Result
                            let solution = null;
                            for (let i = 0; i < 60; i++) { // Max 2 mins (60 * 2s)
                                await page.waitForTimeout(2000);
                                const resultRes = await axios.post("https://api.capsolver.com/getTaskResult", {
                                    clientKey: config.captcha_api_key,
                                    taskId: taskId
                                });

                                if (resultRes.data.status === "ready") {
                                    solution = resultRes.data.solution.gRecaptchaResponse;
                                    break;
                                } else if (resultRes.data.status === "processing") {
                                    // continue waiting
                                } else {
                                    throw new Error(`CapSolver GetResult Error: ${resultRes.data.errorDescription}`);
                                }
                            }

                            if (!solution) {
                                throw new Error("CapSolver timed out waiting for solution.");
                            }
                            
                            log.success(`Captcha solved! Token length: ${solution.length}`);
                            
                            // 3. Inject the result into the page
                            await page.evaluate((token) => {
                                // Fill all possible textareas
                                const fields = document.querySelectorAll('textarea[name="h-captcha-response"], textarea[name="g-recaptcha-response"]');
                                fields.forEach(el => {(el as HTMLTextAreaElement).value = token;});
                                
                                // Override hcaptcha global variables
                                if (window.hcaptcha) {
                                    window.hcaptcha.getResponse = () => token;
                                }
                            }, solution);
                            
                            // Give Discord a moment to recognize the injection or we manually click verify/submit if there's a button
                            await page.waitForTimeout(2000);
                        } catch (err: any) {
                            log.error(`CapSolver API Error: ${err.message || err}`);
                        }
                    } else {
                        log.warn("Could not extract sitekey from hCaptcha iframe.");
                    }
                } else {
                    log.info("No hCaptcha detected.");
                }
            } catch (err) {
                log.warn(`Captcha solving failed or timed out: ${err}`);
            }
        } else {
            log.warn("No captcha_api_key provided in config.yml. If a captcha appears, you must solve it manually.");
            // Wait extra time in case user solves it manually
            await page.waitForTimeout(10000);
        }

        page.off('response', responseListener);

        if (rateLimitDetected) {
            throw new Error("Rate limit detected - closing browser for new profile");
        }

        log.info("Waiting for navigation to /channels/@me ...");
        await page.waitForURL(
            url => url.toString().startsWith("https://discord.com/channels/@me"),
            { timeout: 0 }
        );

        log.success("User reached @me → Extracting token...");

        // -------- Use discord.ts for safer token extraction --------
        let token: string | null = null;

        for (let i = 0; i < 200; i++) {
            try {
                token = await getDiscordToken(page as any);
                if (token && token !== "undefined" && token !== "null") break;
            } catch {
                // Fallback: try direct localStorage
                token = await page.evaluate(() => {
                    try {
                        return window.localStorage.getItem("token");
                    } catch {
                        return null;
                    }
                });
                if (token && token !== "undefined" && token !== "null") break;
            }
            await page.waitForTimeout(1000);
        }

        if (!token) throw new Error("Token not found!");

        token = token.replace(/"/g, "");

        // Record success in dashboard
        dashboard.recordSuccess(token);
        dashboard.render();

        await appendFile(OUT_FILE, token + "\n");
        log.success(`Token saved! Total: ${dashboard.getStats().successCount}`);

    } catch (err) {
        log.error(`Error: ${err}`);
        dashboard.recordFailure();
        await logError(err, `TokenExtraction-Thread${threadID + 1}`, log);
        throw err;
    } finally {
        if (context) {
            try { await cleanBrowserData(page, context); } catch { }
            try { await context.close(); } catch { }
        }
        await deleteProfile(fingerprintID);
    }
}

// -------- Smart Retry: Single Thread Loop --------
async function startSingleThreadLoop(threadID: number, totalThreads: number) {
    const log = logger.forThread(threadID, totalThreads);
    let consecutiveFailures = 0;

    while (true) {
        log.thread(`--- New Attempt @ ${new Date().toLocaleString()} ---`);
        dashboard.recordAttempt();

        // Pick proxy if enabled
        let threadProxy: string | undefined = undefined;
        if (useProxies && proxies.length > 0) {
            threadProxy = proxies[threadID % proxies.length];
        } else if (config.proxy_type === "tor" && torManager) {
            threadProxy = torManager.getProxyAddress();
        }

        try {
            const randomFP = Math.floor(Math.random() * 999999).toString() + `-t${threadID}`;
            log.debug(`Fingerprint ID: ${randomFP}`);
            await tokenizer(randomFP, threadID, totalThreads, threadProxy);
            log.success("--- SUCCESS ---");

            // Reset delay on success
            consecutiveFailures = 0;
            dashboard.setRetryDelay(0);

        } catch {
            consecutiveFailures++;

            // Smart backoff delay
            const delay = Math.min(
                config.retry_delay_base * Math.pow(config.retry_backoff_multiplier, consecutiveFailures - 1),
                config.retry_delay_max
            );

            dashboard.setRetryDelay(delay);
            dashboard.render();

            log.warn(`Retrying in ${delay}s (failure #${consecutiveFailures})...`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
    }
}

// -------- Multi-Thread Loop --------
async function startMultiThreadLoop(numThreads: number = 1) {
    if (numThreads > 1) {
        logger.info(`Starting ${numThreads} threads in parallel...`);
    } else {
        logger.info("Starting single thread mode...");
    }

    dashboard.setActiveThreads(numThreads);

    const threadPromises = [];
    for (let i = 0; i < numThreads; i++) {
        threadPromises.push(startSingleThreadLoop(i, numThreads));
    }

    await Promise.all(threadPromises);
}

// -------- Main --------
async function main() {
    try {
        // Load config from config.yml (no interactive prompts!)
        config = loadConfig();

        logger.info("Configuration loaded from config.yml:");
        logger.info(`  Browser:     ${config.browser}`);
        logger.info(`  Threads:     ${config.threads}`);
        logger.info(`  Proxies:     ${config.proxies ? "Enabled" : "Disabled"}`);
        logger.info(`  Proxy Type:  ${config.proxy_type}`);
        logger.info(`  Invite Link: ${config.invite_link}`);

        await mkdir(path.join(DATA_DIR, "output"), { recursive: true });

        // Initialize dashboard
        dashboard = new Dashboard(config.threads);

        // Setup proxies
        useProxies = config.proxies;
        if (useProxies && config.proxy_type !== "tor") {
            try {
                const proxyData = await readFile(PROXIES_FILE, 'utf-8');
                proxies = proxyData.split('\n').map(p => p.trim()).filter(p => p.length > 0);
                logger.success(`Loaded ${proxies.length} proxies.`);
                dashboard.setProxiesRemaining(proxies.length);
            } catch {
                logger.warn("Failed to load proxies file. Continuing without proxies.");
                useProxies = false;
            }
        }

        // Setup Tor if selected
        if (config.proxy_type === "tor") {
            logger.info("Initializing Tor proxy...");
            torManager = new TorManager(0);
            await torManager.startTor();
            logger.success("Tor proxy ready!");
        }

        // Show initial dashboard
        dashboard.render();

        // Handle exit signals → clean active profiles
        const cleanupOnExit = async () => {
            logger.warn("Process exiting... Cleaning active profiles.");

            if (torManager) {
                torManager.stopTor();
            }

            const profilesToDelete = Array.from(activeProfiles);
            for (const profileId of profilesToDelete) {
                await deleteProfile(profileId);
            }
            await deleteTempFolders();
        };

        process.on("exit", cleanupOnExit);
        process.on("SIGINT", async () => {
            logger.warn("SIGINT detected... Cleaning up.");
            await cleanupOnExit();
            process.exit();
        });
        process.on("SIGTERM", async () => {
            logger.warn("SIGTERM detected... Cleaning up.");
            await cleanupOnExit();
            process.exit();
        });

        // Start thread loop
        await startMultiThreadLoop(config.threads);

    } catch (err) {
        logger.error(`Fatal error: ${err}`);
        await logError(err, "MainExecution", logger);
        process.exit(1);
    }
}

main();
