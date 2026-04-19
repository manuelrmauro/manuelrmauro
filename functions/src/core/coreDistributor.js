import coreInputInstance from "./coreInput.js"; // Importás la instancia
import coreErrorHandler from "./coreErrorHandler.js";
import coreData from "./coreData.js";

class CoreDistributor {
  constructor() {
    this.coreInput = coreInputInstance;
    this.coreErrorHandler = coreErrorHandler;
    this.coreData = coreData;

    // EL TRUCO: Le inyectamos ESTA instancia al input
    this.coreInput.init(this);
    this.coreErrorHandler.init(this);
    this.coreData.init(this);
  }
}

export default new CoreDistributor();
