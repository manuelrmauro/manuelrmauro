// coreErrorHandler.js
class CoreErrorHandler {
  constructor() {
    this.distributor = null;

    // Diccionario centralizado de errores
    this.errorCatalog = {
      "METHOD_NOT_ALLOWED": [405, "Este método no está habilitado."],
      "ROUTE_NOT_FOUND": [404, "La ruta no existe en el Core."],
      "INTERNAL_ERROR": [500, "Ocurrió un error inesperado en el servidor."],
      "FATAL": [500, "Error fatal no categorizado."]
    };
  }

  init(distributorInstance) {
    this.distributor = distributorInstance;
  }

  async process(errorCode, res, technicalDetail = "") {
    // Buscamos el error en el catálogo o usamos el fatal por defecto
    const [status, message] =
      this.errorCatalog[errorCode] || this.errorCatalog["FATAL"];

    if (status === 500 || technicalDetail) {
      console.error(
        `[ERROR HANDLER] Code: ${errorCode} | Detail: ${technicalDetail}`
      );
    }

    if (res?.status) {
      return res.status(status).json({
        success: false,
        status: status,
        error: {
          code: errorCode,
          message: message,
          detail: technicalDetail
        }
      });
    }

    return { status, errorCode, message };
  }
}

export default new CoreErrorHandler();
