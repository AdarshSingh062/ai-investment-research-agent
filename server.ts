import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { runInvestmentResearch } from "./src/agent.js";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route: Real-Time Investment Research SSE Streaming
  app.get("/api/research", async (req, res) => {
    const company = req.query.company as string;
    
    if (!company) {
      res.status(400).json({ error: "Company name is required" });
      return;
    }

    // Set headers for Server-Sent Events
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendSSE = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      console.log(`Starting autonomous research agent for: "${company}"`);
      const report = await runInvestmentResearch(company, (step) => {
        sendSSE("step", step);
      });

      console.log(`Research report completed for: "${company}"`);
      sendSSE("completed", report);
      res.end();
    } catch (err: any) {
      console.error(`Error during investment research for "${company}":`, err);
      sendSSE("error", { message: err.message || "An unexpected error occurred during agent execution." });
      res.end();
    }
  });

  // Vite middleware or static serving
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
