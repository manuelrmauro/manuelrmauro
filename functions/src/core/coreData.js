import { getFirestore, FieldValue } from "firebase-admin/firestore";

class CoreData {
  constructor() {
    this.distributor = null;

    // --- SOLUCIÓN AL ERROR DE DEPLOY ---
    // No llamamos a getFirestore() directamente aquí para evitar el error 'no-app'.
    // Usaremos el getter 'this.db' que ves más abajo.
    this._db = null;

    // Declaración de la API Key interna para la seguridad de process()
    this.INTERNAL_KEY = process.env.CORE_DATA_API_KEY;

    // MAPEO DE RUTAS A COLECCIONES REALES (Búsqueda directa por ID)
    this.dataMap = {
      "credentials": "credentials",
      "tenants": "tenants"
    };

    // DICCIONARIO DE CONSULTAS (Búsqueda compleja por filtros)
    this.queryMap = {
      "credentials/meta": this.queryMetaCredentials,
      "credentials/tenant": this.queryByTenantTag
    };

    this.operations = {
      GET: {
        "SESSION": this.getSession,
        "DATABASE": this.getDatabase
      },
      POST: {
        "SESSION": this.setSession,
        "DATABASE": this.setDatabase
      }
    };
  }

  // Getter inteligente: inicializa la DB solo cuando se necesita realmente
  get db() {
    if (!this._db) {
      this._db = getFirestore();
    }
    return this._db;
  }

  init(distributorInstance) {
    this.distributor = distributorInstance;
  }

  async process(method, target, params = {}, res = null) {
    const errorHandler = this.distributor.coreErrorHandler;

    // --- BLOQUE DE SEGURIDAD ---
    const { apiKey } = params;
    if (apiKey !== this.INTERNAL_KEY) {
      console.error(
        "[SECURITY ALERT] Intento de acceso a datos sin API Key válida."
      );
      if (res?.status) {
        return await errorHandler.process(
          "METHOD_NOT_ALLOWED",
          res,
          "Acceso denegado a la DB"
        );
      }
      throw new Error("Unauthorized: database API Key inválida");
    }

    if (!this.operations[method] || !this.operations[method][target]) {
      if (res?.status) {
        return await errorHandler.process(
          "METHOD_NOT_ALLOWED",
          res,
          `Operación no soportada: ${method} en ${target}`
        );
      }
      throw new Error(`Operación no soportada: ${method} en ${target}`);
    }

    try {
      const handler = this.operations[method][target];
      return await handler.call(this, params, res);
    } catch (error) {
      console.error(`[CORE DATA ERROR] ${error.message}`);
      if (res?.status) {
        return await errorHandler.process("INTERNAL_ERROR", res, error.message);
      }
      throw error;
    }
  }

  // --- HANDLERS DE DATABASE ---

  async getDatabase({ route, id, filters }, res) {
    // 1. Si mandan un ID explícito, hacemos búsqueda directa y barata (dataMap)
    if (id) {
      const collectionName = this.dataMap[route];
      if (!collectionName) {
        if (res?.status) {
          return await this.distributor.coreErrorHandler.process(
            "ROUTE_NOT_FOUND",
            res,
            `Ruta de datos directa '${route}' no definida en dataMap.`
          );
        }
        throw new Error(
          `Ruta de datos directa '${route}' no definida en dataMap.`
        );
      }

      const doc = await this.db.collection(collectionName).doc(id).get();
      return doc.exists ? doc.data() : null;
    }

    // 2. Si NO mandan ID, asumimos que es una búsqueda compleja (queryMap)
    const queryHandler = this.queryMap[route];
    if (!queryHandler) {
      if (res?.status) {
        return await this.distributor.coreErrorHandler.process(
          "ROUTE_NOT_FOUND",
          res,
          `Ruta de consulta '${route}' no definida en queryMap.`
        );
      }
      throw new Error(`Ruta de consulta '${route}' no definida en queryMap.`);
    }

    // AJUSTE: Pasamos también 'res' para que el queryHandler pueda reportar errores
    return await queryHandler.call(this, filters, res);
  }

  async setDatabase({ route, id, data }, res) {
    const collectionName = this.dataMap[route];
    if (!collectionName) {
      if (res?.status) {
        return await this.distributor.coreErrorHandler.process(
          "ROUTE_NOT_FOUND",
          res,
          `Ruta de datos '${route}' no definida en dataMap.`
        );
      }
      throw new Error(`Ruta de datos '${route}' no definida en dataMap.`);
    }

    await this.db
      .collection(collectionName)
      .doc(id)
      .set(
        {
          ...data,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

    return { success: true };
  }

  // --- LÓGICA DE CONSULTAS (Private Methods) ---

  async queryByTenantTag({ tenantTag }, res) {
    const errorHandler = this.distributor.coreErrorHandler;

    const snapshot = await this.db
      .collection("credentials")
      .where("tenantNameTag", "==", tenantTag)
      .limit(1)
      .get();

    if (snapshot.empty) {
      if (res?.status) {
        return await errorHandler.process(
          "ROUTE_NOT_FOUND",
          res,
          `No se encontraron credenciales para el tenant: ${tenantTag}`
        );
      }
      return null;
    }

    const credData = snapshot.docs[0].data();
    const credId = snapshot.docs[0].id;

    // ELIMINAMOS LA HERENCIA:
    // Para el GET de Meta, solo devolvemos la data pura del documento.
    // Si whatsapp.verifyToken está vacío en la DB, la validación fallará
    // aunque uses el token del admin en Postman.

    return {
      id: credId,
      ...credData
    };
  }

  async queryMetaCredentials({ phoneNumberId }, res) {
    const errorHandler = this.distributor.coreErrorHandler;

    // 1. BUSCAR CREDENCIAL POR PHONE_NUMBER_ID
    const credSnapshot = await this.db
      .collection("credentials")
      .where("whatsapp.phoneNumberId", "==", phoneNumberId)
      .limit(1)
      .get();

    if (credSnapshot.empty) {
      if (res?.status) {
        return await errorHandler.process(
          "ROUTE_NOT_FOUND",
          res,
          `No se encontró configuración para el ID: ${phoneNumberId}`
        );
      }
      throw new Error(
        `No se encontró configuración para el ID: ${phoneNumberId}`
      );
    }

    const credData = credSnapshot.docs[0].data();
    const credId = credSnapshot.docs[0].id;

    // 2. VALIDAR ESTADO DEL TENANT (CLIENTE)
    const tenantSnapshot = await this.db
      .collection("tenants")
      .where("nameTag", "==", credData.tenantNameTag)
      .limit(1)
      .get();

    if (tenantSnapshot.empty) {
      if (res?.status) {
        return await errorHandler.process(
          "ROUTE_NOT_FOUND",
          res,
          `No se encontró el Tenant asociado para el tag: ${credData.tenantNameTag}`
        );
      }
      throw new Error("El Tenant asociado no existe.");
    }

    const tenantData = tenantSnapshot.docs[0].data();

    // Verificamos si el servicio está activo
    if (!tenantData.isActive) {
      if (res?.status) {
        return await errorHandler.process(
          "METHOD_NOT_ALLOWED",
          res,
          "Servicio inactivo para este cliente."
        );
      }
      throw new Error("SERVICE_INACTIVE");
    }

    // 3. CONSOLIDAR TOKENS (Herencia por infra_link)
    const finalWhatsapp = { ...credData.whatsapp };

    // Si al cliente le falta el token, lo hereda del admin (infra_link)
    if (
      (!finalWhatsapp.accessToken || finalWhatsapp.accessToken === "") &&
      credData.infra_link
    ) {
      const infraDoc = await this.db
        .collection("credentials")
        .doc(credData.infra_link)
        .get();

      if (infraDoc.exists) {
        const infraData = infraDoc.data();
        finalWhatsapp.verifyToken =
          finalWhatsapp.verifyToken || infraData.whatsapp?.verifyToken;
        finalWhatsapp.accessToken =
          finalWhatsapp.accessToken || infraData.whatsapp?.accessToken;
        finalWhatsapp.appSecret =
          finalWhatsapp.appSecret || infraData.whatsapp?.appSecret;
      }
    }

    // 4. RETORNO DE IDENTIDAD COMPLETA
    return {
      id: credId,
      tenant: tenantData.name,
      role: tenantData.role,
      whatsapp: finalWhatsapp
    };
  }

  // --- HANDLERS DE SESSION (Placeholders para tu implementación) ---

  async getSession({ id }, res) {
    const doc = await this.db.collection("sessions").doc(id).get();
    return doc.exists ? doc.data() : null;
  }

  async setSession({ id, data }, res) {
    await this.db
      .collection("sessions")
      .doc(id)
      .set(
        {
          ...data,
          lastInteraction: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    return { success: true };
  }
}

// Exportamos una instancia única (Singleton)
export default new CoreData();
