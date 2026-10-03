import test from "node:test";
import assert from "node:assert/strict";
import { sortProjectsByCreationDate } from "./projectOrdering.js";

test("orders projects newest-first by their database creation timestamp", () => {
  const projects = [
    { id: "old", created_at: "2026-08-01T12:00:00Z", created_date: "2026-10-01T12:00:00Z" },
    { id: "new", created_at: "2026-09-01T12:00:00Z", created_date: "2026-08-01T12:00:00Z" },
  ];

  assert.deepEqual(sortProjectsByCreationDate(projects).map(({ id }) => id), ["new", "old"]);
});

test("uses a stable id order when creation dates are missing or equal", () => {
  const projects = [{ id: "b" }, { id: "a" }];

  assert.deepEqual(sortProjectsByCreationDate(projects).map(({ id }) => id), ["a", "b"]);
});
