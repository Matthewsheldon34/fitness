// Backend/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import authRoutes from "./routes/auth.js";
import checkoutRoutes from "./routes/checkout.js";
import webhookRouter from "./webhook.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "https://fitness-1-od9s.onrender.com",
    credentials: true,
  })
);


app.use("/api/checkout/webhook", webhookRouter);

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/checkout", checkoutRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));


const buildPath = path.join(__dirname, "..", "dist");
app.use(express.static(buildPath));


app.get("/{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(buildPath, "index.html"));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API + UI running on ${PORT}`));