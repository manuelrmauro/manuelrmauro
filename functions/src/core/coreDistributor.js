import coreInputInstance from "./coreInput.js"; // Importás la instancia
import coreErrorHandler from "./coreErrorHandler.js";

class CoreDistributor {
  constructor() {
    this.coreInput = coreInputInstance;
    this.coreErrorHandler = coreErrorHandler;

    // EL TRUCO: Le inyectamos ESTA instancia al input
    this.coreInput.init(this);
    this.coreErrorHandler.init(this);
  }
}

export default new CoreDistributor();
