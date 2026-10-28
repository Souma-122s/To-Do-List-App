import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.join(__dirname, "..");
dotenv.config({ path: path.join(projectRoot, ".env") });
