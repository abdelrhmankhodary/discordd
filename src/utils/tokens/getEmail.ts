import { popFirstLine } from "../files/index";
import { join } from "path";

const EMAILS_INPUT_PATH = join(__dirname, "../../../data/input/emails.txt");

export async function getEmail() {
  try {
    const emailLine = await popFirstLine(EMAILS_INPUT_PATH);
    if (!emailLine) {
      throw new Error("No API key available in keys.txt");
    }
    return emailLine.trim();
  } catch (err) {
    console.error("[getEmail] Failed to retrieve email:", err);
    throw err;
  }
}
