// Vercel serverless entry — the whole Express app as one function.
import 'dotenv/config';   // load .env before anything else
import { app } from '../src/app.js';
export default app;
