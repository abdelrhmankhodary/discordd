"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDiscordToken = getDiscordToken;
async function getDiscordToken(page) {
    const token = await page.evaluate(() => {
        function getLocalStoragePropertyDescriptor() {
            const iframe = document.createElement("iframe");
            document.head.appendChild(iframe);
            const pd = Object.getOwnPropertyDescriptor(iframe.contentWindow, "localStorage");
            document.head.removeChild(iframe);
            if (!pd || typeof pd.get !== "function") {
                throw new Error("Could not find iframe.localStorage descriptor");
            }
            return pd;
        }
        const pd = getLocalStoragePropertyDescriptor();
        Object.defineProperty(window, "localStorage", pd);
        const storage = pd.get.call(window);
        return storage.getItem("token");
    });
    if (token === null) {
        throw new Error("Discord token not found in localStorage");
    }
    return token;
}
