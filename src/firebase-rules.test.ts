import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { CLOUD_ENVELOPE_VERSION } from "./cloud-envelope";
import { emptyAppData } from "./storage";

const PROJECT_ID = "cfmarc-rules-test";
const RULES = readFileSync("database.rules.json", "utf8");

let env: RulesTestEnvironment;

function validEnvelope() {
  return {
    schemaVersion: CLOUD_ENVELOPE_VERSION,
    revision: 1,
    updatedAt: Date.now(),
    writerId: "test-installation-id",
    data: emptyAppData(),
  };
}

describe("database security rules (temporary open access)", () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      database: {
        rules: RULES,
        host: "127.0.0.1",
        port: 9000,
      },
    });
  });

  beforeEach(async () => {
    await env.clearDatabase();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("allows unauthenticated read on personal/finance", async () => {
    const db = env.unauthenticatedContext().database();
    await assertSucceeds(db.ref("personal/finance").get());
  });

  it("allows unauthenticated write on personal/finance", async () => {
    const db = env.unauthenticatedContext().database();
    await assertSucceeds(db.ref("personal/finance").set(validEnvelope()));
  });

  it("allows any anonymous uid to read and write", async () => {
    const db = env.authenticatedContext("any-anonymous-uid").database();
    await assertSucceeds(db.ref("personal/finance").set(validEnvelope()));
    await assertSucceeds(db.ref("personal/finance").get());
  });

  it("rejects write at database root", async () => {
    const db = env.unauthenticatedContext().database();
    await assertFails(db.ref("/").set({ public: true }));
  });

  it("rejects write outside personal/finance", async () => {
    const db = env.unauthenticatedContext().database();
    await assertFails(db.ref("other/path").set({ value: 1 }));
  });
});
