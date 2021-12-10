import { rinkeby } from "../utils/addresses";
import { main } from "./testnet-deploy";
import { deployMocks } from "./mock-deploy";

async function rinkebyDeploy() {
  await main("rinkeby", rinkeby, 10000000);
  await deployMocks();
}

rinkebyDeploy();
