import { chromium } from "patchright";
import path from "path";
import fs from "fs";

/**
 * Launches a persistent Chromium context, optionally routing through a SOCKS5 proxy.
 *
 * @param tempVersion - Identifier for the profile folder.
 * @param withProxy - Whether to use a working SOCKS5 proxy.
 * @param viewportConfig - Optional viewport configuration (width, height, x, y)
 * @param browserType - Browser to use: "chrome", "msedge", "brave", or "opera-gx" (default: "msedge")
 * @param torProxy - Optional Tor proxy address (e.g., "socks5://127.0.0.1:9050")
 * @returns A Promise resolving to the BrowserContext.
 */
export async function launchContext(
  tempVersion: string,
  withProxy: boolean,
  viewportConfig?: { width: number; height: number; x?: number; y?: number },
  browserType: "chrome" | "msedge" | "brave" | "opera-gx" = "msedge",
  torProxy?: string,
  extraArgs: string[] = []
) {
  // Handle paths for both bundled (pkg) and normal execution
  const getExecutableDir = () => {
    if ((process as any).pkg) {
      return path.dirname(process.execPath);
    }
    return process.cwd();
  };

  const userDataDir = path.join(getExecutableDir(), "tmp", `discord-${tempVersion}`);
  // Ensure directory exists
  fs.mkdirSync(userDataDir, { recursive: true });

  // Prepare proxy - use Tor proxy if provided
  let proxy = torProxy || "";

  // Get extensions directory
  const extensionsDir = path.join(getExecutableDir(), "extensions");
  const extensionPaths: string[] = [];

  // Check if extensions directory exists and load all extensions
  if (fs.existsSync(extensionsDir)) {
    try {
      const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const extPath = path.join(extensionsDir, entry.name);
          // Check if it's a valid extension (has manifest.json)
          const manifestPath = path.join(extPath, "manifest.json");
          if (fs.existsSync(manifestPath)) {
            extensionPaths.push(extPath);
            console.log(`Found extension: ${entry.name}`);
          }
        }
      }
    } catch (e) {
      console.log("Failed to read extensions directory:", e);
    }
  }

  // Prepare launch options
  const launchOptions: any = {
    headless: false,
    // Disable sync/sign-in promos and first-run wizards
    args: [
      "--no-first-run",
      "--disable-sync",
      "--disable-features=msEdgeSync,msEdgeCustomMenagerie",
      "--start-maximized",
      "--disable-blink-features=AutomationControlled", // Helps with detection
      "--disable-infobars",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      ...extraArgs,
    ],
    ignoreDefaultArgs: ["--enable-automation"], // Hides "Chrome is being controlled by automated test software"
    ...(proxy && (() => {
      try {
        let server, username, password;

        // Handle format: http://host:port:user:pass
        // Remove protocol for splitting
        const cleanProxy = proxy.replace(/^https?:\/\//, '');
        const parts = cleanProxy.split(':');

        if (parts.length === 4) {
          // host:port:user:pass
          server = `http://${parts[0]}:${parts[1]}`;
          username = parts[2];
          password = parts[3];
        } else {
          // Try standard URL parsing: http://user:pass@host:port
          const proxyUrlStr = proxy.includes('://') ? proxy : `http://${proxy}`;
          const url = new URL(proxyUrlStr);
          server = `${url.protocol}//${url.host}`;
          username = decodeURIComponent(url.username);
          password = decodeURIComponent(url.password);
        }

        if (username && password) {
          return {
            proxy: {
              server,
              username,
              password,
            }
          };
        }
      } catch (e) { }
      return { proxy: { server: proxy } };
    })()),
  };

  // Removing the incognito logic since the profile is temporary anyway

  // Handle browser type
  if (browserType === "brave") {
    // Brave needs executable path instead of channel
    const braveExecutablePaths = [
      "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      `${process.env.LOCALAPPDATA}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    ];

    // Find the first existing Brave executable
    let braveFound = false;
    for (const bravePath of braveExecutablePaths) {
      if (fs.existsSync(bravePath)) {
        launchOptions.executablePath = bravePath;
        braveFound = true;
        console.log(`Using Brave at: ${bravePath}`);
        break;
      }
    }

    if (!braveFound) {
      console.error("Brave Browser not found! Please install Brave or select a different browser.");
      console.log("Searched paths:");
      braveExecutablePaths.forEach(p => console.log(`  - ${p}`));
      throw new Error("Brave Browser executable not found");
    }
  } else if (browserType === "opera-gx") {
    // Opera GX needs executable path instead of channel
    const operaGXExecutablePaths = [
      "C:\\Program Files\\Opera GX\\opera.exe",
      "C:\\Program Files (x86)\\Opera GX\\opera.exe",
      `${process.env.LOCALAPPDATA}\\Programs\\Opera GX\\opera.exe`,
    ];

    // Find the first existing Opera GX executable
    let operaGXFound = false;
    for (const operaGXPath of operaGXExecutablePaths) {
      if (fs.existsSync(operaGXPath)) {
        launchOptions.executablePath = operaGXPath;
        operaGXFound = true;
        console.log(`Using Opera GX at: ${operaGXPath}`);
        break;
      }
    }

    if (!operaGXFound) {
      console.error("Opera GX Browser not found! Please install Opera GX or select a different browser.");
      console.log("Searched paths:");
      operaGXExecutablePaths.forEach(p => console.log(`  - ${p}`));
      throw new Error("Opera GX Browser executable not found");
    }
  } else {
    // Chrome and Edge use channel
    launchOptions.channel = browserType;
  }

  // Add extension loading arguments if extensions exist
  if (extensionPaths.length > 0) {
    // Add --load-extension for each extension
    const extensionsArg = extensionPaths.join(",");
    launchOptions.args.push(`--load-extension=${extensionsArg}`);
    console.log(`Loading ${extensionPaths.length} extension(s)...`);
  }

  // Set viewport if provided
  if (viewportConfig) {
    launchOptions.viewport = {
      width: viewportConfig.width,
      height: viewportConfig.height,
    };
    // Set window position if provided
    if (viewportConfig.x !== undefined && viewportConfig.y !== undefined) {
      launchOptions.args.push(
        `--window-position=${viewportConfig.x},${viewportConfig.y}`,
        `--window-size=${viewportConfig.width},${viewportConfig.height}`
      );
    }
  } else {
    launchOptions.viewport = null; // Full screen
  }

  // Launch context
  const context = await chromium.launchPersistentContext(userDataDir, launchOptions);

  return context;
}
