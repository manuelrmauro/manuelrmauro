// import { setGlobalOptions } from "firebase-functions";
// import logger from "firebase-functions/logger";

import { initializeApp } from "firebase-admin/app"; // 1. Importar primero
import { onRequest } from "firebase-functions/https";

// 2. INICIALIZAR LA APP ANTES QUE TODO LO DEMÁS
// Esto prepara el terreno para que Firestore funcione en tus otros archivos
initializeApp();

import coreDistributor from "./src/core/coreDistributor.js";

const coreInput = coreDistributor.coreInput;
const coreErrorHandler = coreDistributor.coreErrorHandler;

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

export const coreapp = onRequest(async (req, res) => {
  try {
    await coreInput.process(req, res);
  } catch (error) {
    await coreErrorHandler.process("INTERNAL_ERROR", res, error.message);
  }
});
