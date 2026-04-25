const test = require("node:test");
const assert = require("node:assert/strict");
const { NotionApprovalStore } = require("../src/main/services/notionApprovalStore");

test("approval store refuses writes without a prepared preview", () => {
  const store = new NotionApprovalStore();

  assert.throws(
    () => store.consume("missing", "create-page"),
    /Prepare it again before writing/
  );
});

test("approval store consumes a preview once", () => {
  const store = new NotionApprovalStore();
  const record = store.create("update-page", { pageRef: "page-1" });

  assert.deepEqual(store.consume(record.id, "update-page"), { pageRef: "page-1" });

  assert.throws(
    () => store.consume(record.id, "update-page"),
    /Prepare it again before writing/
  );
});
