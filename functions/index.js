// import { setGlobalOptions } from "firebase-functions";
// import logger from "firebase-functions/logger";

import { onRequest } from "firebase-functions/https";
import coreDistributor from "./core/coreDistributor.js";

const coreInput = coreDistributor.coreInput;
const coreErrorHandler = coreDistributor.coreErrorHandler;

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

export const CoreApp = onRequest(async (req, res) => {
  try {
    await coreInput.process(req, res);
  } catch (error) {
    await coreErrorHandler.process("INTERNAL_ERROR", res, error.message);
  }
});
