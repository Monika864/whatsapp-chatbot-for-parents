require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const { initDb } = require("./db");
const webhookRouter = require("./routes/webhook");
const adminRouter = require("./routes/admin");
const parentRouter = require("./routes/parent");

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    max: 100
  })
);

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "parent-whatsapp-chatbot" });
});

app.use("/api/admin", adminRouter);
app.use("/api/parent", parentRouter);
app.use("/", webhookRouter);

app.get("/", (req, res) => {
  res.json({
    service: "parent-whatsapp-chatbot-backend",
    frontend: "Run frontend separately on http://localhost:5173",
    health: "/health",
    webhook: "/webhook"
  });
});

async function start() {
  if (!process.env.JWT_SECRET) {
    throw new Error("Missing JWT_SECRET in environment.");
  }

  await initDb();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Webhook URL: ${process.env.APP_BASE_URL || `http://localhost:${PORT}`}/webhook`);
  });
}

start().catch((error) => {
  console.error("Startup failed:", error);
  process.exit(1);
});
