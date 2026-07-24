/**
 * app.js — Configuração da aplicação Express com RBAC, Multi-Tenancy e Swagger para o Inventory Manager
 */

const express   = require("express");
const cors      = require("cors");
const helmet    = require("helmet");
const morgan    = require("morgan");
const rateLimit = require("express-rate-limit");
const fs        = require("fs");
const path      = require("path");

const customersRoutes = require("./routes/customers");
const assetsRoutes    = require("./routes/assets");
const mfaRoutes       = require("./routes/mfa");
const ssoRoutes       = require("./routes/sso");

const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : [
      "https://localhost:4545",
      "https://127.0.0.1:4545",
      "https://localhost",
      "http://localhost:5173",
      "http://localhost:80",
      "http://localhost:8000",
      "http://localhost:8001"
    ];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    // Permite qualquer origem local de desenvolvimento ou correspondente a lista
    if (ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost") || origin.startsWith("https://localhost")) {
      return callback(null, true);
    }
    return callback(new Error("CORS_ORIGIN_NOT_ALLOWED"), false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Key"],
  credentials: true,
};

function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet({
    strictTransportSecurity:    false,
    xFrameOptions:              false,
    xContentTypeOptions:        false,
    xXssProtection:             false,
    referrerPolicy:             false,
    contentSecurityPolicy:      false,
    crossOriginOpenerPolicy:    false,
    crossOriginResourcePolicy:  false,
    dnsPrefetchControl:         { allow: false },
    permittedCrossDomainPolicies: false,
    originAgentCluster:         false,
  }));

  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));
  app.use(express.json({ limit: "10mb" }));
  app.use(morgan("combined"));

  // ─── Rate Limiting ──────────────────────────────────────────────────────────
  app.use("/api/customer/token",       rateLimit({ windowMs: 60_000, limit: 60  }));
  app.use("/api/customer/user/login",  rateLimit({ windowMs: 60_000, limit: 20  }));
  app.use("/api/mfa/verify",           rateLimit({ windowMs: 15 * 60_000, limit: 10 }));
  app.use("/api/mfa/validate",         rateLimit({ windowMs: 15 * 60_000, limit: 10 }));

  // ─── Rotas ──────────────────────────────────────────────────────────────────
  app.get("/api/health", (req, res) => res.json({ ok: true }));

  app.use("/api/customer", customersRoutes);
  app.use("/api/assets",   assetsRoutes);
  app.use("/api/mfa",      mfaRoutes);
  app.use("/api/auth",     ssoRoutes); // SSO Portal CWO (Keycloak)

  // 404
  app.use((req, res) => res.status(404).json({ error: "NOT_FOUND" }));

  // Handler de erro global
  app.use((err, req, res, next) => {
    console.error("[ERROR]", err.message || err);
    if (err.message === "CORS_ORIGIN_NOT_ALLOWED") {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  });

  return app;
}

module.exports = { createApp };
