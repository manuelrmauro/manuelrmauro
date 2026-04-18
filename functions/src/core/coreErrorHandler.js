// coreErrorHandler.js
class CoreErrorHandler {
  async process(errorCode, res, technicalDetail = "") {
    const errors = {
      "METHOD_NOT_ALLOWED": [405, "Este método no está habilitado."],
      "ROUTE_NOT_FOUND": [404, "La ruta no existe en el Core."],
      "INTERNAL_ERROR": [500, "Ocurrió un error inesperado en el servidor."]
    };

    const [status, message] = errors[errorCode] || [500, "Error fatal."];

    // Si es un error 500 o tiene detalles técnicos, lo logueamos
    if (status === 500 || technicalDetail) {
      console.error(
        `[ERROR HANDLER] Code: ${errorCode} | Detail: ${technicalDetail}`
      );
    }

    // Enviamos la respuesta y cerramos el ciclo de Firebase
    if (res?.status) {
      return res.status(status).json({
        success: false,
        error: {
          code: errorCode,
          message: message
        }
      });
    }
  }
}
export default new CoreErrorHandler();
