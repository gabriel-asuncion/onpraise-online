import assert from "node:assert/strict";
import test from "node:test";
import { getStemSlot, groupStemSlots, STEM_SLOTS } from "../lib/stem-slots.ts";

test("preset stem slots retain the requested order and classify every existing role", () => {
  assert.deepEqual(STEM_SLOTS, ["drums", "bass", "keys", "other", "guitars", "vocals"]);
  for (const role of ["drums", "bass", "keys", "other", "guitars", "vocals"]) {
    assert.equal(getStemSlot(role), role);
  }
  assert.equal(getStemSlot("track"), "other");
  assert.equal(getStemSlot("guide"), "other");
});

test("slot grouping preserves conflicting files for explicit resolution", () => {
  const first = { role: "drums", fileName: "one.wav" };
  const second = { role: "drums", fileName: "two.wav" };
  const guide = { role: "guide", fileName: "guide.wav" };
  const groups = groupStemSlots([first, second, guide]);
  assert.deepEqual(groups.drums, [first, second]);
  assert.deepEqual(groups.other, [guide]);
  assert.deepEqual(groups.bass, []);
});
