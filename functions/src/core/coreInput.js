import coreDistributor from "./coreDistributor.js";
const coreErrorHandler = coreDistributor.coreErrorHandler;

class CoreApp {
  constructor() {
    // Diccionario de rutas por método
    this.routes = {
      POST: {
        // "/webhook": this.handleWebhook,
        // "/order": this.createOrder
      },
      GET: {
        "/status": this.getStatus
        // "/menu": this.getMenu
      }
    };
  }

  async process(req, res) {
    const { method, path } = req;

    // 1. Validar si el método existe
    if (!this.routes[method]) {
      return await coreErrorHandler.process(
        "METHOD_NOT_ALLOWED",
        res,
        `Método ${method} no permitido`
      );
    }

    // 2. Validar si la ruta existe para ese método
    const handler = this.routes[method][path];

    if (!handler) {
      return await coreErrorHandler.process(
        "ROUTE_NOT_FOUND",
        res,
        `Ruta ${path} no encontrada para método ${method}`
      );
    }

    // 3. Ejecutar (usando .call para asegurar el 'this')
    try {
      return await handler.call(this, req, res);
    } catch (error) {
      console.error("Error en Handler:", error);
      return await coreErrorHandler.process(
        "INTERNAL_ERROR",
        res,
        error.message
      );
    }
  }

  // --- Handlers (Lógica) ---

  async getStatus(req, res) {
    res.status(200).json({ status: "online", uptime: process.uptime() });
  }
}

export default new CoreApp();
