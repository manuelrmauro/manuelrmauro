class CoreApp {
  constructor() {
    this.distributor = null; // Se llenará al iniciar
    // Diccionario de rutas por método

    this.routes = {
      POST: {
        "/meta/webhook": this.handleWhatsappWebhook
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

  // HEALTH CHECK BÁSICO
  async getStatus(req, res) {
    res.status(200).json({ status: "online", uptime: process.uptime() });
  }

  // WEBHOOK DE WHATSAPP GET (VALIDACIÓN INICIAL DE META)
  // WEBHOOK DE WHATSAPP GET (VALIDACIÓN INICIAL DE META)
  // WEBHOOK DE WHATSAPP GET (VALIDACIÓN INICIAL DE META)
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

  // WEBHOOK DE WHATSAPP POST (MENSAJES ENTRANTES)
  // WEBHOOK DE WHATSAPP POST (MENSAJES ENTRANTES)
  // WEBHOOK DE WHATSAPP POST (MENSAJES ENTRANTES)
  async handleWhatsappWebhook(req, res) {
    const errorHandler = this.distributor.coreErrorHandler;

    try {
      const body = req.body;

      // 1. FILTRO DE ORIGEN (Seguridad básica)
      // Si el JSON no viene de una cuenta de WhatsApp Business, lo rebotamos.
      // Acá sí usamos un 404 porque es tráfico basura, no es de Meta.
      if (body.object !== "whatsapp_business_account") {
        return await errorHandler.process(
          "ROUTE_NOT_FOUND",
          res,
          "Payload no reconocido. No proviene de WhatsApp. Acceso denegado."
        );
      }

      // Navegación defensiva del JSON (Evitamos que explote si Meta cambia algo menor)
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // 2. FILTRO DE RUIDO (Statuses vs Mensajes)
      // Meta avisa cuando un mensaje fue entregado o leído. Eso no tiene array 'messages'.
      // Como no nos interesa responder a un "visto", cortamos acá.
      // IMPORTANTE: Devolvemos 200 OK para que Meta sepa que lo recibimos y no insista.
      if (!value || !value.messages || !value.messages[0]) {
        // Opcional: Podrías derivar esto a un handler de analíticas si querés medir "Leídos"
        return res.status(200).send("EVENT_RECEIVED_BUT_IGNORED");
      }

      // 3. EXTRACCIÓN QUIRÚRGICA DE IDs
      const incomingMessage = value.messages[0];
      const phoneNumberId = value.metadata.phone_number_id; // Destino (Nuestra Pizzería)
      const customerPhone = incomingMessage.from; // Remitente (El Cliente)
      const wamid = incomingMessage.id; // ID único del mensaje
      const messageType = incomingMessage.type; // text, interactive, audio, etc.

      // 4. CARGA DE IDENTIDAD Y TOKENS (Conexión con tu CoreData)
      // Llamamos a la función que armamos ayer. Ya trae la herencia de tokens resuelta.
      // No pasamos 'res' aquí porque si el tenant no existe, queremos atajar el error
      // nosotros y devolverle 200 a Meta (para que no reintente), pero loguearlo.
      let tenantIdentity;
      try {
        tenantIdentity = await this.distributor.coreData.process(
          "GET",
          "DATABASE",
          {
            apiKey: process.env.CORE_DATA_API_KEY,
            route: "credentials/meta",
            filters: { phoneNumberId: phoneNumberId }
          }
        );
      } catch (dbError) {
        // Ej: El tenant está inactivo (SERVICE_INACTIVE) o no existe.
        // Lo registramos en nuestro sistema, pero "engañamos" a Meta con un 200.
        console.warn(`[WEBHOOK ABORTADO] ${dbError.message} | WAMID: ${wamid}`);
        errorHandler.process(
          "METHOD_NOT_ALLOWED",
          null,
          `Acceso denegado a la DB: ${dbError.message}`
        );
        return res.status(200).send("TENANT_ERROR_HANDLED_INTERNALLY");
      }

      // 5. NORMALIZACIÓN DEL MENSAJE (Traducción de Meta a tu sistema)
      // En vez de pasar el JSON crudo, le entregamos al bot un objeto pre-masticado.
      const normalizedContent = {
        type: messageType,
        wamid: wamid,
        timestamp: incomingMessage.timestamp
      };

      if (messageType === "text") {
        normalizedContent.text = incomingMessage.text.body;
      } else if (messageType === "interactive") {
        const interactive = incomingMessage.interactive;
        if (interactive.type === "button_reply") {
          normalizedContent.buttonId = interactive.button_reply.id;
          normalizedContent.buttonText = interactive.button_reply.title;
        } else if (interactive.type === "list_reply") {
          normalizedContent.listId = interactive.list_reply.id;
          normalizedContent.listTitle = interactive.list_reply.title;
        }
      } else {
        // Atrapa imágenes, audios, documentos, etc.
        normalizedContent.mediaId = incomingMessage[messageType]?.id;
        errorHandler.process(
          "METHOD_NOT_ALLOWED",
          null,
          `Tipo de mensaje no soportado: ${messageType} | WAMID: ${wamid}`
        );
      }

      // 6. ENSAMBLAJE DEL PAYLOAD MAESTRO
      // Este es el objeto perfecto que viajará por el resto de tu arquitectura.
      const botPayload = {
        tenant: tenantIdentity.tenant, // Ej: "pepe_pizza_001"
        customerPhone: customerPhone, // Ej: "549112345678"
        content: normalizedContent, // Lo que dijo el cliente
        credentials: tenantIdentity.whatsapp // Tokens (Propios o del Admin) para responder
      };

      // 7. DESPACHO (Acá se conecta la siguiente capa de tu bot)
      // TODO: this.distributor.coreLogic.processMessage(botPayload);
      console.log(
        `[NUEVO MENSAJE] Tenant: ${botPayload.tenant} | De: ${botPayload.customerPhone}`
      );

      // 8. CIERRE OBLIGATORIO DE CONEXIÓN CON META
      return res.status(200).send("EVENT_RECEIVED");
    } catch (error) {
      // Solo caemos acá por un error catastrófico de código (ej: variable no definida).
      // Usamos el errorHandler y ahí sí devolvemos un 500. Meta reintentará.
      return await errorHandler.process(
        "INTERNAL_ERROR",
        res,
        `Error de código en el webhook de WhatsApp: ${error.message}`
      );
    }
  }
}

export default new CoreApp();
