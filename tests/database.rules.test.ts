import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { CLOUD_ENVELOPE_VERSION } from "../src/cloud-envelope.ts";
import { emptyAppData } from "../src/storage.ts";

const PROJECT_ID = "cfmarc-rules-test";
const RULES = readFileSync("database.rules.json", "utf8");

let env: RulesTestEnvironment;

function validEnvelope() {
  return {
    schemaVersion: CLOUD_ENVELOPE_VERSION,
    updatedAt: "2026-07-01T00:00:00.000Z",
    data: emptyAppData(),
  };
}

describe("database security rules", () => {
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

  it("denies unauthenticated read", async () => {
    const db = env.unauthenticatedContext().database();
    await assertFails(db.ref("users/user-a/finance").get());
  });

  it("denies unauthenticated write", async () => {
    const db = env.unauthenticatedContext().database();
    await assertFails(db.ref("users/user-a/finance").set(validEnvelope()));
  });

  it("allows authenticated user to read own node", async () => {
    const db = env.authenticatedContext("user-a").database();
    await assertSucceeds(db.ref("users/user-a/finance").set(validEnvelope()));
    await assertSucceeds(db.ref("users/user-a/finance").get());
  });

  it("allows authenticated user to write own node", async () => {
    const db = env.authenticatedContext("user-a").database();
    await assertSucceeds(db.ref("users/user-a/finance").set(validEnvelope()));
  });

  it("denies user A reading user B", async () => {
    const writer = env.authenticatedContext("user-b").database();
    await assertSucceeds(writer.ref("users/user-b/finance").set(validEnvelope()));
    const reader = env.authenticatedContext("user-a").database();
    await assertFails(reader.ref("users/user-b/finance").get());
  });

  it("denies user A writing user B", async () => {
    const writer = env.authenticatedContext("user-a").database();
    await assertFails(writer.ref("users/user-b/finance").set(validEnvelope()));
  });

  it("rejects invalid envelope", async () => {
    const db = env.authenticatedContext("user-a").database();
    await assertFails(
      db.ref("users/user-a/finance").set({
        schemaVersion: "invalid",
        updatedAt: "2026-07-01T00:00:00.000Z",
        data: emptyAppData(),
      }),
    );
  });

  it("accepts valid envelope", async () => {
    const db = env.authenticatedContext("user-a").database();
    await assertSucceeds(db.ref("users/user-a/finance").set(validEnvelope()));
  });
});
