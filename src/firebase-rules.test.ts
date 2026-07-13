import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { CLOUD_ENVELOPE_VERSION } from "./cloud-envelope";
import { OWNER_ANONYMOUS_UID } from "./firebase-owner";
import { emptyAppData } from "./storage";

const PROJECT_ID = "cfmarc-rules-test";
const RULES = readFileSync("database.rules.json", "utf8");
const OTHER_UID = "other-anonymous-uid-test";

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
    await assertFails(db.ref("personal/finance").get());
  });

  it("denies unauthenticated write", async () => {
    const db = env.unauthenticatedContext().database();
    await assertFails(db.ref("personal/finance").set(validEnvelope()));
  });

  it("denies unauthorized anonymous uid read", async () => {
    const db = env.authenticatedContext(OTHER_UID).database();
    await assertFails(db.ref("personal/finance").get());
  });

  it("denies unauthorized anonymous uid write", async () => {
    const db = env.authenticatedContext(OTHER_UID).database();
    await assertFails(db.ref("personal/finance").set(validEnvelope()));
  });

  it("allows owner uid to read", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    await assertSucceeds(db.ref("personal/finance").set(validEnvelope()));
    await assertSucceeds(db.ref("personal/finance").get());
  });

  it("allows owner uid to write", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    await assertSucceeds(db.ref("personal/finance").set(validEnvelope()));
  });

  it("rejects envelope without schemaVersion", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    const envelope = validEnvelope();
    delete (envelope as { schemaVersion?: string }).schemaVersion;
    await assertFails(db.ref("personal/finance").set(envelope));
  });

  it("rejects incorrect schemaVersion", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    await assertFails(
      db.ref("personal/finance").set({ ...validEnvelope(), schemaVersion: "invalid" }),
    );
  });

  it("rejects envelope without revision", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    const envelope = validEnvelope();
    delete (envelope as { revision?: number }).revision;
    await assertFails(db.ref("personal/finance").set(envelope));
  });

  it("rejects negative revision", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    await assertFails(db.ref("personal/finance").set({ ...validEnvelope(), revision: -1 }));
  });

  it("rejects envelope without updatedAt", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    const envelope = validEnvelope();
    delete (envelope as { updatedAt?: number }).updatedAt;
    await assertFails(db.ref("personal/finance").set(envelope));
  });

  it("rejects non-numeric updatedAt", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    await assertFails(
      db.ref("personal/finance").set({ ...validEnvelope(), updatedAt: "invalid" }),
    );
  });

  it("rejects envelope without writerId", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    const envelope = validEnvelope();
    delete (envelope as { writerId?: string }).writerId;
    await assertFails(db.ref("personal/finance").set(envelope));
  });

  it("rejects empty writerId", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    await assertFails(db.ref("personal/finance").set({ ...validEnvelope(), writerId: "" }));
  });

  it("rejects envelope without data", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    const envelope = validEnvelope();
    delete (envelope as { data?: unknown }).data;
    await assertFails(db.ref("personal/finance").set(envelope));
  });

  it("accepts valid envelope", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    await assertSucceeds(db.ref("personal/finance").set(validEnvelope()));
  });

  it("rejects write at database root", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    await assertFails(db.ref("/").set({ public: true }));
  });

  it("rejects write outside personal/finance", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    await assertFails(db.ref("other/path").set({ value: 1 }));
  });

  it("rejects deleting finance envelope", async () => {
    const db = env.authenticatedContext(OWNER_ANONYMOUS_UID).database();
    await assertSucceeds(db.ref("personal/finance").set(validEnvelope()));
    await assertFails(db.ref("personal/finance").remove());
  });
});
