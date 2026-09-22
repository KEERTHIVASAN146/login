// Local development server only. On Vercel, api/index.js serves the same
// Express app as a serverless function and static files are served
// automatically from the project root — this file is never used there.
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { app } from "./src/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4100;

app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Phantasm register-lite listening on http://localhost:${PORT}`);
});
