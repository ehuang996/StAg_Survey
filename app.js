"use strict";

const VERSION = "stag_survey_v8";
const NUM_PARTS = 3;
const PARTS = {
  1: { field: "stag", question: "Does this message show structural agency?" },
  2: { field: "in_domain", question: "Does the user's real-world situation fall under this domain?", topic: "domain" },
  3: { field: "action_applies", question: "Does the user ask the AI to do this?", topic: "action" },
};

// ---------- pure logic (also exercised by tests/logic.test.js) ----------

function blankResponse() {
  return { answer: null, time_on_item_sec: 0, answered_at: null };
}

function isComplete(r) {
  return r.answer === "yes" || r.answer === "no";
}

function countComplete(order, responses) {
  return order.filter((id) => responses[id] && isComplete(responses[id])).length;
}

function buildExport(state, data, now) {
  const a = data.annotators[state.code];
  const out = {
    survey_version: VERSION,
    annotator: state.code,
    group: a.group,
    started_at: state.started_at,
    finished_at: state.finished_at,
    exported_at: now,
  };
  for (let p = 1; p <= NUM_PARTS; p++) {
    const order = a[`part${p}`];
    const responses = state[`r${p}`] || {};
    out[`part${p}`] = {
      n_items: order.length,
      n_complete: countComplete(order, responses),
      responses: order.map((id, i) => {
        const r = responses[id] || blankResponse();
        const row = { position: i + 1, id };
        const topic = PARTS[p].topic;
        if (topic) row[topic] = data[`part${p}`].items[id][topic];
        row[PARTS[p].field] = r.answer;
        return { ...row, time_on_item_sec: Math.round(r.time_on_item_sec), answered_at: r.answered_at };
      }),
    };
  }
  return out;
}

if (typeof module !== "undefined") {
  module.exports = { blankResponse, isComplete, countComplete, buildExport, VERSION, NUM_PARTS };
}

// ---------- browser app ----------

if (typeof document !== "undefined") {
  const main = document.getElementById("main");
  const codebookBtn = document.getElementById("open-codebook");
  const dialog = document.getElementById("codebook-dialog");
  const params = new URLSearchParams(location.search);
  const preview = params.get("preview");
  let DATA = null;
  let state = null;
  let enteredAt = 0;

  const store = {
    key: (code) => `${VERSION}:${code}`,
    load(code) {
      try { return JSON.parse(localStorage.getItem(this.key(code))); } catch { return null; }
    },
    save() {
      if (preview || !state) return;
      try {
        localStorage.setItem(this.key(state.code), JSON.stringify(state));
        localStorage.setItem(`${VERSION}:last`, state.code);
      } catch { /* storage unavailable: progress lasts only for this visit */ }
    },
    last() {
      try { return localStorage.getItem(`${VERSION}:last`); } catch { return null; }
    },
    clear(code) {
      try { localStorage.removeItem(this.key(code)); localStorage.removeItem(`${VERSION}:last`); } catch { /* ignore */ }
    },
  };

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function show(...nodes) {
    main.replaceChildren(...nodes.filter(Boolean));
    window.scrollTo(0, 0);
    const heading = main.querySelector("h1");
    if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
    codebookBtn.hidden = !state;
  }

  function go(screen, pos = 0) {
    state.screen = screen;
    state.pos = pos;
    store.save();
    render();
  }

  function newState(code) {
    const s = { code, started_at: new Date().toISOString(), finished_at: null, screen: "codebook1", pos: 0 };
    for (let p = 1; p <= NUM_PARTS; p++) s[`r${p}`] = {};
    return s;
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const actionsRow = (...btns) => h("div", { class: "actions-row" }, ...btns);
  const btn = (label, onclick, cls = "btn") => h("button", { class: cls, type: "button", onclick }, label);
  const badge = (text) => h("p", {}, h("span", { class: "badge" }, text));
  const partLength = (p) => DATA.annotators[state.code][`part${p}`].length;

  function topicInfo(part, key) {
    if (part === 2) {
      const d = DATA.codebook.domains.find((x) => x.key === key);
      return { kicker: "Domain", title: d.title, text: d.scope };
    }
    const a = DATA.codebook.actions.find((x) => x.key === key);
    return { kicker: "Action", title: cap(a.key), text: cap(a.definition) };
  }

  // ----- codebook -----

  function stagDefinition() {
    const sa = DATA.codebook.structural_agency;
    return h("div", { class: "codebook" },
      h("p", { class: "def" }, sa.definition),
      h("p", {}, h("strong", {}, "A message shows structural agency when the user is doing at least one of these:")),
      h("ol", {}, sa.purposes.map((p) => h("li", {}, p))));
  }

  function topicDefinitions(part) {
    const keys = part === 2 ? DATA.codebook.domains.map((d) => d.key) : DATA.codebook.actions.map((a) => a.key);
    return h("div", { class: "codebook" }, keys.map((k) => {
      const t = topicInfo(part, k);
      return h("div", { class: "entry" }, h("h3", {}, t.title), h("p", {}, t.text));
    }));
  }

  function readingNotes() {
    return h("ul", {},
      h("li", {}, "You see only what the user wrote, not the AI's reply."),
      h("li", {}, "Some messages contain several turns starting with “User:”, or text starting with “System:”. Read all of it and judge what the person is trying to accomplish."),
      h("li", {}, "Judge each message on its own. There are no trick questions, and there is no target number of “Yes” answers."));
  }

  function fullCodebook() {
    return h("div", {},
      h("h2", {}, "Part 1: What is structural agency?"), stagDefinition(),
      h("h2", {}, "Part 2: The nine domains"), topicDefinitions(2),
      h("h2", {}, "Part 3: The six actions"), topicDefinitions(3),
      h("h2", {}, "Reading the messages"), readingNotes());
  }

  // ----- screens -----

  function progressSummary(s) {
    const a = DATA.annotators[s.code];
    return [1, 2, 3].map((p) => `${countComplete(a[`part${p}`], s[`r${p}`] || {})} of ${a[`part${p}`].length} in Part ${p}`).join(", ");
  }

  function renderWelcome() {
    const last = store.last();
    const saved = last && store.load(last);
    const err = h("p", { class: "error", role: "alert" });
    const input = h("input", { type: "text", id: "code", name: "code", autocomplete: "off", spellcheck: "false", maxlength: "4", placeholder: "e.g. A1" });

    function start(ev) {
      ev.preventDefault();
      const code = input.value.trim().toUpperCase();
      if (!DATA.annotators[code]) {
        err.textContent = "That code isn't recognized. Codes look like A1, A2, … A6. Please check the code you were given.";
        input.focus();
        return;
      }
      state = store.load(code) || newState(code);
      store.save();
      render();
    }

    const savedOk = saved && saved.code && DATA.annotators[saved.code];
    const n = (p) => Object.values(DATA.annotators)[0][`part${p}`].length;
    show(
      h("h1", {}, "Thank you for helping with this study"),
      h("p", {}, "You will read messages that people sent to an AI chatbot and answer one Yes/No question about each. The study has three parts:"),
      h("ol", {},
        h("li", {}, h("strong", {}, `Part 1: ${n(1)} messages.`), " Does the message show structural agency?"),
        h("li", {}, h("strong", {}, `Part 2: ${n(2)} messages.`), " Does the message fall under a given domain?"),
        h("li", {}, h("strong", {}, `Part 3: ${n(3)} messages.`), " Does the user ask the AI to do a given action?")),
      h("p", {}, "It takes about ", h("strong", {}, "45 minutes"), ". Your answers are saved in this browser as you go, so you can take breaks and come back on the same device."),
      h("div", { class: "card" },
        h("h2", { style: "margin-top:0" }, "Before you start"),
        h("ul", {},
          h("li", {}, "Taking part is voluntary. You can stop at any time."),
          h("li", {}, "We do not collect your name, email, or any other personal information. We record only your answers and how long you spend on each message."),
          h("li", {}, "Your answers stay on your device until you download them at the end and send the file to the study coordinator."),
          h("li", {}, "The messages come from WildChat, a public dataset of chatbot conversations that users agreed to share. Some mention health, money, work, family, or legal problems."),
          h("li", {}, "Please work on your own. Don't discuss the messages with anyone, including your partner annotator, and don't look them up online, until you have both sent your answers."))),
      savedOk
        ? h("div", { class: "notice" },
            h("p", { style: "margin-top:0" }, `Welcome back, ${saved.code}. You have finished ${progressSummary(saved)}.`),
            h("div", { class: "actions-row", style: "margin-top:0.5rem" },
              btn("Continue where I left off", () => { state = saved; render(); }),
              btn("Erase and start over", () => {
                if (confirm(`Erase all saved answers for ${saved.code} and start over? This cannot be undone.`)) { store.clear(saved.code); state = null; render(); }
              }, "btn btn-danger")))
        : null,
      h("form", { class: "field", onsubmit: start },
        h("label", { for: "code" }, "Your annotator code"),
        h("p", { class: "hint" }, "The study coordinator gave you a code from A1 to A6."),
        input, err,
        actionsRow(h("span", { class: "spacer" }), h("button", { class: "btn", type: "submit" }, "Start →"))),
    );
  }

  function renderCodebook1() {
    show(
      badge(`PART 1 OF ${NUM_PARTS}`),
      h("h1", {}, "Part 1: Is it structural agency?"),
      h("p", {}, "For each message, you will decide whether it shows structural agency. Here is the definition. You can reopen it at any time with the ", h("strong", {}, "Codebook"), " button at the top of the page."),
      stagDefinition(),
      h("h2", {}, "Reading the messages"), readingNotes(),
      actionsRow(h("span", { class: "spacer" }), btn("I've read it. Start Part 1 →", () => go("part1", 0))),
    );
  }

  function renderIntro(part) {
    const isDomain = part === 2;
    const n = DATA.annotators[state.code][`part${part}`].length;
    show(
      badge(`PART ${part} OF ${NUM_PARTS}`),
      h("h1", {}, `Part ${part - 1} done. Now Part ${part}`),
      h("p", {}, `In Part ${part}, `, h("strong", {}, "every message shows structural agency."), " Each message comes with ",
        h("strong", {}, isDomain ? "one domain" : "one action"), ". ",
        isDomain ? "Decide whether the user's real-world situation falls under that domain." : "Decide whether the user asks the AI to do that action."),
      h("ul", {},
        h("li", {}, isDomain
          ? "Judge only the domain shown with the message. A message may also fit other domains; that doesn't change your answer."
          : "Judge only the action shown with the message. A message may ask for more than one action; that doesn't change your answer."),
        h("li", {}, `The full definition of the ${isDomain ? "domain" : "action"} is shown next to each message.`),
        h("li", {}, `There are ${n} messages.`)),
      h("h2", {}, isDomain ? "The nine domains" : "The six actions"),
      topicDefinitions(part),
      actionsRow(btn(`← Back to Part ${part - 1}`, () => go(`part${part - 1}`, partLength(part - 1) - 1), "btn btn-secondary"),
        btn(`Start Part ${part} →`, () => go(`part${part}`, 0))),
    );
  }

  function renderItem(part) {
    const ids = DATA.annotators[state.code][`part${part}`];
    const id = ids[state.pos];
    const item = DATA[`part${part}`].items[id];
    const bucket = state[`r${part}`];
    const r = bucket[id] || (bucket[id] = blankResponse());
    enteredAt = performance.now();

    const last = state.pos + 1 === ids.length;
    const finishing = last && part === NUM_PARTS;
    const nextBtn = h("button", { class: "btn", type: "button" }, finishing ? "Finish →" : "Next →");
    const missingMsg = h("p", { class: "muted", "aria-live": "polite" });

    function changed() {
      nextBtn.disabled = !isComplete(r);
      missingMsg.textContent = isComplete(r) ? "" : "To continue, please answer Yes or No.";
      store.save();
    }

    function radio(value, label) {
      return h("label", { class: "choice choice-big" },
        h("input", { type: "radio", name: `ans-${id}`, value, checked: r.answer === value, onchange: () => { r.answer = value; changed(); } }),
        h("span", { class: "choice-title" }, label));
    }

    function leave(target) {
      r.time_on_item_sec += (performance.now() - enteredAt) / 1000;
      target();
    }

    nextBtn.addEventListener("click", () => leave(() => {
      if (!isComplete(r)) return;
      r.answered_at = r.answered_at || new Date().toISOString();
      if (!last) return go(`part${part}`, state.pos + 1);
      if (part < NUM_PARTS) return go(`intro${part + 1}`);
      state.finished_at = state.finished_at || new Date().toISOString();
      return go("finish");
    }));
    const backBtn = btn("← Back", () => leave(() => {
      if (state.pos > 0) return go(`part${part}`, state.pos - 1);
      return go(part === 1 ? "codebook1" : `intro${part}`);
    }), "btn btn-secondary");

    const topic = PARTS[part].topic ? topicInfo(part, item[PARTS[part].topic]) : null;
    const done = countComplete(ids, bucket);
    show(
      badge(`PART ${part} OF ${NUM_PARTS}`),
      h("div", { class: "progress" },
        h("div", { class: "progress-label" }, `Message ${state.pos + 1} of ${ids.length}`),
        h("div", { class: "progress-track", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(ids.length), "aria-valuenow": String(done) },
          h("div", { class: "progress-fill", style: `width:${(100 * done) / ids.length}%` }))),
      h("h1", { style: "font-size:1.5rem;margin-top:0.5rem" }, "What the user wrote to the AI"),
      h("div", { class: "message", tabindex: "0", "aria-label": "Message text" }, item.text),
      topic
        ? h("div", { class: "domain-card" },
            h("p", { class: "domain-kicker" }, topic.kicker),
            h("h2", {}, topic.title),
            h("p", {}, topic.text))
        : null,
      h("fieldset", {},
        h("legend", {}, PARTS[part].question),
        part === 1
          ? h("p", { class: "hint" }, "Structural agency is the user's “ability to navigate and shape complex systems and institutions.” Open the Codebook for the full definition.")
          : h("p", { class: "hint" }, `This message shows structural agency. Judge only the ${topic.kicker.toLowerCase()} above; the message may also fit others.`),
        h("div", { class: "choices two" }, radio("yes", "Yes"), radio("no", "No"))),
      actionsRow(backBtn, nextBtn),
      missingMsg,
    );
    changed();
  }

  function renderFinish() {
    const a = DATA.annotators[state.code];
    const counts = [1, 2, 3].map((p) => [countComplete(a[`part${p}`], state[`r${p}`]), a[`part${p}`].length]);
    const allDone = counts.every(([n, total]) => n === total);
    const fileName = `StAg_survey_${state.code}_${new Date().toISOString().slice(0, 10)}.json`;
    const status = h("p", { class: "muted", "aria-live": "polite" });
    const exportData = () => buildExport(state, DATA, new Date().toISOString());

    function download() {
      const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = h("a", { href: url, download: fileName });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = `Saved “${fileName}”. Check your Downloads folder.`;
    }

    async function copy() {
      try {
        await navigator.clipboard.writeText(JSON.stringify(exportData()));
        status.textContent = "Copied. Paste it into an email to the study coordinator.";
      } catch {
        status.textContent = "Copying isn't allowed in this browser. Please use the download button instead.";
      }
    }

    show(
      h("h1", {}, allDone ? "All done. Thank you!" : "Almost done"),
      allDone
        ? h("p", {}, "You answered every message in all three parts.")
        : h("p", { class: "notice" }, `You have answered ${counts.map(([n, t], i) => `${n} of ${t} in Part ${i + 1}`).join(", ")}. Use “Back to my answers” to finish the rest.`),
      h("div", { class: "card" },
        h("h2", { style: "margin-top:0" }, "Last step: send us your answers"),
        h("ol", {},
          h("li", {}, "Press ", h("strong", {}, "Download my answers"), ". This saves a small file to your device."),
          h("li", {}, "Email that file to the study coordinator."))),
      actionsRow(
        btn("← Back to my answers", () => go(`part${NUM_PARTS}`, partLength(NUM_PARTS) - 1), "btn btn-secondary"),
        btn("Download my answers", download)),
      h("p", {}, btn("Or copy my answers as text", copy, "btn btn-quiet")),
      status,
    );
  }

  function render() {
    if (!state) return renderWelcome();
    const s = state.screen;
    let m;
    if (s === "codebook1") return renderCodebook1();
    if (s === "finish") return renderFinish();
    if ((m = /^intro([23])$/.exec(s))) return renderIntro(Number(m[1]));
    if ((m = /^part([123])$/.exec(s))) return renderItem(Number(m[1]));
    return renderCodebook1();
  }

  codebookBtn.addEventListener("click", () => {
    document.getElementById("codebook-dialog-body").replaceChildren(fullCodebook());
    dialog.showModal();
  });
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());

  // ?preview=<screen>&code=A1&pos=0&fill=1 renders a screen without saving (used for screenshots).
  function startPreview() {
    if (preview === "welcome") { state = null; return render(); }
    const code = (params.get("code") || "A1").toUpperCase();
    state = newState(code);
    state.screen = preview;
    state.pos = Number(params.get("pos") || 0);
    const m = /^part([123])$/.exec(preview);
    if (m && params.get("fill")) {
      state[`r${m[1]}`][DATA.annotators[code][preview][state.pos]] = { ...blankResponse(), answer: "yes" };
    }
    if (preview === "finish") {
      for (let p = 1; p <= NUM_PARTS; p++) for (const id of DATA.annotators[code][`part${p}`]) state[`r${p}`][id] = { ...blankResponse(), answer: "no" };
    }
    return render();
  }

  fetch("data/items.json", { cache: "no-cache" })
    .then((res) => { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then((data) => {
      DATA = data;
      return preview ? startPreview() : render();
    })
    .catch(() => {
      main.replaceChildren(h("p", { class: "notice" }, "The survey couldn't load. Please check your internet connection and reload the page."));
    });
}
