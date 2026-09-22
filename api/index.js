// Vercel serverless entry point. Every request to /api/* is routed here
// (see the rewrite in vercel.json) and handled by the same Express app
// used for local development in server.js.
import { app } from "../src/app.js";

export default app;
