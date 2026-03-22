import cors from "@elysiajs/cors";
import { Elysia } from "elysia";
import { healthRoute } from "./routes/index.js";

const PORT = Number(process.env.PORT) || 3000;

export const app = new Elysia().use(cors()).use(healthRoute).listen(PORT);

console.log(`API server running on http://localhost:${PORT}`);
