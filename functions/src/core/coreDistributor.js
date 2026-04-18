import coreInput from "./coreInput.js";
import coreErrorHandler from "./coreErrorHandler.js";

class CoreDistributor {
  constructor() {
    this.coreInput = coreInput;
    this.coreErrorHandler = coreErrorHandler;
  }
}

export default new CoreDistributor();
