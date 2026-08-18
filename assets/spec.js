/* ==========================================================================
   Honest Mockument — render engine
   The JSON island in each page is the single source of truth. Everything a
   reader sees below the mock is rendered from it, so the human view and the
   machine view cannot drift apart.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- tiny helpers ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const val = (s) => (s === undefined || s === null || s === "" ? '<span class="tbd">TBD</span>' : esc(s));
  const MARK_CLASS = { "required": "required", "proposed": "proposed", "unanswered": "unanswered", "observed": "observed", "out of scope": "scope" };
  const marker = (m) => m ? `<span class="marker marker--${MARK_CLASS[m] || "scope"}">${esc(m)}</span>` : `<span class="marker marker--unanswered">no marker</span>`;
  const link = (href, text) => href ? `<a href="${esc(href)}">${esc(text)}</a>` : esc(text);

  /* ---------- theme: system → dark → light ---------- */
  function theme() {
    const CYCLE = ["system", "dark", "light"], html = document.documentElement;
    const btn = $("#themeToggle");
    const sys = () => window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    function apply(mode) {
      const eff = mode === "system" ? sys() : mode;
      html.classList.toggle("light", eff === "light");
      html.setAttribute("data-theme-mode", mode);
      if (!btn) return;
      $$("svg", btn).forEach(s => s.classList.remove("icon-active"));
      const icon = $("." + { system: "icon-system", dark: "icon-moon", light: "icon-sun" }[mode], btn);
      if (icon) icon.classList.add("icon-active");
      btn.title = { system: "Theme: system", dark: "Theme: dark", light: "Theme: light" }[mode];
    }
    let stored = localStorage.getItem("spec-theme") || "system";
    if (CYCLE.indexOf(stored) === -1) stored = "system";
    apply(stored);
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
      if ((localStorage.getItem("spec-theme") || "system") === "system") apply("system");
    });
    if (btn) btn.addEventListener("click", () => {
      const cur = localStorage.getItem("spec-theme") || "system";
      const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
      next === "system" ? localStorage.removeItem("spec-theme") : localStorage.setItem("spec-theme", next);
      apply(next);
    });
  }

  /* ---------- chrome: topbar + sidebar ---------- */
  function chrome(current) {
    const app = window.SPEC_APP || {};
    const bar = $("#topbar");
    if (bar) {
      bar.innerHTML = `
        <a class="topbar-mark" href="index.html">
          <span class="topbar-dot"></span>
          <span><span class="topbar-app">${esc(app.name || "App")}</span>
          <span class="topbar-kind"> &nbsp;honest mockument</span></span>
        </a>
        <div class="crumbs" id="crumbs"></div>
        <div class="topbar-spacer"></div>
        <a class="btn" href="questions.html">Open questions <span id="tb-q-count"></span></a>
        <a class="btn" href="app-map.html">App map</a>
        <button class="theme-toggle" id="themeToggle" aria-label="Theme">
          <svg class="icon-system" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/></svg>
          <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/></svg>
        </button>`;
    }
    const side = $("#sidebar");
    if (side) {
      const item = (m) => `<a class="side-link${m.href === current ? " is-active" : ""}${m.built === false ? " is-unbuilt" : ""}" href="${esc(m.href)}">
          <span>${esc(m.name)}</span>${m.built === false ? '<span class="marker marker--scope">not drawn</span>' : ""}</a>`;
      side.innerHTML = `
        <div class="side-group">
          <div class="side-heading">Pages of the app</div>
          ${(app.menu || []).map(item).join("")}
          <div class="side-note">The proposed menu. Destinations nobody has drawn yet stay listed and marked, so the gap is visible.</div>
        </div>
        <div class="side-group">
          <div class="side-heading">Workflows</div>
          ${(app.workflows || []).map(item).join("")}
        </div>
        <div class="side-group">
          <div class="side-heading">Registers</div>
          ${(app.reference || []).map(r => item(Object.assign({ built: true }, r))).join("")}
        </div>
        <div class="side-group side-group--docs">
          <div class="side-heading">Method</div>
          ${(app.docs || []).map(d => `<a class="side-link${d.href === current ? " is-active" : ""}" href="${esc(d.href)}">
              <span>${esc(d.name)}</span></a>`).join("")}
          <div class="side-note">How a mockument is built, and what every block on a page is for.</div>
        </div>`;
    }
    theme();
  }

  /* ---------- the data ladder ----------
     L0 exists   · means, holds, as-of, who would supply it — answered with the mock
     L1 display  · unit/format and the null + stale rules — after business review
     L2 sourced  · provider, field, calculation, dependencies — before build
     L3 verified · lineage evidence and a tolerance — at QA
     Hero fields (the ones that ARE the product) must reach L2 with the mock.        */
  const PERIODICITY = [
    "live", "end of previous business day", "end of previous month",
    "latest closed period", "on demand", "reference / on change"
  ];
  function rung(d) {
    if (!d) return -1;
    const l0 = d.means && d.holds && d.periodicity && d.provenance;
    const l1 = l0 && (d.unit || d.format) && d.nullRule;
    const l2 = l1 && d.source && (d.calculated === false || d.calculation);
    const l3 = l2 && d.evidence && d.tolerance;
    return l3 ? 3 : l2 ? 2 : l1 ? 1 : l0 ? 0 : -1;
  }
  const rungChip = (n) => n < 0
    ? `<span class="marker marker--unanswered">not started</span>`
    : `<span class="marker marker--${n >= 2 ? "required" : "proposed"}">L${n} ${["exists", "display", "sourced", "verified"][n]}</span>`;

  /* ---------- gates ---------- */
  function gates(spec) {
    const els = (spec.elements || []).concat(spec.controls || []);
    const qs = spec.questions || [];
    const g1 = [], g2 = [], g3 = [];

    if (!(spec.represents && spec.represents.step)) g1.push("the page does not name the step it represents");
    const unmarked = els.filter(e => !e.marker);
    if (unmarked.length) g1.push(`${unmarked.length} element(s) carry no marker`);
    const ownerless = qs.filter(q => !q.whoMustAnswer);
    if (ownerless.length) g1.push(`${ownerless.length} open question(s) name nobody`);

    if (!(spec.availableTo || []).length) g2.push("nobody has said who may reach this page");
    const stateKeys = (spec.states || []).map(s => s.key);
    ["empty", "error", "restricted"].forEach(k => { if (stateKeys.indexOf(k) === -1) g2.push(`the ${k} state is not described`); });
    if (!(spec.failures || []).length) g2.push("nothing is recorded about what can go wrong");
    (spec.data || []).forEach(d => {
      if (rung(d) < 0) g2.push(`field "${d.field || "unnamed"}" is below L0 — nobody has said what it means, when it is as of, or who supplies it`);
      if (d.hero && rung(d) < 2) g2.push(`hero field "${d.field}" must reach L2 with the mock — it is the product, not a detail`);
    });

    const openBuild = qs.filter(q => q.blocksBuild);
    if (openBuild.length) g3.push(`${openBuild.length} question(s) block the build`);
    const unanswered = els.filter(e => e.marker === "unanswered");
    if (unanswered.length) g3.push(`${unanswered.length} element(s) are still unanswered`);
    const untraced = (spec.elements || []).filter(e => !e.trace);
    if (untraced.length) g3.push(`${untraced.length} element(s) trace to no requirement`);
    if (!(spec.remembered && spec.remembered.marker === "required")) g3.push("what the app remembers between visits is not settled");
    if (!(spec.liveChange && spec.liveChange.marker === "required")) g3.push("what changes while it is looked at is not settled");
    (spec.data || []).filter(d => rung(d) < 2).forEach(d => g3.push(`field "${d.field || "unnamed"}" is only at L${Math.max(rung(d), 0)} — no source or calculation yet`));

    return [
      { name: "Ready to walk through", why: g1 },
      { name: "Ready for business review", why: g1.concat(g2) },
      { name: "Ready to inform implementation", why: g1.concat(g2, g3) }
    ].map(g => Object.assign(g, { pass: g.why.length === 0 }));
  }

  function coverage(spec) {
    const els = (spec.elements || []).concat(spec.controls || []);
    const c = { required: 0, proposed: 0, unanswered: 0, observed: 0, "out of scope": 0 };
    els.forEach(e => { c[e.marker] = (c[e.marker] || 0) + (e.marker in c ? 1 : 0); if (!e.marker) c.unanswered++; });
    const total = els.length || 1;
    return { counts: c, total: els.length, pct: Math.round(100 * c.required / total) };
  }

  function coverageBar(spec) {
    const { counts, total, pct } = coverage(spec);
    const seg = (k, cls) => counts[k] ? `<span class="b-${cls}" style="width:${(100 * counts[k] / (total || 1))}%"></span>` : "";
    return `<div class="bar">${seg("required", "required")}${seg("proposed", "proposed")}${seg("unanswered", "unanswered")}${seg("observed", "observed")}${seg("out of scope", "scope")}</div>
      <div class="bar-key"><span>${pct}% required</span><span>${counts.proposed || 0} proposed</span><span>${counts.unanswered || 0} unanswered</span><span>${total} elements</span></div>`;
  }

  /* ---------- block helpers ---------- */
  let blockNo = 6;
  function block(title, forWhom, body, note, id) {
    blockNo++;
    return `<section class="block" id="${id || ""}">
      <div class="block-head"><span class="block-num">${String(blockNo).padStart(2, "0")}</span>
        <span class="block-title">${esc(title)}</span>
        ${forWhom ? `<span class="block-for">answered by ${esc(forWhom)}</span>` : ""}</div>
      ${note ? `<p class="block-note">${note}</p>` : ""}
      ${body}</section>`;
  }
  function table(cols, rows) {
    if (!rows || !rows.length) return `<p class="empty-hint">Nothing recorded yet — an empty block is a question nobody asked.</p>`;
    return `<div class="table-wrap"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  /* ---------- the page ---------- */
  function renderPage(spec) {
    const app = window.SPEC_APP || {};
    const g = gates(spec);
    const p = spec.page || {};
    const r = spec.represents || {};

    /* header (blocks 1–4) */
    const head = $("#page-head");
    if (head) head.innerHTML = `
      <div class="page-eyebrow">${esc(app.name || "")} · mockument page</div>
      <h1 class="page-title">${esc(p.name || "Untitled page")}
        <span class="marker marker--${esc(p.buildStatus || "existing")}">${esc(p.buildStatus || "existing")}</span></h1>
      <div class="page-route">${esc(p.route || "/")}</div>
      <p class="page-lede">${esc(spec.purpose || "")}</p>
      <div class="meta-strip">
        <span class="meta-chip">Represents <b>${esc(r.process || "?")}</b> → <b>${esc(r.step || "?")}</b>${r.stepId ? ` <span class="page-route">${esc(r.stepId)}</span>` : ""}</span>
        <span class="meta-chip">Device types <b>${(r.deviceTypes || []).map(d => esc(d.name || d)).join(", ") || "?"}</b></span>
        <span class="meta-chip">Available to <b>${(spec.availableTo || []).map(a => esc(a.role)).join(", ") || "?"}</b></span>
        <span class="meta-chip">v${esc(p.version || "0.1")} · ${esc(p.updated || "")}</span>
        <span class="meta-chip">Kept by <b>${esc(p.owner || "unassigned")}</b></span>
      </div>
      <div class="gates">${g.map(x => `
        <div class="gate gate--${x.pass ? "pass" : "fail"}">
          <div class="gate-name">${esc(x.name)}</div>
          <div class="gate-state">${x.pass ? "Yes" : "Not yet"}</div>
          ${x.why.length ? `<ul class="gate-why">${x.why.slice(0, 3).map(w => `<li>${esc(w)}</li>`).join("")}${x.why.length > 3 ? `<li>+${x.why.length - 3} more</li>` : ""}</ul>` : `<div class="gate-why">All checks pass.</div>`}
        </div>`).join("")}</div>
      <div style="margin:14px 0 4px">${coverageBar(spec)}</div>`;

    /* body (blocks 7–22) */
    const out = [];

    out.push(block("Elements", "business user + data", table(
      ["ID", "Element", "What it shows or accepts", "Comes from", "Marker", "Traces to"],
      (spec.elements || []).map(e => [
        `<span class="id-cell">${esc(e.id)}</span>`, esc(e.name) + (e.note ? `<span class="sub">${esc(e.note)}</span>` : ""),
        val(e.shows), val(e.source), marker(e.marker), e.trace ? `<span class="id-cell">${esc(e.trace)}</span>` : '<span class="tbd">none</span>'
      ])), "Everything a person can see or type. If it is on the screen and not in this table, it should not be on the screen.", "elements"));

    out.push(block("Controls and actions", "business user", table(
      ["ID", "Control", "Business effect", "Needs data only the server knows", "Where it leads", "Confirm / undo", "Marker"],
      (spec.controls || []).map(c => [
        `<span class="id-cell">${esc(c.id)}</span>`, esc(c.name), val(c.effect),
        c.serverData === true ? "Yes" : c.serverData === false ? "No" : '<span class="tbd">TBD</span>',
        c.leadsTo ? link(c.href, c.leadsTo) : "—", val(c.confirm), marker(c.marker)
      ])), "Effect is one of <em>acts on data</em>, <em>alters the screen</em>, or <em>both</em> — the wording from the requirements model, kept on purpose.", "controls"));

    const ladderCount = [0, 0, 0, 0, 0];
    (spec.data || []).forEach(d => ladderCount[rung(d) + 1]++);
    out.push(block("Data and fields", "business user for meaning and timing, data team for source", table(
      ["Field", "What it means", "Holds", "Unit / format", "As of", "Visible when", "Comes from", "Sample", "Rung"],
      (spec.data || []).map(d => [
        `${esc(d.field)}${d.metricId ? `<span class="sub id-cell">${esc(d.metricId)}</span>` : ""}${d.hero ? `<span class="sub"><span class="marker marker--observed">hero metric</span></span>` : ""}`,
        val(d.means), val(d.holds), val(d.unit || d.format),
        val(d.periodicity) + (PERIODICITY.indexOf(d.periodicity) === -1 && d.periodicity ? `<span class="sub">off-vocabulary</span>` : ""),
        val(d.visibleWhen),
        `${val(d.provenance)}${d.source ? `<span class="sub">${esc(d.source)}</span>` : ""}${d.calculation ? `<span class="sub">= ${esc(d.calculation)}</span>` : ""}${(d.derivedFrom || []).length ? `<span class="sub">from ${esc((d.derivedFrom || []).join(", "))}</span>` : ""}`,
        d.sample ? `<code>${esc(d.sample)}</code>` : "—",
        rungChip(rung(d))
      ])),
      `Four rungs, climbed per page rather than all at once: <b>L0 exists</b> (meaning, shape, as-of, who supplies it) is
       answered here with the mock; <b>L1 display</b> after business review; <b>L2 sourced</b> before this page is built;
       <b>L3 verified</b> at QA. Hero metrics — the numbers that <em>are</em> the product — go to L2 immediately.
       This page: ${ladderCount[0]} below L0 · ${ladderCount[1]} at L0 · ${ladderCount[2]} at L1 · ${ladderCount[3]} at L2 · ${ladderCount[4]} at L3.
       Sample values are drawn in the mock and are examples, never requirements.`, "data"));

    const listRows = [];
    (spec.lists || []).forEach(l => {
      listRows.push([`<b>${esc(l.name)}</b>`, val(l.ordering), val(l.filtering), val(l.selection), val(l.nesting)]);
    });
    let listsHtml = table(["List", "Order", "Filter / group", "Selecting an item", "Nesting"], listRows);
    const devRows = [];
    (spec.lists || []).forEach(l => (l.device || []).forEach(d => devRows.push([esc(l.name), esc(d.device), val(d.empty), val(d.one), val(d.overflow)])));
    listsHtml += `<div style="height:12px"></div>` + table(["List", "Device", "When it holds nothing", "When it holds one", "When it holds more than fits"], devRows);
    out.push(block("Lists", "business user", listsHtml,
      "Split on purpose: order and filtering are business meaning and sit with the step; what happens at zero, one and overflow is a device question.", "lists"));

    out.push(block("States", "business user", table(
      ["State", "When it happens", "What the person sees", "What they can do next"],
      (spec.states || []).map(s => [esc(s.label || s.key), val(s.when), val(s.sees), val(s.next)])),
      "Every state listed here can be selected in the mock above.", "states"));

    out.push(block("What can go wrong", "business user — causes belong to the implementer", table(
      ["What the person notices", "What should happen", "Who is told"],
      (spec.failures || []).map(f => [esc(f.noticed), val(f.thenWhat), val(f.whoIsTold)])),
      "Described as the person would notice it — “the alert never reached the supervisor”, not “the queue backed up”.", "failures"));

    const rem = spec.remembered || {}, live = spec.liveChange || {};
    out.push(block("Remembered between visits, and what changes while you look", "business user", `
      <div class="grid-2">
        <div class="card"><div class="card-label">Remembered between visits ${marker(rem.marker)}</div>
          <div class="card-body">${val(rem.answer)}
          ${rem.duration ? `<br><br><strong>For how long:</strong> ${esc(rem.duration)}` : ""}
          ${rem.clearable ? `<br><strong>Can it be cleared:</strong> ${esc(rem.clearable)}` : ""}
          ${rem.whoMustAnswer ? `<br><br><strong>Owed by:</strong> ${esc(rem.whoMustAnswer)}` : ""}</div></div>
        <div class="card"><div class="card-label">Changes while being looked at ${marker(live.marker)}</div>
          <div class="card-body">${val(live.answer)}
          ${live.howTold ? `<br><br><strong>How the person is told:</strong> ${esc(live.howTold)}` : ""}
          ${live.midAction ? `<br><strong>If they are mid-action:</strong> ${esc(live.midAction)}` : ""}
          ${live.whoMustAnswer ? `<br><br><strong>Owed by:</strong> ${esc(live.whoMustAnswer)}` : ""}</div></div>
      </div>`, "Neither of these is ever volunteered. Ask both directly, every page.", "memory"));

    out.push(block("Who may see it", "business user", table(
      ["Role", "May reach it", "What differs", "What they must not see"],
      (spec.availableTo || []).map(a => [esc(a.role), a.mayReach === false ? "No" : "Yes", val(a.differs), val(a.mustNotSee)])),
      "Switch role in the mock above to see the difference rather than read it.", "roles"));

    const c = spec.connections || {};
    out.push(block("Connections", "whoever maintains the page", `
      <div class="grid-3">
        <div class="card"><div class="card-label">Comes from</div><div class="card-body">${(c.from || []).map(x => link(x.href, x.label)).join("<br>") || "—"}</div></div>
        <div class="card"><div class="card-label">Goes to</div><div class="card-body">${(c.to || []).map(x => link(x.href, x.label)).join("<br>") || "—"}</div></div>
        <div class="card"><div class="card-label">Shares components</div><div class="card-body">${(c.components || []).map(x => `<span class="id-cell">${esc(x.id)}</span> ${esc(x.label)}`).join("<br>") || "—"}</div></div>
      </div>
      ${(spec.workflows || []).length ? `<div style="height:12px"></div><div class="card"><div class="card-label">Workflows this page takes part in</div><div class="card-body">${spec.workflows.map(w => `${link(w.href, w.name)} — ${esc(w.position || "")}`).join("<br>")}</div></div>` : ""}`,
      "Both directions, so a reader can walk out of this page the way a user would.", "connections"));

    out.push(block("Copy register", "business user", table(
      ["Where", "Exact string", "Status", "Note"],
      (spec.copy || []).map(x => [esc(x.key), `<code>${esc(x.string)}</code>`,
        x.status === "required wording" ? `<span class="marker marker--required">required wording</span>` : `<span class="marker marker--proposed">placeholder</span>`,
        val(x.note)])),
      "Wording is where an unattended builder invents most freely. A placeholder marked as one is safe; an unmarked one becomes product.", "copy"));

    out.push(block("Decisions", "named person, on a date", table(
      ["What was decided", "By whom", "When"],
      (spec.decisions || []).map(d => [esc(d.what), val(d.who), val(d.when)])),
      "A decision with no name on it is a rumour.", "decisions"));

    out.push(block("Observations", "anyone walking through", table(
      ["What walking through revealed", "Raised by", "When"],
      (spec.observations || []).map(o => [esc(o.what), val(o.raisedBy), val(o.when)])),
      "Not decisions, and deliberately not requirements. They are what the mock taught us.", "observations"));

    out.push(block("Open questions", "the named owner", table(
      ["ID", "Question", "Why it matters", "Blocks", "Who must answer", "Needed by"],
      (spec.questions || []).map(q => [
        `<span class="id-cell">${esc(q.id)}</span>`, esc(q.question), val(q.whyItMatters),
        q.blocksBuild ? `<span class="marker marker--unanswered">the build</span>` : `<span class="marker marker--proposed">${esc(q.blocks || "review")}</span>`,
        val(q.whoMustAnswer), val(q.neededBy)])),
      "Every question names a person. A question with no owner is a question nobody answers.", "questions"));

    out.push(block("Out of scope, and what this does not settle", "everyone", `
      ${table(["Not answered here", "Why"], (spec.outOfScope || []).map(o => [esc(o.what), val(o.why)]))}
      <div style="height:12px"></div>
      <div class="callout callout--warn"><div class="callout-title">What this mock does not prove</div>
      <div class="callout-body">That an integration works, that the rules are complete, that permissions are enforced, that calculations are right,
      that anything persists, or that it performs. It uses example data and predetermined outcomes. A convincing screen is not an agreement.</div></div>`,
      "", "scope"));

    const k = spec.contract || {};
    out.push(block("Build contract", "the implementing agent or developer", `
      <pre class="contract">You are building: ${esc((spec.page || {}).name)} (${esc((spec.page || {}).route)}) of ${esc(app.name)}.
Source of truth: the JSON island in this file (id="spec"). Element IDs are stable — use them in commits, tickets and tests.

BUILD EXACTLY THIS
${(k.must || []).map(x => "  · " + x).join("\n") || "  · (nothing recorded yet)"}

DO NOT INVENT
${(k.mustNotInvent || []).map(x => "  · " + x).join("\n") || "  · (nothing recorded yet)"}

STOP AND ASK BEFORE BUILDING
${(k.askFirst || []).map(x => "  · " + x).join("\n") || "  · (nothing recorded yet)"}

DONE MEANS
${(k.acceptance || []).map(x => "  · " + x).join("\n") || "  · (nothing recorded yet)"}

Anything not covered above is unspecified. Raise it as a new question against this page rather than deciding it.</pre>
      <div style="height:12px"></div>
      <button class="btn" id="copy-json">Copy spec JSON</button>
      <button class="btn" id="toggle-json">Show spec JSON</button>
      <pre class="contract" id="json-dump" style="display:none;margin-top:12px"></pre>`,
      "The block an agent is handed. It says what to build, what it may not invent, and what to ask about first.", "contract"));

    const body = $("#spec-body");
    if (body) body.innerHTML = out.join("");

    const dump = $("#json-dump");
    if (dump) dump.textContent = JSON.stringify(spec, null, 2);
    const tg = $("#toggle-json");
    if (tg) tg.addEventListener("click", () => {
      const on = dump.style.display === "none";
      dump.style.display = on ? "block" : "none";
      tg.textContent = on ? "Hide spec JSON" : "Show spec JSON";
    });
    const cp = $("#copy-json");
    if (cp) cp.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(spec, null, 2)); cp.textContent = "Copied"; setTimeout(() => cp.textContent = "Copy spec JSON", 1400); }
      catch (e) { dump.style.display = "block"; cp.textContent = "Select it above"; }
    });

    const crumbs = $("#crumbs");
    if (crumbs) crumbs.innerHTML = `<a href="index.html">Spec</a> <span>/</span> <a href="app-map.html">${esc((spec.represents || {}).process || "App")}</a> <span>/</span> <span>${esc(p.name || "")}</span>`;
  }

  /* ---------- the mock ---------- */
  function wireMock(spec) {
    const shell = $("#mock"); if (!shell) return;
    const stage = $(".mock-stage", shell);
    const byId = {};
    (spec.elements || []).forEach(e => byId[e.id] = Object.assign({ kind: "element" }, e));
    (spec.controls || []).forEach(c => byId[c.id] = Object.assign({ kind: "control" }, c));

    /* stamp markers onto the wireframe */
    $$("[data-el]", stage).forEach(node => {
      const rec = byId[node.getAttribute("data-el")];
      if (rec && rec.marker) node.setAttribute("data-marker", rec.marker);
    });

    /* controls row */
    const devices = $$(".mock-view", stage).map(v => v.getAttribute("data-device")).filter((v, i, a) => a.indexOf(v) === i);
    const states = (spec.states || []).map(s => ({ key: s.key, label: s.label || s.key }));
    const roles = (spec.availableTo || []).map(a => a.role);
    const ctrls = $(".mock-controls", shell);
    ctrls.innerHTML = `
      <div class="ctrl"><span class="ctrl-label">Device</span><div class="seg" id="seg-device">
        ${devices.map((d, i) => `<button data-v="${esc(d)}" class="${i ? "" : "is-on"}">${esc(d)}</button>`).join("")}</div></div>
      <div class="ctrl"><span class="ctrl-label">Role</span><div class="seg" id="seg-role">
        ${roles.map((r, i) => `<button data-v="${esc(r)}" class="${i ? "" : "is-on"}">${esc(r)}</button>`).join("")}</div></div>
      <div class="ctrl"><span class="ctrl-label">State</span><div class="seg" id="seg-state">
        ${states.map((s, i) => `<button data-v="${esc(s.key)}" class="${i ? "" : "is-on"}">${esc(s.label)}</button>`).join("")}</div></div>
      <label class="switch"><input type="checkbox" id="sw-overlay"> honesty overlay</label>
      <label class="switch"><input type="checkbox" id="sw-ids"> show IDs</label>`;

    const legend = document.createElement("div");
    legend.className = "overlay-legend";
    legend.innerHTML = ["required", "proposed", "unanswered", "observed", "out of scope"]
      .map(m => `<span><span class="legend-dot" style="background:var(--m-${MARK_CLASS[m]})"></span>${m}</span>`).join("")
      + `<span style="margin-left:auto">Outlined by what backs it, not by how finished it looks.</span>`;
    shell.appendChild(legend);

    function seg(id, fn) {
      const wrap = $("#" + id, shell); if (!wrap) return;
      wrap.addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        $$("button", wrap).forEach(x => x.classList.remove("is-on"));
        b.classList.add("is-on"); fn(b.getAttribute("data-v"));
      });
    }
    function currentDevice() { return stage.getAttribute("data-device") || (devices[0] || "desktop"); }
    function applyState(key) {
      const dev = currentDevice();
      const mine = $$(`.mock-view[data-device="${dev}"]`, stage);
      const exact = mine.filter(v => (v.getAttribute("data-state") || "default") === key);
      const show = exact.length ? exact : mine.filter(v => (v.getAttribute("data-state") || "default") === "default");
      $$(".mock-view", stage).forEach(v => v.classList.toggle("is-on", show.indexOf(v) !== -1));
      const note = $("#state-note", shell);
      if (note) {
        const s = (spec.states || []).find(x => x.key === key) || {};
        note.innerHTML = exact.length ? "" :
          `<div class="state-empty-note">No separate sketch for <b>${esc(s.label || key)}</b> on ${esc(dev)}. What should happen: ${esc(s.sees || "nobody has described it — that is the gap.")}</div>`;
      }
    }
    function applyDevice(d) {
      stage.setAttribute("data-device", d);
      const on = $("#seg-state .is-on", shell);
      applyState(on ? on.getAttribute("data-v") : "default");
    }
    function applyRole(role) {
      $$("[data-roles]", stage).forEach(n => {
        const list = n.getAttribute("data-roles").split(/\s*,\s*/);
        if (list.indexOf(role) === -1) n.setAttribute("data-hidden-role", "1"); else n.removeAttribute("data-hidden-role");
      });
      const note = $("#role-note", shell);
      const a = (spec.availableTo || []).find(x => x.role === role);
      if (note) note.innerHTML = a && a.differs ? `<div class="state-empty-note"><b>${esc(role)}</b>: ${esc(a.differs)}${a.mustNotSee ? ` · Must not see: ${esc(a.mustNotSee)}` : ""}</div>` : "";
    }
    seg("seg-device", applyDevice);
    seg("seg-state", applyState);
    seg("seg-role", applyRole);
    $("#sw-overlay", shell).addEventListener("change", e => {
      stage.classList.toggle("overlay-on", e.target.checked);
      shell.classList.toggle("overlay-on", e.target.checked);
    });
    $("#sw-ids", shell).addEventListener("change", e => stage.classList.toggle("show-ids", e.target.checked));

    if (devices.length) applyDevice(devices[0]);
    if (roles.length) applyRole(roles[0]);

    /* inspector */
    const insp = $("#inspector");
    function open(id) {
      const rec = byId[id];
      $$("[data-el]", stage).forEach(n => n.classList.toggle("is-selected", n.getAttribute("data-el") === id));
      if (!rec) {
        insp.innerHTML = `<button class="btn inspector-close" id="insp-close">Close</button>
          <div class="insp-id">${esc(id)}</div><div class="insp-name">Not in the spec</div>
          <div class="insp-row">This element is drawn in the mock but has no row in the tables below. Either it was invented to finish the picture, or somebody forgot to write it down. Both are worth knowing.</div>`;
      } else {
        const qs = (spec.questions || []).filter(q => (q.affects || []).indexOf(id) !== -1 || (rec.questions || []).indexOf(q.id) !== -1);
        insp.innerHTML = `<button class="btn inspector-close" id="insp-close">Close</button>
          <div class="insp-id">${esc(rec.id)} · ${esc(rec.kind)}</div>
          <div class="insp-name">${esc(rec.name)}</div>
          <div>${marker(rec.marker)}</div>
          ${rec.shows ? `<div class="insp-row"><span class="k">Shows / accepts</span>${esc(rec.shows)}</div>` : ""}
          ${rec.effect ? `<div class="insp-row"><span class="k">Business effect</span>${esc(rec.effect)}${rec.serverData ? " · needs data only the server knows" : ""}</div>` : ""}
          ${rec.source ? `<div class="insp-row"><span class="k">Comes from</span>${esc(rec.source)}</div>` : ""}
          ${rec.leadsTo ? `<div class="insp-row"><span class="k">Leads to</span>${rec.href ? link(rec.href, rec.leadsTo) : esc(rec.leadsTo)}</div>` : ""}
          ${rec.confirm ? `<div class="insp-row"><span class="k">Confirm / undo</span>${esc(rec.confirm)}</div>` : ""}
          ${rec.note ? `<div class="insp-row"><span class="k">Note</span>${esc(rec.note)}</div>` : ""}
          <div class="insp-row"><span class="k">Traces to</span>${rec.trace ? esc(rec.trace) : "nothing — this element is not backed by a requirement"}</div>
          ${qs.length ? `<div class="insp-row"><span class="k">Open questions</span>${qs.map(q => `<div class="insp-q"><b>${esc(q.id)}</b> ${esc(q.question)}<br><span style="color:var(--text3)">${esc(q.whoMustAnswer || "nobody named")}${q.neededBy ? " · by " + esc(q.neededBy) : ""}</span></div>`).join("")}</div>` : ""}`;
      }
      insp.classList.add("is-open");
      $("#insp-close").addEventListener("click", close);
    }
    function close() { insp.classList.remove("is-open"); $$("[data-el]", stage).forEach(n => n.classList.remove("is-selected")); }
    stage.addEventListener("click", e => {
      const n = e.target.closest("[data-el]");
      const a = e.target.closest("a");
      if (a && a.getAttribute("href")) return;      /* links inside the mock navigate, as they would in the app */
      if (n) {
        e.preventDefault();
        const tab = n.getAttribute("data-mock-tab");
        if (tab) {
          const scope = n.closest(".mock-view") || stage;
          $$(".wf-pane", scope).forEach(p => p.classList.toggle("is-on", p.id === tab));
          $$("[data-mock-tab]", scope).forEach(t => t.classList.toggle("is-on", t === n));
        }
        open(n.getAttribute("data-el"));
      }
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    if (/^#(EL|CTL)-/.test(location.hash)) open(location.hash.slice(1));
  }

  /* ---------- registers (index / questions / data dictionary) ---------- */
  async function loadSpecs(files) {
    const out = [];
    for (const f of files) {
      try {
        const res = await fetch(f, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status);
        const txt = await res.text();
        const doc = new DOMParser().parseFromString(txt, "text/html");
        const island = doc.querySelector("#spec");
        if (island) out.push(Object.assign(JSON.parse(island.textContent), { _file: f }));
      } catch (e) { out.push({ _file: f, _error: String(e) }); }
    }
    return out;
  }

  window.SpecKit = {
    chrome, renderPage, wireMock, gates, coverage, coverageBar, loadSpecs, esc, val, marker, table,
    rung, rungChip, PERIODICITY,
    block: (t, f, b, n, i) => block(t, f, b, n, i),
    resetBlockCounter: (n) => { blockNo = n === undefined ? 6 : n; },
    boot(currentFile) {
      chrome(currentFile);
      const island = $("#spec");
      if (!island) return null;
      const spec = JSON.parse(island.textContent);
      renderPage(spec);
      wireMock(spec);
      return spec;
    }
  };
})();
