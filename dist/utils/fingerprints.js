"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRandomFingerprint = getRandomFingerprint;
const fingerprints = [
    {
        id: "win10-chrome-1",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 1920, height: 1080 },
        locale: "en-US",
        timezoneId: "America/New_York",
        screen: { width: 1920, height: 1080 }
    },
    {
        id: "win10-edge-1",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
        viewport: { width: 1366, height: 768 },
        locale: "en-US",
        timezoneId: "America/Los_Angeles",
        screen: { width: 1366, height: 768 }
    },
    {
        id: "win11-chrome-2",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        viewport: { width: 1536, height: 864 },
        locale: "en-GB",
        timezoneId: "Europe/London",
        screen: { width: 1536, height: 864 }
    },
    {
        id: "win11-edge-2",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
        viewport: { width: 2560, height: 1440 },
        locale: "en-US",
        timezoneId: "America/Chicago",
        screen: { width: 2560, height: 1440 }
    },
    {
        id: "mac-chrome-1",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 1440, height: 900 },
        locale: "en-US",
        timezoneId: "America/New_York",
        screen: { width: 1440, height: 900 }
    }
];
function getRandomFingerprint() {
    const randomIndex = Math.floor(Math.random() * fingerprints.length);
    return fingerprints[randomIndex];
}
