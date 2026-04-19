import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";
import crypto from "crypto";
// 1. INICIALIZACIÓN SAGRADA
initializeApp();

import coreDistributor from "./src/core/coreDistributor.js";
const coreInput = coreDistributor.coreInput;
const coreErrorHandler = coreDistributor.coreErrorHandler;

// 2. CONFIGURACIÓN DE CÉLULAS AUTORIZADAS (Extensible)
// 2. CONFIGURACIÓN DE CÉLULAS AUTORIZADAS (Extensible)
// 2. CONFIGURACIÓN DE CÉLULAS AUTORIZADAS (Extensible)
// Aquí es donde irás agregando cada nueva "hermana" que se sume al sistema

const AUTHORIZED_PROVIDERS = {
  // CÉLULA META: Validación oficial de WhatsApp/Facebook
  META: (req) => {
    const signature = req.headers["x-hub-signature-256"];
    const userAgent = req.headers["user-agent"] || "";
    const appSecret = process.env.META_APP_SECRET; // Debes tener esto en tus secretos

    // A. Verificación de Webhook (Apretón de manos inicial)
    // Meta usa GET y el User-Agent para validar que el servidor existe.
    if (req.method === "GET" && userAgent.includes("facebookexternalhit")) {
      return true;
    }

    // B. Verificación de Mensajes (POST)
    // Meta firma cada mensaje usando el APP_SECRET.
    if (req.method === "POST" && signature && appSecret) {
      try {
        // Extraemos el hash (quitando el prefijo 'sha256=')
        const hash = signature.split("=")[1];

        // Creamos el HMAC usando el rawBody original (sin parsear)
        const expectedHash = crypto
          .createHmac("sha256", appSecret)
          .update(req.rawBody) // ¡CRUCIAL! Usar el buffer crudo
          .digest("hex");

        return hash === expectedHash;
      } catch (err) {
        console.error("Error validando firma de Meta:", err.message);
        return false;
      }
    }

    return false;
  },

  // CÉLULA INTERNAL: Validación para tus tests y sistemas propios
  INTERNAL: (req) => {
    const masterKey = process.env.CORE_INTERNAL_KEY;
    const signature = req.headers["x-core-signature"];
    const timestamp = req.headers["x-core-timestamp"];

    if (!masterKey || !signature || !timestamp) return false;

    try {
      // --- LA SOLUCIÓN QUIRÚRGICA ---
      // Si el rawBody tiene contenido, lo usamos. Si no, es "" (SIEMPRE).
      // Esto evita que el JSON.stringify({}) meta basura en el hash.
      const dataToVerify =
        req.rawBody && req.rawBody.length > 0 ? req.rawBody.toString() : "";

      const expectedSignature = crypto
        .createHmac("sha256", masterKey)
        .update(`${timestamp}${dataToVerify}`)
        .digest("hex");

      return signature === expectedSignature;
    } catch (err) {
      return false;
    }
  }
};

// 3. LA ADUANA (index.js)
// 3. LA ADUANA (index.js)
// 3. LA ADUANA (index.js)
export const coreapp = onRequest(
  {
    memory: "256MiB",
    maxInstances: 10,
    region: "us-central1",
    secrets: ["CORE_INTERNAL_KEY", "META_APP_SECRET"]
  },
  async (req, res) => {
    try {
      // --- FILTRO DE IDENTIDAD MODULAR ---
      // Recorremos todas las células y vemos si alguna valida la petición
      const isAuthorized = Object.values(AUTHORIZED_PROVIDERS).some((check) =>
        check(req)
      );

      if (!isAuthorized) {
        return await coreErrorHandler.process(
          "UNAUTHORIZED",
          res,
          "Acceso denegado: Ninguna célula de confianza reconoce esta petición."
        );
      }

      // --- FILTRO DE CARGA GENÉRICO ---
      const contentLength = req.headers["content-length"];
      if (contentLength && parseInt(contentLength) > 100000) {
        // 100kb limit
        return await coreErrorHandler.process(
          "PAYLOAD_TOO_LARGE",
          res,
          "Carga de datos excesiva para los andamios actuales."
        );
      }

      // --- PROCESAMIENTO ---
      await coreInput.process(req, res);
    } catch (error) {
      await coreErrorHandler.process(
        "INTERNAL_ERROR",
        res,
        `Falla en el Punto de Entrada: ${error.message}`
      );
    }
  }
);
