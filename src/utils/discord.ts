// Define whatever shape your runner exposes:
export interface CustomPage {
  /**
   * Evaluate a function in the page context.
   * @param fn – the function to run in-browser
   * @returns the result, marshalled back to Node
   */
  evaluate<R>(fn: () => R): Promise<R>;
}

export async function getDiscordToken(page: CustomPage): Promise<string> {
  const token = await page.evaluate<string | null>(() => {
    function getLocalStoragePropertyDescriptor(): PropertyDescriptor {
      const iframe = document.createElement("iframe");
      document.head.appendChild(iframe);
      const pd = Object.getOwnPropertyDescriptor(iframe.contentWindow!, "localStorage");
      document.head.removeChild(iframe);
      if (!pd || typeof pd.get !== "function") {
        throw new Error("Could not find iframe.localStorage descriptor");
      }
      return pd;
    }

    const pd = getLocalStoragePropertyDescriptor();
    Object.defineProperty(window, "localStorage", pd);
    const storage = pd.get!.call(window) as Storage;
    return storage.getItem("token");
  });

  if (token === null) {
    throw new Error("Discord token not found in localStorage");
  }

  return token;
}
