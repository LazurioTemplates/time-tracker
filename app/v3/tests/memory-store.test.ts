import { createMemoryStore } from "../src/data/memory-store.ts";
import { storeContract } from "./store-contract.ts";
import { NOW, POLICY, sampleData } from "./support/seed.ts";

storeContract("memory", async () => ({
  store: createMemoryStore(sampleData(), { policy: POLICY, now: () => NOW }),
  cleanup: () => {},
}));
