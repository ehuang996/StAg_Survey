// Run with: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../app.js");

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "items.json"), "utf8"));
const annotators = Object.values(data.annotators);

test("an answer is complete once Yes or No is chosen", () => {
  const r = S.blankResponse();
  assert.equal(S.isComplete(r), false);
  r.answer = "no";
  assert.equal(S.isComplete(r), true);
  assert.ok(!("confidence" in S.blankResponse()));
  assert.ok(!("note" in S.blankResponse()));
});

function checkPart(part, perAnnotator, total) {
  const counts = {};
  for (const a of annotators) {
    const order = a[`part${part}`];
    assert.equal(order.length, perAnnotator);
    assert.equal(new Set(order).size, perAnnotator);
    for (const id of order) {
      assert.ok(data[`part${part}`].items[id], `missing ${id}`);
      counts[id] = (counts[id] || 0) + 1;
    }
  }
  assert.equal(Object.keys(counts).length, total);
  assert.ok(Object.values(counts).every((c) => c === 2), "every item has exactly two annotators");
  for (const g of [1, 2, 3]) {
    const pair = annotators.filter((a) => a.group === g);
    assert.equal(pair.length, 2);
    assert.deepEqual([...pair[0][`part${part}`]].sort(), [...pair[1][`part${part}`]].sort());
    assert.notDeepEqual(pair[0][`part${part}`], pair[1][`part${part}`], "pair members see different orders");
  }
}

function checkBalancedTopics(part, field, keys, perGroup) {
  for (const g of [1, 2, 3]) {
    const ids = annotators.find((a) => a.group === g)[`part${part}`];
    const per = {};
    for (const id of ids) per[data[`part${part}`].items[id][field]] = (per[data[`part${part}`].items[id][field]] || 0) + 1;
    assert.deepEqual(Object.keys(per).sort(), [...keys].sort());
    assert.ok(Object.values(per).every((c) => c === perGroup), `part ${part} group ${g}: each ${field} shown ${perGroup} times`);
  }
}

test("part 1: six annotators, three pairs, 20 items each", () => {
  assert.deepEqual(Object.keys(data.annotators).sort(), ["A1", "A2", "A3", "A4", "A5", "A6"]);
  checkPart(1, 20, 60);
});

test("part 2: 36 items each, every domain shown 4 times per group", () => {
  checkPart(2, 36, 108);
  assert.equal(data.codebook.domains.length, 9);
  checkBalancedTopics(2, "domain", data.codebook.domains.map((d) => d.key), 4);
});

test("part 3: 24 items each, every action shown 4 times per group", () => {
  checkPart(3, 24, 72);
  assert.deepEqual(data.codebook.actions.map((a) => a.key).sort(), ["advise", "compose", "explain", "inform", "revise", "search"]);
  checkBalancedTopics(3, "action", data.codebook.actions.map((a) => a.key), 4);
});

test("no conversation appears in more than one part", () => {
  const seen = new Set();
  for (const p of [1, 2, 3]) {
    for (const x of Object.values(data[`part${p}`].items)) {
      assert.ok(!seen.has(x.text), `part ${p} repeats a conversation`);
      seen.add(x.text);
    }
  }
});

test("public file has no practice items", () => {
  for (const p of [1, 2, 3]) assert.deepEqual(Object.keys(data[`part${p}`]), ["items"]);
});

test("public file carries no pipeline information", () => {
  for (const x of Object.values(data.part1.items)) assert.deepEqual(Object.keys(x), ["text"]);
  for (const x of Object.values(data.part2.items)) assert.deepEqual(Object.keys(x).sort(), ["domain", "text"]);
  for (const x of Object.values(data.part3.items)) assert.deepEqual(Object.keys(x).sort(), ["action", "text"]);
  const raw = JSON.stringify({ p1: data.part1, p2: data.part2, p3: data.part3, a: data.annotators });
  for (const leak of ["pipeline", "pipeline_says", "kept", "rejected", "stratum", "conversation_hash", "weight"]) {
    assert.ok(!raw.includes(`"${leak}"`), `public data contains key ${leak}`);
  }
});

test("export carries all three parts in each annotator's order", () => {
  const code = "A5";
  const a = data.annotators[code];
  const state = { code, started_at: "t0", finished_at: "t1", r1: {}, r2: {}, r3: {} };
  state.r1[a.part1[0]] = { ...S.blankResponse(), answer: "yes", time_on_item_sec: 9.6 };
  state.r2[a.part2[0]] = { ...S.blankResponse(), answer: "no" };
  state.r3[a.part3[0]] = { ...S.blankResponse(), answer: "yes" };
  const out = S.buildExport(state, data, "t2");
  assert.equal(out.group, a.group);
  for (const p of [1, 2, 3]) assert.deepEqual(out[`part${p}`].responses.map((r) => r.id), a[`part${p}`]);
  assert.equal(out.part1.responses[0].stag, "yes");
  assert.equal(out.part1.responses[0].time_on_item_sec, 10);
  assert.equal(out.part2.responses[0].in_domain, "no");
  assert.equal(out.part2.responses[0].domain, data.part2.items[a.part2[0]].domain);
  assert.equal(out.part3.responses[0].action_applies, "yes");
  assert.equal(out.part3.responses[0].action, data.part3.items[a.part3[0]].action);
  assert.ok(!JSON.stringify(out).includes("confidence"));
  assert.ok(!JSON.stringify(out).includes("note"));
  assert.deepEqual([out.part1.n_complete, out.part2.n_complete, out.part3.n_complete], [1, 1, 1]);
});
