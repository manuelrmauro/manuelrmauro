class CoreApp {
  constructor() {
    this.distributor = null; // Se llenará al iniciar
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

  // Método para recibir al distribuidor sin hacer import circular
  init(distributorInstance) {
    this.distributor = distributorInstance;
  }

  async process(req, res) {
    const { method, path } = req;
    const errorHandler = this.distributor.coreErrorHandler;

    // 1. Buscamos si la ruta existe en CUALQUIER método disponible
    const allMethods = Object.keys(this.routes);
    const routeExistsSomewhere = allMethods.some((m) => this.routes[m][path]);

    // 2. Si la ruta no existe en ningún método -> 404 REAL
    if (!routeExistsSomewhere) {
      return await errorHandler.process(
        "ROUTE_NOT_FOUND",
        res,
        `Ruta ${path} no existe en el sistema.`
      );
    }

    // 3. Si la ruta existe pero no para el método que mandaron -> 405
    if (!this.routes[method] || !this.routes[method][path]) {
      return await errorHandler.process(
        "METHOD_NOT_ALLOWED",
        res,
        `El método ${method} no está disponible para ${path}`
      );
    }

    // 4. Si todo está bien, ejecutamos
    try {
      const handler = this.routes[method][path];
      return await handler.call(this, req, res);
    } catch (error) {
      return await errorHandler.process("INTERNAL_ERROR", res, error.message);
    }
  }

  // --- HANDLERS ---

  async getStatus(req, res) {
    res.status(200).json({ status: "online", uptime: process.uptime() });
  }
}

export default new CoreApp();
