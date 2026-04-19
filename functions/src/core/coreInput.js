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
        "/status": this.getStatus,
        "/meta/webhook": this.verifyWhatsappWebhook
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
  async verifyWhatsappWebhook(req, res) {
    const errorHandler = this.distributor.coreErrorHandler;

    // 1. Extraer parámetros de Meta
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    // 2. Extraer nuestro identificador (agregado por nosotros en la URL de Meta)
    const tenantTag = req.query["tenant"];

    if (!tenantTag) {
      return await errorHandler.process(
        "METHOD_NOT_ALLOWED",
        res,
        "Falta identificador de tenant en la URL"
      );
    }

    try {
      // 3. Pedir el "Pasaporte" a la Database
      // Usamos una nueva ruta de consulta que busque por tenantNameTag
      const credentials = await this.distributor.coreData.process(
        "GET",
        "DATABASE",
        {
          apiKey: process.env.CORE_DATA_API_KEY,
          route: "credentials/tenant",
          filters: { tenantTag: tenantTag }
        },
        res
      );

      if (!credentials || !credentials.whatsapp) {
        return await errorHandler.process(
          "NOT_FOUND",
          res,
          "Credenciales no encontradas"
        );
      }

      // 4. Validación Dinámica Blindada
      const MY_VERIFY_TOKEN = credentials.whatsapp.verifyToken;

      // Agregamos una validación de "Existencia Real"
      if (!MY_VERIFY_TOKEN || MY_VERIFY_TOKEN.trim() === "") {
        return await errorHandler.process(
          "INTERNAL_ERROR",
          res,
          "El servidor no tiene configurado un token de verificación para este cliente."
        );
      }

      if (mode === "subscribe" && token === MY_VERIFY_TOKEN) {
        console.log(`[WEBHOOK] ${tenantTag} validado correctamente.`);
        return res.status(200).send(challenge);
      } else {
        // Si llegamos acá es porque mandaste un token que no coincide
        // O porque mandaste vacío y el servidor tenía un token real
        return await errorHandler.process(
          "METHOD_NOT_ALLOWED",
          res,
          "Token de verificación incorrecto o no provisto"
        );
      }
    } catch (error) {
      return await errorHandler.process("INTERNAL_ERROR", res, error.message);
    }
  }
}

export default new CoreApp();
