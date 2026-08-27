(function () {
  "use strict";

  const BLOCKS = window.MOCKUMENT_BLOCKS || [];
  const STORAGE_KEY = "honest-mockument-template-state";
  const SCHEMA_VERSION = 28;
  const TEMPLATE_VERSION = "0.29.0";
  const FIDELITY_NOTE = "Structure only, example data, nothing here is proof that the application works.";
  const THEME_KEY = "mockument-theme";
  const THEME_CYCLE = ["system", "dark", "light"];
  const BLOCK_SUMMARIES = {
    B01: "Page", B02: "Roles", B03: "Data", B04: "Mock", B05: "Conditions", B06: "Failures",
    B07: "Memory", B08: "Changes", B09: "Connections", B10: "Workflows", B11: "Copy",
    B12: "Records", B13: "Contract"
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  const initialHashBlock = window.location && /^#B\d{2}$/.test(window.location.hash || "") && BLOCKS.some(block => `#${block.id}` === window.location.hash) ? window.location.hash.slice(1) : "B01";
  let selection = { kind: "block", blockId: initialHashBlock };
  let showAllBlocks = false;
  let previewMode = false;
  let mockChoice = { role: "default role", state: "default", reviewMode: "clean" };
  let activeGateFilter = null;
  let activeResize = null;
  let toastTimer;

  function updateBlockHash() {
    if (!window.history || !window.location || !selection.blockId) return;
    const hash = `#${selection.blockId}`;
    if (window.location.hash !== hash) window.history.replaceState(null, "", `${window.location.pathname || ""}${window.location.search || ""}${hash}`);
  }

  function selectBlock(blockId) {
    if (!BLOCKS.some(block => block.id === blockId)) return;
    selection = { kind: "block", blockId };
    showAllBlocks = false;
    updateBlockHash();
  }

  function revealActiveBlock() {
    if (typeof window.scrollTo === "function") window.scrollTo({ top: 0, behavior: "auto" });
  }

  function applyTheme(mode) {
    const validMode = THEME_CYCLE.includes(mode) ? mode : "system";
    const effective = validMode === "system"
      ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : validMode;
    document.documentElement.dataset.themeMode = validMode;
    document.documentElement.dataset.theme = effective;
    const button = $("#theme-button");
    if (button) {
      button.textContent = validMode === "system" ? "◐" : validMode === "dark" ? "☾" : "☀";
      button.title = `Theme: ${validMode}`;
      button.setAttribute("aria-label", `Color theme: ${validMode}. Click to change.`);
    }
  }

  function cycleTheme() {
    const current = localStorage.getItem(THEME_KEY) || "system";
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
    if (next === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    showToast(`Theme: ${next}`);
  }

  function initialFieldValue(field) {
    if (field.type === "rows") return [];
    return field.default || "";
  }

  function clampPercent(value, minimum = 5) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(minimum, Math.min(100, Math.round(number * 10) / 10));
  }

  function initialBlock(definition) {
    const values = {};
    definition.fields.forEach(field => { values[field.key] = initialFieldValue(field); });
    return {
      status: "todo",
      accountable: "",
      note: "",
      devQa: { evidence: "" },
      humanReviews: {
        walk: { reviewer: "", confirmed: false, confirmedAt: "", reviewedContentHash: "" },
        mockQa: { reviewer: "", confirmed: false, confirmedAt: "", reviewedContentHash: "" },
        build: { reviewer: "", confirmed: false, confirmedAt: "", reviewedContentHash: "" },
        devQa: { reviewer: "", confirmed: false, confirmedAt: "", reviewedContentHash: "" }
      },
      values
    };
  }

  function nextRecordId(page, prefix) {
    const mock = page.blocks.B04.values;
    const rows = prefix === "PNL" ? mock.panels : prefix === "ROW" ? mock.rows : prefix === "CTL" ? mock.controls : mock.elements;
    const highest = rows.reduce((max, row) => {
      const match = String(row.id || row._id || "").match(new RegExp(`^${prefix}-(\\d+)$`));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${prefix}-${String(highest + 1).padStart(2, "0")}`;
  }

  function ensureLayout(page) {
    const mock = page.blocks.B04.values;
    if (!Array.isArray(mock.rows)) mock.rows = [];
    if (!Array.isArray(mock.panels)) mock.panels = [];
    if (!Array.isArray(mock.elements)) mock.elements = [];
    if (!Array.isArray(mock.controls)) mock.controls = [];
    if (!Array.isArray(mock.layout)) mock.layout = [];
    mock.layout.forEach(node => {
      if (!node.type) node.type = String(node.recordId || "").startsWith("PNL-") ? "panel" : String(node.recordId || "").startsWith("ROW-") ? "row" : "section";
      if (!node.parentId) node.parentId = node.panelId || "canvas";
      if (!Array.isArray(node.items)) node.items = [];
      if (["row", "panel"].includes(node.type) && node.sizePercent != null) node.sizePercent = clampPercent(node.sizePercent);
      if (node.type === "section" && !node.columns) node.columns = 1;
    });
  }

  function layoutChildren(page, parentId) {
    return (page.blocks.B04.values.layout || []).filter(node => (node.parentId || node.panelId || "canvas") === parentId);
  }

  function panelWidthBasis(page, node) {
    const panel = (page.blocks.B04.values.panels || []).find(row => (row.id || row._id) === node.recordId) || {};
    return Math.max(1, Number(panel.width) || 1);
  }

  function normalizeLayoutSizes(page, nodes, fallbackType = "panel") {
    const sizeable = nodes.filter(node => node && ["row", "panel"].includes(node.type || fallbackType));
    if (!sizeable.length) return;
    const existingTotal = sizeable.reduce((total, node) => total + (Number(node.sizePercent) || 0), 0);
    if (existingTotal > 0) {
      sizeable.forEach(node => { node.sizePercent = clampPercent((Number(node.sizePercent) || 0) / existingTotal * 100); });
    } else if ((sizeable[0].type || fallbackType) === "panel") {
      const basisTotal = sizeable.reduce((total, node) => total + panelWidthBasis(page, node), 0) || sizeable.length;
      sizeable.forEach(node => { node.sizePercent = clampPercent(panelWidthBasis(page, node) / basisTotal * 100); });
    } else {
      const equal = Math.round((100 / sizeable.length) * 10) / 10;
      sizeable.forEach(node => { node.sizePercent = equal; });
    }
    const roundedTotal = sizeable.reduce((total, node) => total + (Number(node.sizePercent) || 0), 0);
    const last = sizeable[sizeable.length - 1];
    if (last && roundedTotal !== 100) last.sizePercent = Math.max(5, Math.round(((Number(last.sizePercent) || 0) + (100 - roundedTotal)) * 10) / 10);
  }

  function consecutiveGroups(nodes, type) {
    const groups = [];
    for (let index = 0; index < nodes.length; index += 1) {
      if ((nodes[index].type || "section") !== type) continue;
      const group = [];
      while (nodes[index] && (nodes[index].type || "section") === type) { group.push(nodes[index]); index += 1; }
      index -= 1;
      groups.push(group);
    }
    return groups;
  }

  function normalizeAllLayoutSizes(page) {
    const layout = page.blocks.B04.values.layout || [];
    const parentIds = new Set(["canvas", ...layout.map(node => node.recordId)]);
    parentIds.forEach(parentId => {
      const children = layoutChildren(page, parentId);
      consecutiveGroups(children, "panel").forEach(group => normalizeLayoutSizes(page, group, "panel"));
      consecutiveGroups(children, "row").forEach(group => normalizeLayoutSizes(page, group, "row"));
    });
  }

  function createPage(id, name, route, built = true, isSettings = false) {
    const blocks = {};
    BLOCKS.forEach(definition => { blocks[definition.id] = initialBlock(definition); });
    const today = new Date().toISOString().slice(0, 10);
    blocks.B01.values = { ...blocks.B01.values, name, route, buildStatus: "new", version: "0.1", updated: today, owner: "" };
    blocks.B04.values.defaultRole = "default role";
    const page = { id, name, route, built, isSettings, parentId: null, templateVersion: TEMPLATE_VERSION, schemaVersion: SCHEMA_VERSION, blocks, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    ensureLayout(page);
    return page;
  }

  function createInitialState() {
    const settings = createPage("settings", "Settings", "/settings", false, true);
    return {
      schemaVersion: SCHEMA_VERSION,
      templateVersion: TEMPLATE_VERSION,
      app: { name: "Application Name", domain: "", version: "0.1", reviewers: [], workflows: [] },
      pageOrder: ["settings"],
      pages: { settings },
      activePageId: "template",
      changeLog: [{ version: TEMPLATE_VERSION, date: new Date().toISOString(), note: "Initial canonical Template" }]
    };
  }

  function syncPage(page) {
    if (!page.blocks) page.blocks = {};
    BLOCKS.forEach(definition => {
      if (!page.blocks[definition.id]) page.blocks[definition.id] = initialBlock(definition);
      const block = page.blocks[definition.id];
      if (!block.values) block.values = {};
      if (!block.devQa) block.devQa = { evidence: "" };
      if (block.devQa.evidence == null) block.devQa.evidence = "";
      if (!block.humanReviews) block.humanReviews = {};
      ["walk", "mockQa", "build", "devQa"].forEach(key => {
        if (!block.humanReviews[key]) block.humanReviews[key] = { reviewer: "", confirmed: false, confirmedAt: "", reviewedContentHash: "" };
        if (block.humanReviews[key].reviewedContentHash == null) block.humanReviews[key].reviewedContentHash = "";
      });
      definition.fields.forEach(field => {
        if (!(field.key in block.values)) block.values[field.key] = initialFieldValue(field);
        if (field.type === "rows" && Array.isArray(block.values[field.key])) {
          block.values[field.key].forEach(row => field.fields.forEach(column => {
            if (!(column.key in row)) row[column.key] = column.type === "select" ? column.choices[0] : (column.default || "");
          }));
        }
      });
    });
    ensureLayout(page);
    page.schemaVersion = SCHEMA_VERSION;
    page.templateVersion = TEMPLATE_VERSION;
    return page;
  }

  function migrateState(candidate) {
    const next = candidate && typeof candidate === "object" ? candidate : createInitialState();
    if (!next.pages || !next.pageOrder) return createInitialState();
    const previousSchemaVersion = Number(next.schemaVersion || 1);
    Object.values(next.pages).forEach(syncPage);
    if (!next.pages.settings) {
      next.pages.settings = createPage("settings", "Settings", "/settings", false, true);
      next.pageOrder.push("settings");
    }
    next.schemaVersion = SCHEMA_VERSION;
    next.templateVersion = TEMPLATE_VERSION;
    next.changeLog = next.changeLog || [];
    if (previousSchemaVersion < 2 && !next.changeLog.some(entry => entry.version === "0.2.0")) {
      next.changeLog.push({ version: "0.2.0", date: new Date().toISOString(), note: "Added the structured mock composer and synchronized existing pages." });
    }
    if (previousSchemaVersion < 3 && !next.changeLog.some(entry => entry.version === "0.3.0")) {
      next.changeLog.push({ version: "0.3.0", date: new Date().toISOString(), note: "Clarified build and Dev QA gates and added implementation evidence to B22." });
    }
    if (previousSchemaVersion < 4 && !next.changeLog.some(entry => entry.version === "0.4.0")) {
      next.changeLog.push({ version: "0.4.0", date: new Date().toISOString(), note: "Added per-block Walk-through, Mockument QA, Build, and Dev QA readiness statuses, with per-block Dev QA evidence." });
    }
    if (previousSchemaVersion < 5) {
      if (!next.app) next.app = { name: "Application Name", domain: "", version: "0.1", reviewers: [] };
      if (!next.app.name || next.app.name === "New system") next.app.name = "Application Name";
      if (!next.changeLog.some(entry => entry.version === "0.5.0")) next.changeLog.push({ version: "0.5.0", date: new Date().toISOString(), note: "Added application naming to Settings and synchronized browser titles." });
    }
    if (!next.changeLog.some(entry => entry.version === "0.6.0")) next.changeLog.push({ version: "0.6.0", date: new Date().toISOString(), note: "Made the canonical Template an interactive, non-persistent preview." });
    if (!next.app) next.app = { name: "Application Name", domain: "", version: "0.1", reviewers: [] };
    if (!Array.isArray(next.app.reviewers)) next.app.reviewers = [];
    if (!Array.isArray(next.app.workflows)) next.app.workflows = [];
    if (previousSchemaVersion < 6 && !next.changeLog.some(entry => entry.version === "0.7.0")) next.changeLog.push({ version: "0.7.0", date: new Date().toISOString(), note: "Added Settings reviewer names and per-stage human review confirmations for every block." });
    if (previousSchemaVersion < 7) {
      Object.values(next.pages).forEach(page => {
        const value = page.blocks && page.blocks.B01 && page.blocks.B01.values.buildStatus;
        if (value === "modify" || value === "existing") page.blocks.B01.values.buildStatus = "modification of an existing page";
      });
      if (!next.changeLog.some(entry => entry.version === "0.8.0")) next.changeLog.push({ version: "0.8.0", date: new Date().toISOString(), note: "Simplified page build status to new or modification of an existing page." });
    }
    if (previousSchemaVersion < 8) {
      Object.values(next.pages).forEach(page => BLOCKS.forEach(definition => {
        const block = page.blocks[definition.id];
        Object.values(block.humanReviews).forEach(review => {
          if (review.confirmed && review.reviewer && !review.reviewedContentHash) review.reviewedContentHash = blockContentFingerprint(block);
          delete review.reviewedRevision;
        });
        delete block.revision;
      }));
      if (!next.changeLog.some(entry => entry.version === "0.9.0")) next.changeLog.push({ version: "0.9.0", date: new Date().toISOString(), note: "Replaced block version counters with invisible content fingerprints for human-review freshness." });
    }
    if (previousSchemaVersion < 9) {
      const migrateStatus = value => ({ unanswered: "todo", proposed: "wip", answered: "done" }[value] || value || "todo");
      Object.values(next.pages).forEach(page => BLOCKS.forEach(definition => {
        const block = page.blocks[definition.id];
        block.status = migrateStatus(block.status);
        blockRows(definition, block).forEach(row => { row._status = migrateStatus(row._status); });
        Object.values(block.humanReviews).forEach(review => {
          if (review.confirmed && review.reviewer) review.reviewedContentHash = blockContentFingerprint(block);
        });
      }));
      if (!next.changeLog.some(entry => entry.version === "0.10.0")) next.changeLog.push({ version: "0.10.0", date: new Date().toISOString(), note: "Renamed work statuses to To Do, WIP, and Done." });
    }
    if (previousSchemaVersion < 10) {
      Object.values(next.pages).forEach(page => {
        delete page.blocks.B02.values.deviceTypes;
        delete page.blocks.B05.values.defaultDevice;
        const listValues = page.blocks.B10.values;
        (listValues.deviceListBehavior || []).forEach(legacy => {
          let target = (listValues.lists || []).find(row => legacy.dataName && row.dataName === legacy.dataName);
          if (!target) {
            target = { ...legacy };
            delete target.device;
            listValues.lists.push(target);
          }
          ["empty", "one", "overflow"].forEach(key => { if (!target[key] && legacy[key]) target[key] = legacy[key]; });
        });
        (listValues.lists || []).forEach(row => { delete row.device; });
        delete listValues.deviceListBehavior;
        (page.blocks.B14.values.liveChanges || []).forEach(row => { delete row.device; });
        (page.blocks.B08.values.controls || []).forEach(row => { if (row.effect === "alters the device-step") row.effect = "changes the page"; });
        BLOCKS.forEach(definition => Object.values(page.blocks[definition.id].humanReviews).forEach(review => {
          if (review.confirmed && review.reviewer) review.reviewedContentHash = blockContentFingerprint(page.blocks[definition.id]);
        }));
      });
      if (!next.changeLog.some(entry => entry.version === "0.11.0")) next.changeLog.push({ version: "0.11.0", date: new Date().toISOString(), note: "Focused the default methodology on the current B2B application scope." });
    }
    if (previousSchemaVersion < 11) {
      Object.values(next.pages).forEach(page => {
        const values = page.blocks.B02.values;
        const process = String(values.process || "").trim();
        const step = String(values.step || "").trim();
        if (!String(values.activity || "").trim()) values.activity = process && step && process !== step ? `${process} — ${step}` : (step || process);
        delete values.process;
        delete values.step;
        delete values.stepId;
        Object.values(page.blocks.B02.humanReviews).forEach(review => {
          if (review.confirmed && review.reviewer) review.reviewedContentHash = blockContentFingerprint(page.blocks.B02);
        });
      });
      if (!next.changeLog.some(entry => entry.version === "0.12.0")) next.changeLog.push({ version: "0.12.0", date: new Date().toISOString(), note: "Merged business process and process step into one Business activity field." });
    }
    if (previousSchemaVersion < 12) {
      Object.values(next.pages).forEach(page => BLOCKS.forEach(definition => {
        const block = page.blocks[definition.id];
        delete block.devQa.status;
        Object.entries(block.humanReviews).forEach(([gateKey, review]) => {
          if (review.confirmed && review.reviewer) review.reviewedContentHash = blockContentFingerprint(block, gateKey);
        });
      }));
      if (!next.changeLog.some(entry => entry.version === "0.13.0")) next.changeLog.push({ version: "0.13.0", date: new Date().toISOString(), note: "Removed the manual Development QA handoff status and moved implementation evidence beside the Dev QA reviewer." });
    }
    if (previousSchemaVersion < 13) {
      Object.values(next.pages).forEach(page => {
        const block = page.blocks.B03;
        block.values.roles = (block.values.roles || []).filter(role => role.mayReach !== "no");
        block.values.roles.forEach(role => { delete role.mayReach; });
        Object.entries(block.humanReviews).forEach(([gateKey, review]) => {
          if (review.confirmed && review.reviewer) review.reviewedContentHash = blockContentFingerprint(block, gateKey);
        });
      });
      if (!next.changeLog.some(entry => entry.version === "0.14.0")) next.changeLog.push({ version: "0.14.0", date: new Date().toISOString(), note: "Made every role listed in B03 an allowed role and removed the redundant access yes/no field." });
    }
    if (previousSchemaVersion < 14) {
      Object.values(next.pages).forEach(page => {
        const block = page.blocks.B03;
        if (!block.accountable) {
          const priorOwner = (block.values.roles || []).map(role => String(role._accountable || "").trim()).find(Boolean);
          if (priorOwner) block.accountable = priorOwner;
        }
        (block.values.roles || []).forEach(role => { delete role._accountable; });
        Object.entries(block.humanReviews).forEach(([gateKey, review]) => {
          if (review.confirmed && review.reviewer) review.reviewedContentHash = blockContentFingerprint(block, gateKey);
        });
      });
      if (!next.changeLog.some(entry => entry.version === "0.15.0")) next.changeLog.push({ version: "0.15.0", date: new Date().toISOString(), note: "Removed redundant per-role answer ownership from B03; its block assignment now owns the role register." });
    }
    if (previousSchemaVersion < 15) {
      Object.values(next.pages).forEach(page => {
        const oldBlocks = { ...page.blocks };
        page.blocks.B01 = oldBlocks.B01;
        page.blocks.B01.values.activity = String(oldBlocks.B02 && oldBlocks.B02.values.activity || page.blocks.B01.values.activity || "");
        for (let oldNumber = 3; oldNumber <= 22; oldNumber += 1) {
          const oldId = `B${String(oldNumber).padStart(2, "0")}`;
          const newId = `B${String(oldNumber - 1).padStart(2, "0")}`;
          page.blocks[newId] = oldBlocks[oldId];
        }
        delete page.blocks.B22;
      });
      if (!next.changeLog.some(entry => entry.version === "0.16.0")) next.changeLog.push({ version: "0.16.0", date: new Date().toISOString(), note: "Moved Business activity into B01, removed the former B02, and renumbered the methodology to 21 blocks." });
    }
    if (previousSchemaVersion < 16) {
      Object.values(next.pages).forEach(page => {
        const oldBlocks = { ...page.blocks };
        page.blocks.B01 = oldBlocks.B01;
        const purpose = String(oldBlocks.B03 && oldBlocks.B03.values.purpose || "").trim();
        const activity = String(page.blocks.B01.values.activity || "").trim();
        if (purpose && !activity.includes(purpose)) page.blocks.B01.values.activity = activity ? `${activity}\n\n${purpose}` : purpose;
        page.blocks.B02 = oldBlocks.B02;
        for (let oldNumber = 4; oldNumber <= 21; oldNumber += 1) {
          const oldId = `B${String(oldNumber).padStart(2, "0")}`;
          const newId = `B${String(oldNumber - 1).padStart(2, "0")}`;
          page.blocks[newId] = oldBlocks[oldId];
        }
        delete page.blocks.B21;
      });
      if (!next.changeLog.some(entry => entry.version === "0.17.0")) next.changeLog.push({ version: "0.17.0", date: new Date().toISOString(), note: "Merged Purpose into B01 Business activity and renumbered the methodology to 20 blocks." });
    }
    if (previousSchemaVersion < 17) {
      Object.values(next.pages).forEach(page => {
        const oldBlocks = { ...page.blocks };
        page.blocks.B01 = oldBlocks.B01;
        page.blocks.B02 = oldBlocks.B02;
        page.blocks.B03 = oldBlocks.B03;
        for (let oldNumber = 5; oldNumber <= 20; oldNumber += 1) {
          const oldId = `B${String(oldNumber).padStart(2, "0")}`;
          const newId = `B${String(oldNumber - 1).padStart(2, "0")}`;
          page.blocks[newId] = oldBlocks[oldId];
        }
        delete page.blocks.B20;
      });
      if (!next.changeLog.some(entry => entry.version === "0.18.0")) next.changeLog.push({ version: "0.18.0", date: new Date().toISOString(), note: "Removed the per-page Fidelity block and made its qualification a permanent system and build-contract rule." });
    }
    if (previousSchemaVersion < 18) {
      Object.values(next.pages).forEach(page => {
        const oldBlocks = { ...page.blocks };
        const mock = oldBlocks.B03;
        const elements = oldBlocks.B04;
        mock.values.elements = elements.values.elements || [];
        if (!mock.accountable && elements.accountable) mock.accountable = elements.accountable;
        mock.status = mock.status === "done" && elements.status === "done" ? "done" : mock.status === "todo" && elements.status === "todo" ? "todo" : "wip";
        mock.note = [mock.note, elements.note].map(value => String(value || "").trim()).filter(Boolean).join(" · ");
        mock.devQa.evidence = [mock.devQa.evidence, elements.devQa.evidence].map(value => String(value || "").trim()).filter(Boolean).join("\n");
        Object.entries(mock.humanReviews).forEach(([gateKey, review]) => {
          const elementReview = elements.humanReviews[gateKey];
          if (!review.reviewer && elementReview.reviewer) review.reviewer = elementReview.reviewer;
          review.confirmed = false;
          review.confirmedAt = "";
          review.reviewedContentHash = "";
        });
        page.blocks.B03 = mock;
        for (let oldNumber = 5; oldNumber <= 19; oldNumber += 1) {
          const oldId = `B${String(oldNumber).padStart(2, "0")}`;
          const newId = `B${String(oldNumber - 1).padStart(2, "0")}`;
          page.blocks[newId] = oldBlocks[oldId];
        }
        delete page.blocks.B19;
      });
      if (!next.changeLog.some(entry => entry.version === "0.19.0")) next.changeLog.push({ version: "0.19.0", date: new Date().toISOString(), note: "Merged canonical element records into the B03 Mock composer and removed the repeated Elements block." });
    }
    if (previousSchemaVersion < 19) {
      Object.values(next.pages).forEach(page => {
        const oldBlocks = { ...page.blocks };
        const mock = oldBlocks.B03;
        const controls = oldBlocks.B04;
        const data = oldBlocks.B05;
        const lists = oldBlocks.B06;
        const dataRows = data.values.data || [];
        const elements = mock.values.elements || [];
        mock.values.controls = controls.values.controls || [];
        elements.forEach(element => {
          const source = String(element.source || "").trim();
          const match = dataRows.find(row => source && [row.id, row._id, row.name].some(value => String(value || "").toLowerCase() === source.toLowerCase()));
          element.dataRef = match ? (match.id || match._id) : (["field", "list", "table"].includes(element.kind) && source ? "Not yet defined" : "");
          if (source && !match) element._note = [element._note, `Previous source: ${source}`].filter(Boolean).join(" · ");
          delete element.source;
        });
        const layout = mock.values.layout || [];
        (lists.values.lists || []).forEach((list, index) => {
          let element = elements.find(row => ["list", "table"].includes(row.kind) && [row.name, row.dataRef].some(value => String(value || "").toLowerCase() === String(list.dataName || "").toLowerCase()));
          if (!element) element = elements.filter(row => ["list", "table"].includes(row.kind))[index];
          if (!element) {
            const highest = elements.reduce((max, row) => { const match = String(row.id || row._id || "").match(/^EL-(\d+)$/); return match ? Math.max(max, Number(match[1])) : max; }, 0);
            const id = `EL-${String(highest + 1).padStart(2, "0")}`;
            element = { _id: id, _status: list._status || "todo", _accountable: list._accountable || "", _note: list._note || "Migrated from the former Lists block", id, kind: "list", name: list.dataName || "Migrated list", shows: "", dataRef: "", trace: "" };
            elements.push(element);
            if (layout[0]) layout[0].items.push({ recordId: id });
          }
          ["ordering", "filtering", "selection", "nesting", "empty", "one", "overflow"].forEach(key => { if (list[key] && !element[key]) element[key] = list[key]; });
          if (!element.dataRef && list.dataName) {
            const match = dataRows.find(row => [row.id, row._id, row.name].some(value => String(value || "").toLowerCase() === String(list.dataName).toLowerCase()));
            element.dataRef = match ? (match.id || match._id) : "Not yet defined";
          }
        });
        mock.values.elements = elements;
        [controls, lists].forEach(mergedBlock => {
          if (!mock.accountable && mergedBlock.accountable) mock.accountable = mergedBlock.accountable;
          mock.note = [mock.note, mergedBlock.note].map(value => String(value || "").trim()).filter(Boolean).join(" · ");
          mock.devQa.evidence = [mock.devQa.evidence, mergedBlock.devQa.evidence].map(value => String(value || "").trim()).filter(Boolean).join("\n");
          Object.entries(mock.humanReviews).forEach(([gateKey, review]) => {
            const mergedReview = mergedBlock.humanReviews[gateKey];
            if (!review.reviewer && mergedReview.reviewer) review.reviewer = mergedReview.reviewer;
          });
        });
        Object.values(mock.humanReviews).forEach(review => { review.confirmed = false; review.confirmedAt = ""; review.reviewedContentHash = ""; });
        page.blocks.B03 = data;
        page.blocks.B04 = mock;
        for (let oldNumber = 7; oldNumber <= 18; oldNumber += 1) {
          const oldId = `B${String(oldNumber).padStart(2, "0")}`;
          const newId = `B${String(oldNumber - 2).padStart(2, "0")}`;
          page.blocks[newId] = oldBlocks[oldId];
        }
        delete page.blocks.B17;
        delete page.blocks.B18;
        BLOCKS.forEach(definition => {
          const allowed = new Set(definition.fields.map(field => field.key));
          if (definition.id === "B04") allowed.add("layout");
          Object.keys(page.blocks[definition.id].values).forEach(key => { if (!allowed.has(key)) delete page.blocks[definition.id].values[key]; });
        });
        syncPage(page);
      });
      if (!next.changeLog.some(entry => entry.version === "0.20.0")) next.changeLog.push({ version: "0.20.0", date: new Date().toISOString(), note: "Moved Data definitions before the mock and merged Controls and Lists into B04 inspector records." });
    }
    if (previousSchemaVersion < 20) {
      Object.values(next.pages).forEach(page => {
        const dataRows = page.blocks.B03.values.data || [];
        const elements = page.blocks.B04.values.elements || [];
        const findData = ref => dataRows.find(row => (row.id || row._id) === ref);
        dataRows.forEach(row => {
          row.cardinality = row.holds === "one value" ? "one" : row.holds === "a list" ? "many" : (row.cardinality || "not yet defined");
          if (!row.structure) row.structure = "not yet defined";
          delete row.holds;
        });
        elements.forEach(row => {
          const oldKind = row.kind || "element";
          if (oldKind === "field") { row.kind = "data"; row.presentation = "input"; }
          else if (oldKind === "list") { row.kind = "data"; row.presentation = "list"; }
          else if (oldKind === "table") { row.kind = "data"; row.presentation = "table"; }
          else if (oldKind === "element" && row.dataRef) { row.kind = "data"; row.presentation = "displayed value"; }
          else if (oldKind === "element") row.kind = "content";
          if (row.kind === "data" && !row.presentation) row.presentation = "not yet defined";
          const definition = findData(row.dataRef);
          if (definition && ["list", "table"].includes(row.presentation)) {
            definition.cardinality = "many";
            if (definition.structure === "not yet defined" && row.presentation === "table") definition.structure = "record";
          }
          if (definition && ["displayed value", "input", "status", "metric"].includes(row.presentation)) {
            if (definition.cardinality === "not yet defined") definition.cardinality = "one";
            if (definition.structure === "not yet defined") definition.structure = "value";
          }
        });
        [page.blocks.B03, page.blocks.B04].forEach(block => Object.values(block.humanReviews).forEach(review => { review.confirmed = false; review.confirmedAt = ""; review.reviewedContentHash = ""; }));
        syncPage(page);
      });
      if (!next.changeLog.some(entry => entry.version === "0.21.0")) next.changeLog.push({ version: "0.21.0", date: new Date().toISOString(), note: "Separated business-data shape from mock presentation and made data-bound components derive their presentation from B03 definitions." });
    }
    if (previousSchemaVersion < 21) {
      Object.values(next.pages).forEach(page => {
        const priorStates = page.blocks.B05.values.states || [];
        page.blocks.B05.values.conditions = priorStates.filter(row => {
          const starter = String(row.name || "").toLowerCase() === "default"
            && String(row.when || "") === "The page opens normally"
            && String(row.sees || "") === "The default mock";
          return !starter;
        }).map(row => {
          const wasDefault = String(row.name || "").toLowerCase() === "default";
          return {
            ...row,
            _id: String(row._id || "").replace(/^STATE-/, "COND-") || row._id,
            name: wasDefault ? "Previously defined default" : row.name,
            changes: row.changes || row.sees || "",
            affected: row.affected || "",
            unavailableActions: row.unavailableActions || "",
            _note: [row._note, wasDefault ? "Review whether this differs materially from the automatic default condition." : ""].filter(Boolean).join(" · ")
          };
        });
        page.blocks.B05.values.conditions.forEach(row => { delete row.sees; });
        delete page.blocks.B05.values.states;
        delete page.blocks.B04.values.defaultState;
        [page.blocks.B04, page.blocks.B05].forEach(block => Object.values(block.humanReviews).forEach(review => { review.confirmed = false; review.confirmedAt = ""; review.reviewedContentHash = ""; }));
        syncPage(page);
      });
      if (!next.changeLog.some(entry => entry.version === "0.22.0")) next.changeLog.push({ version: "0.22.0", date: new Date().toISOString(), note: "Narrowed B05 to page-level conditions, made default automatic, and kept component behavior in B04." });
    }
    if (previousSchemaVersion < 22) {
      Object.values(next.pages).forEach(page => {
        const block = page.blocks.B08;
        const updates = block.values.liveChanges || [];
        block.values.updateExpectation = updates.length ? "information may change while the page is open" : "not yet answered";
        updates.forEach(row => {
          if (row.businessEvent == null) row.businessEvent = "";
          if (row.affected == null) row.affected = "";
          if (row.whenSeen == null) row.whenSeen = "";
          if (row.updateMethod == null) row.updateMethod = "not yet defined";
          if (row.collectionEffect == null) row.collectionEffect = "";
          if (row.staleConflict == null) row.staleConflict = "";
          if (row.resultingCondition == null) row.resultingCondition = "";
        });
        Object.values(block.humanReviews).forEach(review => { review.confirmed = false; review.confirmedAt = ""; review.reviewedContentHash = ""; });
        syncPage(page);
      });
      if (!next.changeLog.some(entry => entry.version === "0.23.0")) next.changeLog.push({ version: "0.23.0", date: new Date().toISOString(), note: "Separated externally caused updates while open from B04 interaction behavior and added an explicit B08 update expectation." });
    }
    if (previousSchemaVersion < 23) {
      if (!Array.isArray(next.app.workflows)) next.app.workflows = [];
      Object.values(next.pages).forEach(page => {
        const prior = page.blocks.B10.values.workflows || [];
        prior.forEach(row => {
          const workflowId = row.id || row._id || `WF-${String(next.app.workflows.length + 1).padStart(2, "0")}`;
          let workflow = next.app.workflows.find(candidate => candidate.id === workflowId);
          if (!workflow) {
            workflow = { id: workflowId, name: row.name || "Migrated workflow", startStepId: "", steps: [], note: "Migrated from page-level workflow text; select and connect the canonical steps." };
            next.app.workflows.push(workflow);
          }
          const stepId = `STEP-${String(workflow.steps.length + 1).padStart(2, "0")}`;
          workflow.steps.push({ id: stepId, name: row.position || page.name || "Migrated step", pageId: page.id, surfaceId: "", terminalOutcome: "", note: row.position || "", transitions: [] });
          if (!workflow.startStepId) workflow.startStepId = stepId;
        });
        delete page.blocks.B10.values.workflows;
        Object.values(page.blocks.B10.humanReviews).forEach(review => { review.confirmed = false; review.confirmedAt = ""; review.reviewedContentHash = ""; });
        syncPage(page);
      });
      if (!next.changeLog.some(entry => entry.version === "0.24.0")) next.changeLog.push({ version: "0.24.0", date: new Date().toISOString(), note: "Moved workflows to an application-level graph with stable page, surface, action, and transition references; B10 now shows generated participation." });
    }
    if (previousSchemaVersion < 24) {
      Object.values(next.pages).forEach(page => {
        const old = { ...page.blocks };
        const sourceBlocks = [old.B12, old.B13, old.B14, old.B15];
        const base = (row, type, statement, id) => ({
          _id: id || row.id || row._id,
          _status: row._status || "todo",
          _accountable: row._accountable || "",
          _note: row._note || "",
          id: id || row.id || row._id,
          type,
          statement: statement || "",
          affects: row.affects || ""
        });
        const records = [];
        (old.B12.values.decisions || []).forEach(row => records.push({ ...base(row, "decision", row.decision, row._id), decisionScope: "this page", decidedBy: row.who || "", decidedWhen: row.when || "", rationale: "", supersedes: "", decisionLifecycle: "active", appliedTo: "" }));
        (old.B13.values.observations || []).forEach(row => records.push({ ...base(row, "observation", row.observation, row._id), raisedBy: row.raisedBy || "", observedWhen: row.when || "" }));
        (old.B14.values.questions || []).forEach(row => records.push({ ...base(row, "question", row.question, row.id || row._id), questionWhy: row.why || "", blocks: row.blocks || "", answerOwner: row.who || "", neededBy: row.neededBy || "" }));
        (old.B15.values.outOfScope || []).forEach(row => records.push({ ...base(row, "scope", row.item, row._id), scopeWhy: row.why || "" }));
        const merged = old.B12;
        merged.values = { records };
        const statuses = sourceBlocks.map(block => block.status);
        merged.status = statuses.every(status => status === "done") ? "done" : statuses.every(status => status === "todo") ? "todo" : "wip";
        if (!merged.accountable) merged.accountable = sourceBlocks.map(block => block.accountable).find(Boolean) || "";
        merged.note = sourceBlocks.map(block => String(block.note || "").trim()).filter(Boolean).join(" · ");
        merged.devQa.evidence = sourceBlocks.map(block => String(block.devQa.evidence || "").trim()).filter(Boolean).join("\n");
        Object.entries(merged.humanReviews).forEach(([gateKey, review]) => {
          if (!review.reviewer) review.reviewer = sourceBlocks.map(block => block.humanReviews[gateKey].reviewer).find(Boolean) || "";
          review.confirmed = false;
          review.confirmedAt = "";
          review.reviewedContentHash = "";
        });
        page.blocks.B12 = merged;
        page.blocks.B13 = old.B16;
        delete page.blocks.B14;
        delete page.blocks.B15;
        delete page.blocks.B16;
        syncPage(page);
      });
      if (!next.changeLog.some(entry => entry.version === "0.25.0")) next.changeLog.push({ version: "0.25.0", date: new Date().toISOString(), note: "Merged decisions, observations, questions, and scope into one typed B12 honesty register and renumbered the build contract to B13." });
    }
    if (previousSchemaVersion < 25) {
      Object.values(next.pages).forEach(page => {
        const mock = page.blocks.B04.values;
        mock.panels = Array.isArray(mock.panels) ? mock.panels : [];
        mock.layout = Array.isArray(mock.layout) ? mock.layout : [];
        if (mock.layout.length && !mock.panels.length) {
          const navigationPanelId = "PNL-01";
          const contentPanelId = "PNL-02";
          mock.panels.push(
            { _id: navigationPanelId, _status: "wip", _accountable: "Page owner", _note: "Migrated from the former fixed application menu", id: navigationPanelId, name: "Application navigation", description: "Migrated application menu region", role: "application navigation", width: "2", trace: "MIGRATED" },
            { _id: contentPanelId, _status: "wip", _accountable: "Page owner", _note: "Migrated from the former fixed content area", id: contentPanelId, name: "Primary content", description: "Migrated primary content region", role: "primary content", width: "10", trace: "MIGRATED" }
          );
          mock.layout.forEach(section => { section.panelId = contentPanelId; });
          const highest = (mock.elements || []).reduce((max, row) => { const match = String(row.id || row._id || "").match(/^EL-(\d+)$/); return match ? Math.max(max, Number(match[1])) : max; }, 0);
          const sectionId = `EL-${String(highest + 1).padStart(2, "0")}`;
          const navigationId = `EL-${String(highest + 2).padStart(2, "0")}`;
          mock.elements.push(
            { _id: sectionId, _status: "wip", _accountable: "Page owner", _note: "Migrated navigation container", id: sectionId, kind: "section", name: "Application menu", shows: "", dataRef: "", presentation: "", surfaceRole: "ordinary section", navigationSource: "application pages", navigationTargets: "", trace: "MIGRATED" },
            { _id: navigationId, _status: "wip", _accountable: "Page owner", _note: "Replaces the former fixed menu", id: navigationId, kind: "navigation", name: "Application pages", shows: "", dataRef: "", presentation: "", surfaceRole: "ordinary section", navigationSource: "application pages", navigationTargets: "", trace: "MIGRATED" }
          );
          mock.layout.unshift({ uid: `SECTION-${Date.now()}-${page.id}`, recordId: sectionId, panelId: navigationPanelId, columns: 1, items: [{ recordId: navigationId }] });
        }
        (mock.elements || []).filter(row => row.kind === "section" && row.surfaceRole === "panel").forEach(row => { row.surfaceRole = "workflow section"; row._note = [row._note, "Former section-level panel role migrated to workflow section; top-level panels now use PNL IDs."].filter(Boolean).join(" · "); });
        Object.values(page.blocks.B04.humanReviews).forEach(review => { review.confirmed = false; review.confirmedAt = ""; review.reviewedContentHash = ""; });
        syncPage(page);
      });
      if (!next.changeLog.some(entry => entry.version === "0.26.0")) next.changeLog.push({ version: "0.26.0", date: new Date().toISOString(), note: "Replaced the fixed sidebar/content shell with a blank panel-first canvas and migrated existing mocks into navigation and primary-content panels." });
    }
    if (previousSchemaVersion < 26) {
      Object.values(next.pages).forEach(page => {
        const mock = page.blocks.B04.values;
        mock.rows = Array.isArray(mock.rows) ? mock.rows : [];
        mock.layout = Array.isArray(mock.layout) ? mock.layout : [];
        mock.layout.forEach(node => {
          if (!node.type) node.type = "section";
          if (!node.parentId) node.parentId = node.panelId || "canvas";
          if (!Array.isArray(node.items)) node.items = [];
        });
        const hasLayoutRegions = mock.layout.some(node => ["row", "panel"].includes(node.type));
        if (!hasLayoutRegions && (mock.panels || []).length) {
          const rowId = nextRecordId(page, "ROW");
          mock.rows.push({ _id: rowId, _status: "wip", _accountable: "Page owner", _note: "Migrated from the former panel-only canvas", id: rowId, name: "Main canvas row", description: "Migrated row containing the existing panels", role: "main area", trace: "MIGRATED" });
          mock.layout.unshift({ uid: `ROW-${Date.now()}-${page.id}`, type: "row", recordId: rowId, parentId: "canvas", items: [] });
          (mock.panels || []).forEach(panel => {
            const panelId = panel.id || panel._id;
            mock.layout.push({ uid: `PANEL-${Date.now()}-${page.id}-${panelId}`, type: "panel", recordId: panelId, parentId: rowId, items: [] });
          });
          mock.layout.forEach(node => {
            if (node.type === "section") node.parentId = node.panelId || node.parentId || (mock.panels[0] && (mock.panels[0].id || mock.panels[0]._id)) || rowId;
          });
        }
        Object.values(page.blocks.B04.humanReviews).forEach(review => { review.confirmed = false; review.confirmedAt = ""; review.reviewedContentHash = ""; });
        syncPage(page);
      });
      if (!next.changeLog.some(entry => entry.version === "0.27.0")) next.changeLog.push({ version: "0.27.0", date: new Date().toISOString(), note: "Added recursive rows and panels so the mock canvas can stack full-width bands, split panels, and nested regions in either direction." });
    }
    if (previousSchemaVersion < 27) {
      Object.values(next.pages).forEach(page => {
        const mock = page.blocks.B04.values;
        (mock.rows || []).forEach(row => { if (row.description == null) row.description = ""; });
        (mock.panels || []).forEach(panel => { if (panel.description == null) panel.description = ""; });
        syncPage(page);
      });
      if (!next.changeLog.some(entry => entry.version === "0.28.0")) next.changeLog.push({ version: "0.28.0", date: new Date().toISOString(), note: "Added row and panel descriptions plus a full-browser B04 canvas preview mode." });
    }
    if (previousSchemaVersion < 28) {
      Object.values(next.pages).forEach(page => {
        normalizeAllLayoutSizes(page);
        syncPage(page);
      });
      if (!next.changeLog.some(entry => entry.version === "0.29.0")) next.changeLog.push({ version: "0.29.0", date: new Date().toISOString(), note: "Added responsive percentage sizing and drag handles for sibling panels and rows." });
    }
    return next;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? migrateState(JSON.parse(raw)) : createInitialState();
    } catch (error) {
      console.warn("Could not read local Mockument state", error);
      return createInitialState();
    }
  }

  let state = loadState();
  let templatePreview = null;
  saveState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function templatePage() {
    if (templatePreview) return templatePreview;
    const page = createPage("template", "Template", "/template", true, false);
    page.blocks.B01.values.name = "Template";
    page.blocks.B01.values.route = "/template";
    page.blocks.B01.values.updated = "";
    page.blocks.B01.values.owner = "";
    page.blocks.B01.values.activity = "";
    templatePreview = page;
    return templatePreview;
  }

  function activePage() {
    return state.activePageId === "template" ? templatePage() : state.pages[state.activePageId];
  }

  function slugify(value) {
    return String(value || "page").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
  }

  function uniqueId(base) {
    let id = base;
    let number = 2;
    while (state.pages[id]) id = `${base}-${number++}`;
    return id;
  }

  function statusLabel(status) {
    return status === "done" ? "Done" : status === "wip" ? "WIP" : "To Do";
  }

  function statusSelect(value, attributes, disabled) {
    return `<select ${attributes} ${disabled ? "disabled" : ""} aria-label="Work status">
      ${["todo", "wip", "done"].map(status => `<option value="${status}" ${value === status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}
    </select>`;
  }

  function reviewerSelect(value, attributes = "", disabled = false) {
    const reviewers = (state.app.reviewers || []).map(name => String(name).trim()).filter(Boolean);
    const selectedIsMissing = value && !reviewers.includes(value);
    const options = [...reviewers, ...(selectedIsMissing ? [value] : [])];
    return `<select ${attributes} ${disabled ? "disabled" : ""}><option value="">${reviewers.length ? "Select person" : "Add people in Settings"}</option>${options.map(name => `<option value="${esc(name)}" ${value === name ? "selected" : ""}>${esc(name)}${!reviewers.includes(name) ? " (not in Settings)" : ""}</option>`).join("")}</select>`;
  }

  function renderMenu() {
    const menu = $("#app-menu");
    const roots = state.pageOrder.map(id => state.pages[id]).filter(page => page && !page.parentId && !page.isSettings);
    const settings = state.pages.settings;
    const item = page => {
      const children = state.pageOrder.map(id => state.pages[id]).filter(child => child && child.parentId === page.id);
      return `<div class="menu-item-wrap">
        <button class="menu-link ${state.activePageId === page.id ? "is-active" : ""}" data-open-page="${esc(page.id)}" type="button">
          <span class="menu-icon">${esc(page.name.slice(0, 1).toUpperCase())}</span>
          <span class="menu-copy"><strong>${esc(page.name)}</strong><small>${page.built ? esc(page.route) : "not drawn"}</small></span>
          ${children.length ? `<span class="menu-caret">${children.length}</span>` : ""}
        </button>
        ${children.length ? `<div class="submenu">${children.map(child => `<button class="menu-link ${state.activePageId === child.id ? "is-active" : ""}" data-open-page="${esc(child.id)}" type="button"><span class="menu-copy"><strong>${esc(child.name)}</strong><small>${child.built ? esc(child.route) : "not drawn"}</small></span></button>`).join("")}</div>` : ""}
      </div>`;
    };
    menu.innerHTML = `<div class="menu-section-title">Pages of the system</div>
      ${roots.length ? roots.map(item).join("") : `<div class="form-help" style="padding:8px">Copy Template to create the first page.</div>`}
      ${settings ? item(settings) : ""}`;
    $("#template-link").classList.toggle("is-active", state.activePageId === "template");
    $("#app-name-small").textContent = state.app.name || "Application Name";
  }

  function blockRows(definition, block) {
    const rows = [];
    definition.fields.filter(field => field.type === "rows").forEach(field => (block.values[field.key] || []).forEach(row => rows.push(row)));
    return rows;
  }

  function buildValidation(definition, block, page) {
    const missing = [];
    const value = key => String(block.values[key] || "").trim();
    const rows = blockRows(definition, block);
    if (block.status !== "done") missing.push(`block is ${statusLabel(block.status)}`);
    const unresolvedRows = rows.filter(row => row._status !== "done");
    if (unresolvedRows.length) missing.push(`${unresolvedRows.length} register row${unresolvedRows.length === 1 ? " is" : "s are"} not done`);

    if (definition.id === "B01") ["name", "activity", "route", "owner"].forEach(key => { if (!value(key)) missing.push(`${key} is missing`); });
    if (definition.id === "B02" && !(block.values.roles || []).some(row => String(row.role || "").trim())) missing.push("no user role is recorded");
    if (definition.id === "B03") {
      const definitions = block.values.data || [];
      const belowL2 = definitions.filter(row => !["L2 sourced", "L3 verified"].includes(row.rung)).length;
      const unshaped = definitions.filter(row => !["one", "many"].includes(row.cardinality) || !["value", "record"].includes(row.structure)).length;
      if (belowL2) missing.push(`${belowL2} data definition${belowL2 === 1 ? " is" : "s are"} below L2`);
      if (unshaped) missing.push(`${unshaped} data definition${unshaped === 1 ? " has" : "s have"} unresolved cardinality or structure`);
    }
    if (definition.id === "B04") {
      const rows = block.values.rows || [];
      const panels = block.values.panels || [];
      const layout = block.values.layout || [];
      const regionNodes = layout.filter(node => ["row", "panel"].includes(node.type));
      const sectionNodes = layout.filter(node => (node.type || "section") === "section");
      const regionIds = new Set(["canvas", ...rows.map(row => row.id || row._id), ...panels.map(panel => panel.id || panel._id)]);
      if (!regionNodes.length) missing.push("mock canvas has no rows or panels");
      if (!panels.length) missing.push("mock canvas has no panels");
      if (!sectionNodes.length) missing.push("mock canvas has no content sections");
      const brokenNodes = layout.filter(node => !regionIds.has(node.parentId || node.panelId || "canvas")).length;
      if (brokenNodes) missing.push(`${brokenNodes} layout node${brokenNodes === 1 ? " references" : "s reference"} a missing parent`);
      const untracedRows = rows.filter(row => !String(row.trace || "").trim()).length;
      const untracedPanels = panels.filter(panel => !String(panel.trace || "").trim()).length;
      if (untracedRows) missing.push(`${untracedRows} row${untracedRows === 1 ? " is" : "s are"} untraced`);
      if (untracedPanels) missing.push(`${untracedPanels} panel${untracedPanels === 1 ? " is" : "s are"} untraced`);
      const elements = block.values.elements || [];
      if (!elements.some(row => row.kind !== "section")) missing.push("no visible component is recorded");
      const untraced = elements.filter(row => row.kind !== "section" && !String(row.trace || "").trim()).length;
      if (untraced) missing.push(`${untraced} visible component${untraced === 1 ? " is" : "s are"} untraced`);
      const definitions = page.blocks.B03.values.data || [];
      const dataComponents = elements.filter(row => row.kind === "data");
      const unlinked = dataComponents.filter(row => !row.dataRef || row.dataRef === "Not yet defined" || !definitions.some(definition => (definition.id || definition._id) === row.dataRef)).length;
      const incompatible = dataComponents.filter(row => {
        const data = definitions.find(definition => (definition.id || definition._id) === row.dataRef);
        if (!data || !row.presentation || row.presentation === "not yet defined") return true;
        if (data.cardinality === "many") return !["list", "table"].includes(row.presentation);
        if (data.cardinality === "one" && data.structure === "value") return !["displayed value", "input", "status", "metric"].includes(row.presentation);
        if (data.cardinality === "one" && data.structure === "record") return !["summary", "details", "form"].includes(row.presentation);
        return true;
      }).length;
      const incompleteLists = dataComponents.filter(row => row.presentation === "list" && !String(row.itemTemplate || "").trim()).length;
      const incompleteTables = dataComponents.filter(row => row.presentation === "table" && !String(row.columns || "").trim()).length;
      if (unlinked) missing.push(`${unlinked} data-bound component${unlinked === 1 ? " has" : "s have"} no resolved data definition`);
      if (incompatible) missing.push(`${incompatible} data-bound component${incompatible === 1 ? " has" : "s have"} no valid presentation for its data shape`);
      if (incompleteLists) missing.push(`${incompleteLists} list${incompleteLists === 1 ? " has" : "s have"} no item definition`);
      if (incompleteTables) missing.push(`${incompleteTables} table${incompleteTables === 1 ? " has" : "s have"} no column definition`);
    }
    if (definition.id === "B05") {
      const incomplete = (block.values.conditions || []).filter(row => !String(row.name || "").trim() || !String(row.when || "").trim() || !String(row.changes || "").trim()).length;
      if (incomplete) missing.push(`${incomplete} page condition${incomplete === 1 ? " is" : "s are"} missing its name, cause, or change from default`);
    }
    if (definition.id === "B07" && !value("remembered")) missing.push("remembered behavior is missing");
    if (definition.id === "B08") {
      const expectation = value("updateExpectation");
      const updates = block.values.liveChanges || [];
      if (!expectation || expectation === "not yet answered") missing.push("update expectation is unanswered");
      if (expectation === "nothing changes unless the person acts or refreshes" && updates.length) missing.push("update records contradict the no-change expectation");
      if (expectation === "information may change while the page is open") {
        if (!updates.length) missing.push("no externally caused update is defined");
        const incomplete = updates.filter(row => !String(row.change || "").trim() || !String(row.businessEvent || "").trim() || !String(row.affected || "").trim() || !String(row.whenSeen || "").trim() || !row.updateMethod || row.updateMethod === "not yet defined" || !String(row.howTold || "").trim() || !String(row.midAction || "").trim() || !String(row.staleConflict || "").trim()).length;
        if (incomplete) missing.push(`${incomplete} update record${incomplete === 1 ? " is" : "s are"} missing its event, affected records, timing, notification, or conflict behavior`);
      }
    }
    if (definition.id === "B10") {
      const participating = (state.app.workflows || []).filter(workflow => (workflow.steps || []).some(step => step.pageId === page.id));
      const issueCount = participating.reduce((count, workflow) => count + workflowIssues(workflow).length, 0);
      if (issueCount) missing.push(`${issueCount} application workflow graph issue${issueCount === 1 ? " affects" : "s affect"} this page`);
    }
    if (definition.id === "B12") {
      const records = block.values.records || [];
      const incomplete = records.filter(row => {
        if (!String(row.statement || "").trim()) return true;
        if (row.type === "decision") return !row.decidedBy || !row.decidedWhen || !row.decisionScope || !row.decisionLifecycle || (row.decisionLifecycle === "active" && !String(row.appliedTo || "").trim());
        if (row.type === "observation") return !row.raisedBy || !row.observedWhen;
        if (row.type === "question") return !row.questionWhy || !row.blocks || !row.answerOwner;
        if (row.type === "scope") return !row.scopeWhy;
        return true;
      }).length;
      if (incomplete) missing.push(`${incomplete} honesty record${incomplete === 1 ? " is" : "s are"} missing required type-specific information`);
    }
    if (definition.id === "B13") {
      if (!value("must")) missing.push("build instructions are missing");
      if (!value("mustNotInvent")) missing.push("do-not-invent constraints are missing");
      if (!value("acceptance")) missing.push("acceptance criteria are missing");
      if (value("askFirst")) missing.push("stop-and-ask items remain");
    }
    return missing;
  }

  function calculateBlockReadiness(page) {
    const result = {};
    const data = page.blocks.B03.values.data || [];
    const elements = page.blocks.B04.values.elements || [];
    const controls = page.blocks.B04.values.controls || [];
    const roles = page.blocks.B02.values.roles || [];
    const conditions = page.blocks.B05.values.conditions || [];
    const questions = (page.blocks.B12.values.records || []).filter(row => row.type === "question");
    const walkIds = new Set(["B01", "B02", "B03", "B04", "B05", "B12"]);

    BLOCKS.forEach(definition => {
      const block = page.blocks[definition.id];
      const rows = blockRows(definition, block);
      let walk = { state: "na", reason: "Not required for the initial walk-through." };
      if (walkIds.has(definition.id)) {
        const missing = [];
        if (definition.id === "B01" && !String(block.values.activity || "").trim()) missing.push("business activity");
        if (definition.id === "B02" && !roles.some(row => String(row.role || "").trim())) missing.push("user role");
        if (definition.id === "B03" && data.some(row => !String(row.name || "").trim())) missing.push("data definition name");
        if (definition.id === "B04") {
          if (!(block.values.layout || []).some(node => ["row", "panel"].includes(node.type))) missing.push("mock row or panel");
          if (!(block.values.panels || []).length) missing.push("mock panel");
          if (!(block.values.layout || []).some(node => (node.type || "section") === "section")) missing.push("content section");
          if (!elements.some(row => row.kind !== "section" && String(row.name || "").trim())) missing.push("visible component");
          if (elements.some(row => !["done", "wip", "todo"].includes(row._status))) missing.push("component work status");
          if (controls.some(row => !["done", "wip", "todo"].includes(row._status))) missing.push("control work status");
        }
        if (definition.id === "B05" && conditions.some(row => !String(row.name || "").trim())) missing.push("unnamed page condition");
        if (definition.id === "B12" && questions.some(row => String(row.statement || "").trim() && !String(row.answerOwner || "").trim())) missing.push("question owner");
        walk = missing.length ? { state: "missing", reason: `Missing ${missing.join(", ")}.` } : { state: "ready", reason: "This block has enough information for a walk-through." };
      }

      const blockOwned = block.status === "done" || Boolean(String(block.accountable || "").trim());
      const ownerlessRows = rows.filter(row => row._status !== "done" && !String(row._accountable || "").trim() && !(definition.id === "B02" && block.accountable));
      const mockQa = blockOwned && !ownerlessRows.length
        ? { state: "ready", reason: block.status === "done" ? "The block is done." : "The unfinished block and its rows name who must complete or accept them." }
        : { state: "missing", reason: `${!blockOwned ? "The block has no named owner. " : ""}${ownerlessRows.length ? `${ownerlessRows.length} unresolved row${ownerlessRows.length === 1 ? " has" : "s have"} no named owner.` : ""}`.trim() };

      const buildMissing = buildValidation(definition, block, page);
      let build;
      if (!buildMissing.length) build = { state: "ready", reason: "This block is done and passes its build checks." };
      else if (block.status !== "done" && (block.accountable || rows.some(row => row._accountable))) build = { state: "warning", reason: buildMissing.join("; ") + "." };
      else build = { state: "missing", reason: buildMissing.join("; ") + "." };

      let devQa;
      if (build.state !== "ready") devQa = { state: "na", reason: "Not reached: this block is not ready to build." };
      else if (String(block.devQa.evidence || "").trim()) devQa = { state: "ready", reason: "Implementation evidence is recorded and ready for Development QA." };
      else devQa = { state: "missing", reason: "Build-ready, but implementation evidence is missing." };

      result[definition.id] = { walk, mockQa, build, devQa };
    });
    return result;
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    return JSON.stringify(value == null ? null : value);
  }

  function blockContentFingerprint(block, gateKey = "") {
    const content = {
      status: block.status,
      accountable: block.accountable,
      note: block.note,
      values: block.values
    };
    if (gateKey === "devQa") content.implementationEvidence = block.devQa.evidence;
    const text = stableStringify(content);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function calculateHumanReadiness(page, aiStatuses = calculateBlockReadiness(page)) {
    const result = {};
    BLOCKS.forEach(definition => {
      const block = page.blocks[definition.id];
      result[definition.id] = {};
      ["walk", "mockQa", "build", "devQa"].forEach(gateKey => {
        const ai = aiStatuses[definition.id][gateKey];
        const review = block.humanReviews[gateKey];
        if (ai.state === "na") result[definition.id][gateKey] = { state: "na", reason: "Not applicable at this AI stage." };
        else if (review.confirmed && review.reviewedContentHash !== blockContentFingerprint(block, gateKey)) result[definition.id][gateKey] = { state: "warning", reason: `The confirmation by ${review.reviewer || "an unnamed reviewer"} is stale because the block changed.` };
        else if (ai.state !== "ready") result[definition.id][gateKey] = { state: "na", reason: "Human review is unavailable until the AI stage is ready." };
        else if (review.confirmed && review.reviewer && review.reviewedContentHash === blockContentFingerprint(block, gateKey)) result[definition.id][gateKey] = { state: "ready", reason: `Confirmed by ${review.reviewer}${review.confirmedAt ? ` on ${new Date(review.confirmedAt).toLocaleString()}` : ""}.` };
        else if (review.reviewer) result[definition.id][gateKey] = { state: "warning", reason: `${review.reviewer} is selected but has not confirmed the review.` };
        else result[definition.id][gateKey] = { state: "missing", reason: "Select a reviewer and confirm the review." };
      });
    });
    return result;
  }

  const READINESS_GATES = [
    { key: "walk", short: "W", name: "Ready to walk through" },
    { key: "mockQa", short: "M", name: "Ready for Mockument QA" },
    { key: "build", short: "B", name: "Ready to build" },
    { key: "devQa", short: "D", name: "Ready for Dev QA" }
  ];

  function readinessSummary(statuses, gateKey) {
    const applicable = BLOCKS.map(block => statuses[block.id][gateKey]).filter(status => status.state !== "na");
    const ready = applicable.filter(status => status.state === "ready").length;
    return { ready, total: applicable.length, pass: applicable.length > 0 && ready === applicable.length };
  }

  function renderReadiness(page) {
    const statuses = calculateBlockReadiness(page);
    return `<div class="readiness">${READINESS_GATES.map(gate => {
      const summary = readinessSummary(statuses, gate.key);
      const note = summary.total ? `${summary.ready} of ${summary.total} applicable blocks ready. See the ${gate.short} status line above each block.` : "No blocks have reached this stage yet.";
      return `<button class="gate gate--${summary.pass ? "pass" : "fail"} ${activeGateFilter === gate.key ? "is-active" : ""}" data-gate-filter="${gate.key}" type="button"><strong>${esc(gate.name)} · ${summary.pass ? "Yes" : "Not yet"}</strong><span>${esc(note)}</span></button>`;
    }).join("")}</div>`;
  }

  function fieldInput(field, value, blockId, disabled, rowIndex = null, rowKey = null) {
    const attributes = `data-value-input data-block="${blockId}" data-field="${field.key}"${rowIndex == null ? "" : ` data-row="${rowIndex}" data-row-key="${rowKey}"`}`;
    const common = `${attributes} ${disabled ? "disabled" : ""}`;
    if (field.type === "textarea") return `<textarea ${common} rows="${field.rows || 3}" placeholder="${esc(field.placeholder || "")}">${esc(value || "")}</textarea>`;
    if (field.type === "select") return `<select ${common}>${field.choices.map(choice => `<option value="${esc(choice)}" ${value === choice ? "selected" : ""}>${esc(choice)}</option>`).join("")}</select>`;
    return `<input ${common} type="${field.inputType || "text"}" value="${esc(value || "")}" placeholder="${esc(field.placeholder || "")}">`;
  }

  function renderSimpleField(field, value, blockId, disabled) {
    return `<label class="field ${field.type === "textarea" ? "field--wide" : ""}" data-inspect-field="${field.key}" data-block="${blockId}">
      <span>${esc(field.label)}${field.required ? " *" : ""}</span>
      ${fieldInput(field, value, blockId, disabled)}
      <small class="field-question">${esc(field.question)}</small>
    </label>`;
  }

  function newRow(field, index) {
    const row = { _id: `${field.idPrefix || "ROW"}-${String(index + 1).padStart(2, "0")}`, _status: "todo", _accountable: "", _note: "" };
    field.fields.forEach(column => { row[column.key] = column.default || (column.type === "select" ? column.choices[0] : ""); });
    if (field.fields.some(column => column.key === "id")) row.id = row._id;
    return row;
  }

  function renderRepeater(field, rows, blockId, disabled) {
    if (field.compact) return `<div class="repeater repeater--compact" data-inspect-field="${field.key}" data-block="${blockId}">
      <div class="repeater-head"><div><strong>${esc(field.label)}</strong><span>${esc(field.question)}</span></div><button class="button button--small" data-add-row data-block="${blockId}" data-field="${field.key}" type="button" ${disabled ? "disabled" : ""}>+ Add data definition</button></div>
      ${rows.length ? `<div class="compact-records">${rows.map((row, index) => `<div class="compact-record" data-inspect-row data-record-id="${esc(row.id || row._id)}" data-block="${blockId}" data-field="${field.key}" data-row="${index}"><span class="row-id">${esc(row.id || row._id)}</span><strong>${esc(field.key === "data" ? (row.name || "Unnamed data") : (row.statement || "Empty record"))}</strong><small>${esc(field.key === "data" ? `${row.cardinality || "?"} ${row.structure || "?"} · ${row.meaning || "Meaning not yet defined"}` : `${row.type || "?"}${row.affects ? ` · ${row.affects}` : ""}`)}</small><span class="status-chip status--${esc(row._status || "todo")}">${esc(statusLabel(row._status || "todo"))}</span><button class="remove-row" data-remove-row data-block="${blockId}" data-field="${field.key}" data-row="${index}" type="button" ${disabled ? "disabled" : ""}>Remove</button></div>`).join("")}</div>` : `<div class="repeater-empty">No data definitions yet. Add one here or create one while specifying a mock field.</div>`}
    </div>`;
    return `<div class="repeater" data-inspect-field="${field.key}" data-block="${blockId}">
      <div class="repeater-head"><div><strong>${esc(field.label)}</strong><span>${esc(field.question)}</span></div><button class="button button--small" data-add-row data-block="${blockId}" data-field="${field.key}" type="button" ${disabled ? "disabled" : ""}>+ Add</button></div>
      ${rows.length ? rows.map((row, index) => `<div class="repeater-row" data-inspect-row data-block="${blockId}" data-field="${field.key}" data-row="${index}">
        <div class="row-head"><span class="row-id">${esc(row._id || `${field.idPrefix}-${index + 1}`)}</span>${statusSelect(row._status || "todo", `data-row-status data-block="${blockId}" data-field="${field.key}" data-row="${index}"`, disabled)}<button class="remove-row" data-remove-row data-block="${blockId}" data-field="${field.key}" data-row="${index}" type="button" ${disabled ? "disabled" : ""}>Remove</button></div>
        <div class="row-fields">${field.fields.map(column => `<label class="field ${column.type === "textarea" ? "field--wide" : ""}"><span>${esc(column.label)}</span>${fieldInput(column, row[column.key], blockId, disabled, index, field.key)}<small class="field-question">${esc(column.question)}</small></label>`).join("")}</div>
        <div class="row-accountability ${blockId === "B02" ? "row-accountability--single" : ""}">
          ${blockId === "B02" ? "" : `<label class="field"><span>Who must answer or accept</span><input data-row-meta="accountable" data-block="${blockId}" data-field="${field.key}" data-row="${index}" value="${esc(row._accountable || "")}" ${disabled ? "disabled" : ""}></label>`}
          <label class="field"><span>Status note</span><input data-row-meta="note" data-block="${blockId}" data-field="${field.key}" data-row="${index}" value="${esc(row._note || "")}" ${disabled ? "disabled" : ""}></label>
        </div>
      </div>`).join("") : `<div class="repeater-empty">Nothing recorded yet. An empty register is a visible question.</div>`}
    </div>`;
  }

  function mockRecord(page, recordId) {
    const found = findRecord(page, recordId);
    return found ? found.row : null;
  }

  function renderMockItem(page, item) {
    const row = mockRecord(page, item.recordId);
    if (!row) return `<div class="mock-element status--todo" data-mock-record="${esc(item.recordId)}"><div class="mock-label">${esc(item.recordId)}</div><div class="mock-name">Missing specification record</div></div>`;
    const id = row.id || row._id;
    const kind = id.startsWith("CTL-") ? "action" : (row.kind || "content");
    const presentation = row.presentation || "";
    const showIds = ["IDs", "honesty + IDs"].includes(mockChoice.reviewMode);
    const showHonesty = ["honesty", "honesty + IDs"].includes(mockChoice.reviewMode);
    const metadata = [showIds ? `${id} · ${kind === "data" && presentation ? presentation : kind}` : "", showHonesty ? statusLabel(row._status) : ""].filter(Boolean).join(" · ");
    const label = metadata ? `<div class="mock-label">${esc(metadata)}</div>` : "";
    if (kind === "action") return `<button class="mock-control status--${esc(row._status || "todo")}" type="button" data-mock-record="${esc(id)}">${esc(row.name || "Unnamed action")}${metadata ? `<small class="mock-inline-meta">${esc(metadata)}</small>` : ""}</button>`;
    if (kind === "data" && presentation === "input") return `<div class="mock-element mock-element--field status--${esc(row._status || "todo")}" data-mock-record="${esc(id)}">${label}<div class="mock-name">${esc(row.name || "Unnamed input")}</div><div class="mock-input">${esc(row.shows || "Value")}</div></div>`;
    if (kind === "data" && presentation === "list") return `<div class="mock-element status--${esc(row._status || "todo")}" data-mock-record="${esc(id)}">${label}<div class="mock-name">${esc(row.name || "Unnamed list")}</div><div class="mock-lines"><i></i><i></i><i></i></div></div>`;
    if (kind === "data" && presentation === "table") return `<div class="mock-element status--${esc(row._status || "todo")}" data-mock-record="${esc(id)}">${label}<div class="mock-name">${esc(row.name || "Unnamed table")}</div><div class="mock-table"><i></i><i></i><i></i><i></i><i></i><i></i></div></div>`;
    if (kind === "navigation") {
      let destinations = [];
      if (row.navigationSource === "application pages") destinations = state.pageOrder.map(pageId => state.pages[pageId]).filter(Boolean).map(candidate => candidate.name);
      else if (row.navigationSource === "current-page surfaces") destinations = [
        ...(page.blocks.B04.values.rows || []).map(candidate => candidate.name || candidate.id || candidate._id),
        ...(page.blocks.B04.values.panels || []).map(candidate => candidate.name || candidate.id || candidate._id),
        ...(page.blocks.B04.values.elements || []).filter(candidate => candidate.kind === "section").map(candidate => candidate.name || candidate.id || candidate._id)
      ];
      else if (row.navigationSource === "workflow steps") destinations = (state.app.workflows || []).flatMap(workflow => (workflow.steps || []).filter(step => step.pageId === page.id).map(step => `${workflow.name || workflow.id} · ${step.name || step.id}`));
      else destinations = String(row.navigationTargets || "").split("\n").map(value => value.trim()).filter(Boolean);
      return `<nav class="mock-element mock-element--navigation status--${esc(row._status || "todo")}" data-mock-record="${esc(id)}">${label}<div class="mock-name">${esc(row.name || "Navigation")}</div><div class="mock-navigation-items">${destinations.length ? destinations.map(destination => `<span>${esc(destination)}</span>`).join("") : `<small>No destinations selected</small>`}</div></nav>`;
    }
    if (kind === "notice") return `<div class="mock-element mock-element--notice status--${esc(row._status || "todo")}" data-mock-record="${esc(id)}">${label}<div class="mock-name">${esc(row.name || "Notice")}</div>${row.shows ? `<div>${esc(row.shows)}</div>` : ""}</div>`;
    return `<div class="mock-element status--${esc(row._status || "todo")}" data-mock-record="${esc(id)}">${label}<div class="mock-name">${esc(row.name || "Unnamed element")}</div>${row.shows ? `<div>${esc(row.shows)}</div>` : ""}</div>`;
  }

  function renderMockComposer(page, disabled) {
    const mock = page.blocks.B04.values;
    const layout = mock.layout || [];
    const recordForNode = node => node.type === "row" ? (mock.rows || []).find(row => (row.id || row._id) === node.recordId) : node.type === "panel" ? (mock.panels || []).find(panel => (panel.id || panel._id) === node.recordId) : mockRecord(page, node.recordId);
    const childNodes = parentId => layout.filter(node => (node.parentId || node.panelId || "canvas") === parentId);
    const renderAddLayout = parentId => `<div class="composer-add-layout"><button class="button button--small" data-add-row-region="${esc(parentId)}" type="button" ${disabled ? "disabled" : ""}>+ Row</button><button class="button button--small" data-add-panel-region="${esc(parentId)}" type="button" ${disabled ? "disabled" : ""}>+ Panel</button><button class="button button--small" data-add-section data-parent-id="${esc(parentId)}" type="button" ${disabled ? "disabled" : ""}>+ Content section</button></div>`;
    const renderSection = (node, siblings) => {
      const sectionIndex = layout.indexOf(node);
      const localIndex = siblings.indexOf(node);
      const row = recordForNode(node) || {};
      return `<div class="composer-section" data-mock-record="${esc(node.recordId)}">
        <div class="composer-section-head"><span class="row-id">${esc(node.recordId)}</span><strong>${esc(row.name || "Unnamed content section")}</strong>
          <label>Inner columns <select data-section-columns data-section="${sectionIndex}" ${disabled ? "disabled" : ""}>${[1,2,3].map(number => `<option value="${number}" ${Number(node.columns) === number ? "selected" : ""}>${number}</option>`).join("")}</select></label>
          <button class="composer-move" data-move-layout="up" data-layout-index="${sectionIndex}" type="button" ${disabled || localIndex === 0 ? "disabled" : ""}>↑</button>
          <button class="composer-move" data-move-layout="down" data-layout-index="${sectionIndex}" type="button" ${disabled || localIndex === siblings.length - 1 ? "disabled" : ""}>↓</button>
          <button class="remove-row" data-remove-layout data-layout-index="${sectionIndex}" type="button" ${disabled ? "disabled" : ""}>Remove</button>
        </div>
        <div class="composer-items">${(node.items || []).map((item, itemIndex) => {
          const itemRow = mockRecord(page, item.recordId) || {};
          return `<div class="composer-item" data-mock-record="${esc(item.recordId)}"><span class="row-id">${esc(item.recordId)}</span><strong>${esc(itemRow.name || "Missing record")}</strong><small>${esc(item.recordId.startsWith("CTL-") ? "action" : (itemRow.kind || "component"))}</small><span class="composer-item-actions"><button data-move-item="up" data-section="${sectionIndex}" data-item="${itemIndex}" type="button" ${disabled || itemIndex === 0 ? "disabled" : ""}>←</button><button data-move-item="down" data-section="${sectionIndex}" data-item="${itemIndex}" type="button" ${disabled || itemIndex === node.items.length - 1 ? "disabled" : ""}>→</button><button data-remove-item data-section="${sectionIndex}" data-item="${itemIndex}" type="button" ${disabled ? "disabled" : ""}>×</button></span></div>`;
        }).join("") || `<div class="repeater-empty">This content section is empty.</div>`}</div>
        <div class="composer-add"><select data-new-item-type ${disabled ? "disabled" : ""}><option value="content">Static content</option><option value="data">Data-bound component</option><option value="navigation">Navigation</option><option value="notice">Notice</option><option value="action">Action</option></select><button class="button button--small" data-add-item data-section="${sectionIndex}" type="button" ${disabled ? "disabled" : ""}>Add to section</button></div>
      </div>`;
    };
    const renderNode = (node, siblings, depth = 0) => {
      const layoutIndex = layout.indexOf(node);
      const localIndex = siblings.indexOf(node);
      const type = node.type || "section";
      if (type === "section") return renderSection(node, siblings);
      const row = recordForNode(node) || {};
      const id = node.recordId;
      const children = childNodes(id);
      const isPanel = type === "panel";
      const panelIndex = isPanel ? (mock.panels || []).findIndex(panel => (panel.id || panel._id) === id) : -1;
      const description = String(row.description || "").trim();
      return `<div class="composer-region composer-region--${esc(type)}" data-mock-record="${esc(id)}" style="--composer-depth:${depth}">
        <div class="composer-region-head"><span class="row-id">${esc(type === "row" ? "Row" : "Panel")} · ${esc(id)}</span><strong>${esc(row.name || (type === "row" ? "Unnamed row" : "Unnamed panel"))}</strong>${description ? `<span class="composer-region-description">${esc(description)}</span>` : ""}<small>${esc(row.role || "custom")}</small><label>Size % <input class="composer-size-input" data-layout-size data-layout-index="${layoutIndex}" value="${esc(node.sizePercent || "")}" placeholder="auto" ${disabled ? "disabled" : ""}></label><button class="composer-move" data-move-layout="up" data-layout-index="${layoutIndex}" type="button" ${disabled || localIndex === 0 ? "disabled" : ""}>↑</button><button class="composer-move" data-move-layout="down" data-layout-index="${layoutIndex}" type="button" ${disabled || localIndex === siblings.length - 1 ? "disabled" : ""}>↓</button><button class="remove-row" data-remove-layout data-layout-index="${layoutIndex}" type="button" ${disabled ? "disabled" : ""}>Remove ${esc(type)}</button></div>
        <div class="composer-region-body">${children.length ? renderChildren(id, depth + 1) : `<div class="repeater-empty">This ${esc(type)} has no rows, panels, or content sections.</div>`}${renderAddLayout(id)}</div>
      </div>`;
    };
    const renderChildren = (parentId, depth = 0) => {
      const children = childNodes(parentId);
      return children.map(node => renderNode(node, children, depth)).join("");
    };
    const rootChildren = childNodes("canvas");
    return `<div class="composer composer--regions">
      <div class="composer-head"><div><strong>Flexible mock composer</strong><span>Start with a blank canvas. Add rows and panels in either direction, then add content sections and components.</span></div><div class="composer-head-actions"><button class="button button--small" data-add-row-region="canvas" type="button" ${disabled ? "disabled" : ""}>+ Row</button><button class="button button--small" data-add-panel-region="canvas" type="button" ${disabled ? "disabled" : ""}>+ Panel</button></div></div>
      ${rootChildren.length ? `<div class="composer-tree">${renderChildren("canvas")}</div>` : `<div class="canvas-empty"><strong>Blank canvas</strong><span>Add a row for a full-width band, or add panels directly for a split screen.</span><div><button class="button button--primary" data-add-row-region="canvas" type="button" ${disabled ? "disabled" : ""}>+ Add first row</button> <button class="button" data-add-panel-region="canvas" type="button" ${disabled ? "disabled" : ""}>+ Add first panel</button></div></div>`}
    </div>`;
  }

  function renderMock(page, disabled) {
    const roles = (page.blocks.B02.values.roles || []).map(row => row.role).filter(Boolean);
    const conditions = page.blocks.B05.values.conditions || [];
    const conditionNames = ["default", ...conditions.map(row => row.name).filter(name => name && String(name).toLowerCase() !== "default")];
    const mock = page.blocks.B04.values;
    const layout = mock.layout || [];
    if (roles.length && !roles.includes(mockChoice.role)) mockChoice.role = roles[0];
    if (!conditionNames.includes(mockChoice.state)) mockChoice.state = "default";
    const activeCondition = conditions.find(row => row.name === mockChoice.state);
    const conditionNote = activeCondition ? `<div class="mock-condition"><strong>${esc(activeCondition.name)}</strong><span>${esc(activeCondition.changes || "Change from default not yet defined.")}</span>${activeCondition.affected ? `<small>Affects ${esc(activeCondition.affected)}</small>` : ""}${activeCondition.unavailableActions ? `<small>Unavailable: ${esc(activeCondition.unavailableActions)}</small>` : ""}${activeCondition.next ? `<small>Next: ${esc(activeCondition.next)}</small>` : ""}</div>` : "";
    const segment = (name, values, current) => `<div class="segment">${values.map(value => `<button type="button" data-mock-choice="${name}" data-value="${esc(value)}" class="${value === current ? "is-on" : ""}">${esc(value)}</button>`).join("")}</div>`;
    const showIds = ["IDs", "honesty + IDs"].includes(mockChoice.reviewMode);
    const showHonesty = ["honesty", "honesty + IDs"].includes(mockChoice.reviewMode);
    const childNodes = parentId => layout.filter(node => (node.parentId || node.panelId || "canvas") === parentId);
    const recordForNode = node => node.type === "row" ? (mock.rows || []).find(row => (row.id || row._id) === node.recordId) : node.type === "panel" ? (mock.panels || []).find(panel => (panel.id || panel._id) === node.recordId) : mockRecord(page, node.recordId);
    const renderSectionNode = node => {
      const row = recordForNode(node) || {};
      const sectionMetadata = [showIds ? node.recordId : "", showHonesty ? statusLabel(row._status) : ""].filter(Boolean).join(" · ");
      return `<section class="mock-layout-section status--${esc(row._status || "todo")}" data-mock-record="${esc(node.recordId)}"><div class="mock-layout-title">${sectionMetadata ? `<span>${esc(sectionMetadata)}</span>` : ""}${esc(row.name || "Unnamed content section")}</div><div class="mock-layout-grid" style="--mock-columns:${Number(node.columns) || 1}">${(node.items || []).map(item => renderMockItem(page, item)).join("") || `<div class="mock-empty">Empty section</div>`}</div></section>`;
    };
    const renderPanelNode = (node, panelIndex) => {
      const panel = recordForNode(node) || {};
      const panelId = node.recordId;
      const panelMetadata = [showIds ? `Panel ${panelIndex + 1} · ${panelId}` : "", showHonesty ? statusLabel(panel._status) : ""].filter(Boolean).join(" · ");
      const description = String(panel.description || "").trim();
      return `<section class="mock-panel status--${esc(panel._status || "todo")}" data-mock-record="${esc(panelId)}"><div class="mock-panel-title">${panelMetadata ? `<span>${esc(panelMetadata)}</span>` : ""}<strong>${esc(panel.name || "Unnamed panel")}</strong>${description ? `<p>${esc(description)}</p>` : ""}<small>${esc(panel.role || "custom")}</small></div><div class="mock-panel-content">${renderLayoutChildren(panelId) || `<div class="mock-empty">Empty panel</div>`}</div></section>`;
    };
    const renderRowNode = node => {
      const row = recordForNode(node) || {};
      const rowMetadata = [showIds ? node.recordId : "", showHonesty ? statusLabel(row._status) : ""].filter(Boolean).join(" · ");
      const description = String(row.description || "").trim();
      return `<section class="mock-row status--${esc(row._status || "todo")}" data-mock-record="${esc(node.recordId)}"><div class="mock-row-title">${rowMetadata ? `<span>${esc(rowMetadata)}</span>` : ""}<strong>${esc(row.name || "Unnamed row")}</strong>${description ? `<p>${esc(description)}</p>` : ""}<small>${esc(row.role || "custom")}</small></div><div class="mock-row-content">${renderLayoutChildren(node.recordId) || `<div class="mock-empty">Empty row</div>`}</div></section>`;
    };
    function groupTracks(group, axis) {
      normalizeLayoutSizes(page, group, axis === "x" ? "panel" : "row");
      const tracks = group.map(node => `${clampPercent(node.sizePercent) || (100 / group.length)}%`);
      return tracks.flatMap((track, index) => index < tracks.length - 1 ? [track, "6px"] : [track]).join(" ");
    }
    function resizeHandle(axis, parentId, leftNode, rightNode) {
      if (disabled) return "";
      return `<div class="mock-resize-handle mock-resize-handle--${axis === "x" ? "vertical" : "horizontal"}" data-resize-axis="${axis}" data-resize-parent="${esc(parentId)}" data-resize-left="${esc(leftNode.recordId)}" data-resize-right="${esc(rightNode.recordId)}" title="Drag to resize"></div>`;
    }
    function interleaveRendered(group, renderer, axis, parentId) {
      return group.map((node, index) => `${renderer(node, index)}${index < group.length - 1 ? resizeHandle(axis, parentId, node, group[index + 1]) : ""}`).join("");
    }
    function renderLayoutChildren(parentId) {
      const nodes = childNodes(parentId);
      let html = "";
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        const type = node.type || "section";
        if (type === "panel") {
          const group = [];
          while (nodes[index] && nodes[index].type === "panel") { group.push(nodes[index]); index += 1; }
          index -= 1;
          html += `<div class="mock-panel-row" style="grid-template-columns:${esc(groupTracks(group, "x"))}">${interleaveRendered(group, renderPanelNode, "x", parentId)}</div>`;
        } else if (type === "row") {
          const group = [];
          while (nodes[index] && nodes[index].type === "row") { group.push(nodes[index]); index += 1; }
          index -= 1;
          html += `<div class="mock-row-stack" style="grid-template-rows:${esc(groupTracks(group, "y"))}">${interleaveRendered(group, renderRowNode, "y", parentId)}</div>`;
        } else html += renderSectionNode(node);
      }
      return html;
    }
    const hasLayout = childNodes("canvas").length;
    return `<div class="mock-shell ${showHonesty ? "honesty-on" : ""} ${showIds ? "ids-on" : ""}">
      <div class="mock-controls">${segment("role", roles.length ? roles : ["default role"], mockChoice.role)}${segment("state", conditionNames, mockChoice.state)}<button class="button button--small mock-preview-button" data-open-preview type="button">Preview</button><div class="review-view"><span>Review view</span>${segment("reviewMode", ["clean", "honesty", "IDs", "honesty + IDs"], mockChoice.reviewMode)}</div></div>
      <div class="mock-stage"><div class="mock-page-wrap">${conditionNote}${hasLayout ? `<div class="mock-canvas">${renderLayoutChildren("canvas")}</div>` : `<div class="mock-canvas-empty"><strong>Blank canvas</strong><span>Add the first row or panel in the composer below.</span></div>`}</div></div>
      <div class="mock-caption">${esc(FIDELITY_NOTE)}</div>
    </div>${renderMockComposer(page, disabled)}`;
  }

  function buildContract(page) {
    const values = page.blocks.B13.values;
    const workflows = (state.app.workflows || []).filter(workflow => (workflow.steps || []).some(step => step.pageId === page.id));
    const activeDecisions = (page.blocks.B12.values.records || []).filter(record => record.type === "decision" && record.decisionLifecycle === "active");
    const decisionRecord = activeDecisions.length ? JSON.stringify(activeDecisions, null, 2) : "  · No active decisions are recorded for this page.";
    const workflowRecord = workflows.length ? JSON.stringify(workflows, null, 2) : "  · This page does not participate in a canonical application workflow.";
    const list = value => String(value || "").split("\n").map(line => line.trim()).filter(Boolean).map(line => `  · ${line}`).join("\n") || "  · (nothing recorded yet)";
    return `You are building: ${page.blocks.B01.values.name || page.name} (${page.blocks.B01.values.route || page.route}) of ${state.app.name}.
Source of truth: this page's machine-readable Mockument record. Stable IDs travel into tickets, commits and tests.
The Mockument is structural, uses example data, and does not prove that integrations, rules, permissions, calculations, persistence, or performance work. Do not infer real behavior from the simulation.

APPLICATION WORKFLOW REFERENCES
Use these stable page, surface, action, step, and transition IDs. Do not replace them with inferred name matching.
${workflowRecord}

ACTIVE DECISION PROVENANCE
Treat these as binding context only where their Applied to references agree with the canonical blocks. Stop and ask if a decision conflicts with B03, B04, B11, or this contract.
${decisionRecord}

BUILD EXACTLY THIS
${list(values.must)}

DO NOT INVENT
${list(values.mustNotInvent)}

STOP AND ASK BEFORE BUILDING
${list(values.askFirst)}

DONE MEANS
${list(values.acceptance)}

Anything not covered above is unspecified. Add a question against this page rather than deciding it during implementation.`;
  }

  function renderHumanReviewFooter(definition, block, page, aiStatuses, humanStatuses) {
    const labels = { walk: "Walk-through", mockQa: "Mockument QA", build: "Build", devQa: "Dev QA" };
    return `<div class="human-review-footer"><div class="human-review-heading"><strong>Human check</strong><span>A named person confirms each stage after its AI status is ready.</span></div><div class="human-review-grid">${READINESS_GATES.map(gate => {
      const ai = aiStatuses[definition.id][gate.key];
      const human = humanStatuses[definition.id][gate.key];
      const review = block.humanReviews[gate.key];
      const available = ai.state === "ready";
      const confirmedCurrent = review.confirmed && review.reviewedContentHash === blockContentFingerprint(block, gate.key);
      const evidenceControl = gate.key === "devQa" ? `<label class="review-evidence"><span>Implementation evidence</span><input data-devqa-evidence data-block="${definition.id}" value="${esc(block.devQa.evidence || "")}" placeholder="URL, commit, test, or note"></label>` : "";
      return `<div class="human-review-stage human-review-stage--${human.state}"><div class="human-review-stage-title"><span class="human-status-dot"></span><strong>${esc(labels[gate.key])}</strong></div>${reviewerSelect(review.reviewer, `data-human-reviewer data-block="${definition.id}" data-gate="${gate.key}"`)}${evidenceControl}<div class="human-review-confirm"><button class="review-toggle ${confirmedCurrent ? "is-on" : ""}" data-human-toggle data-block="${definition.id}" data-gate="${gate.key}" type="button" role="switch" aria-checked="${confirmedCurrent}" ${available && review.reviewer ? "" : "disabled"}><i></i></button><span>${confirmedCurrent ? "Confirmed" : human.state === "warning" ? "Needs confirmation" : available ? "Not reviewed" : "Unavailable"}</span></div></div>`;
    }).join("")}</div></div>`;
  }

  function renderBlock(definition, block, page, templateMode, aiStatuses, humanStatuses) {
    const selected = selection.kind === "block" && selection.blockId === definition.id;
    const formFields = definition.fields.filter(field => !field.hidden && (!field.showWhen || block.values[field.showWhen.key] === field.showWhen.value)).map(field => field.type === "rows"
      ? renderRepeater(field, block.values[field.key] || [], definition.id, templateMode)
      : renderSimpleField(field, block.values[field.key], definition.id, templateMode)).join("");
    return `<section class="block ${selected ? "is-selected" : ""}" id="${definition.id}" data-block-section="${definition.id}">
      <div class="block-head" data-inspect-block="${definition.id}" tabindex="0">
        <span class="block-number">${definition.id}</span><span class="block-title">${esc(definition.title)}</span><span class="block-owner">Answered by ${esc(definition.answeredBy)}</span>
      </div>
      <div class="block-form">
        ${definition.custom === "mock" ? renderMock(page, templateMode) : ""}
        ${definition.custom === "workflowParticipation" ? renderWorkflowParticipation(page) : ""}
        <div class="honesty-bar">
          <label class="honesty-field"><span>Block status</span>${statusSelect(block.status, `data-block-status="${definition.id}" data-block="${definition.id}"`, templateMode)}</label>
          <label class="honesty-field"><span>Assigned to</span>${reviewerSelect(block.accountable || "", `data-block-meta="accountable" data-block="${definition.id}"`, templateMode)}</label>
          <label class="honesty-field"><span>Status note</span><input data-block-meta="note" data-block="${definition.id}" value="${esc(block.note || "")}" ${templateMode ? "disabled" : ""}></label>
        </div>
        <div class="form-grid">${formFields}</div>
        ${definition.custom === "contract" ? `<div style="height:16px"></div><div class="contract">${esc(buildContract(page))}</div>` : ""}
      </div>
      ${renderHumanReviewFooter(definition, block, page, aiStatuses, humanStatuses)}
    </section>`;
  }

  function renderBlockJump(page, aiStatuses = calculateBlockReadiness(page), humanStatuses = calculateHumanReadiness(page, aiStatuses)) {
    const displayGates = READINESS_GATES;
    const sideLabels = { walk: "Walk through", mockQa: "Mockument QA", build: "Build", devQa: "Dev QA" };
    const matrix = (stageLabel, statuses, layer) => `<div class="status-matrix status-matrix--${layer}"><div class="block-status-grid"><div class="readiness-side-labels"><span class="stage-axis-label">${esc(stageLabel)}</span><div class="stage-gate-labels">${displayGates.map(gate => `<button class="${activeGateFilter === gate.key ? "is-active" : ""}" data-gate-filter="${gate.key}" type="button">${esc(sideLabels[gate.key])}</button>`).join("")}</div></div><nav class="block-jump block-jump--statuses" aria-label="${esc(stageLabel)} by Mockument block">${BLOCKS.map(definition => `<button class="${selection.blockId === definition.id ? "is-active" : ""}" data-jump-block="${definition.id}" type="button" aria-label="${esc(definition.id)} ${esc(BLOCK_SUMMARIES[definition.id])}"><span class="block-gate-lines">${displayGates.map(gate => { const status = statuses[definition.id][gate.key]; return `<i class="gate-line gate-line--${status.state}" data-gate="${gate.key}" title="${esc(gate.name)}: ${esc(status.reason)}"></i>`; }).join("")}</span></button>`).join("")}</nav></div></div>`;
    const headers = `<div class="block-header-grid"><span class="block-row-label">Block</span><nav class="block-jump block-jump--headers" aria-label="Jump to a Mockument block">${BLOCKS.map(definition => `<button class="${selection.blockId === definition.id ? "is-active" : ""}" data-jump-block="${definition.id}" type="button"><strong>${definition.id}</strong><span>${esc(BLOCK_SUMMARIES[definition.id])}</span></button>`).join("")}</nav></div>`;
    return `<div class="block-status-nav" data-filter="${activeGateFilter || ""}">${headers}${matrix("AI stage", aiStatuses, "ai")}${matrix("Human stage", humanStatuses, "human")}</div>`;
  }

  function nextWorkflowId() {
    const highest = (state.app.workflows || []).reduce((max, workflow) => { const match = String(workflow.id || "").match(/^WF-(\d+)$/); return match ? Math.max(max, Number(match[1])) : max; }, 0);
    return `WF-${String(highest + 1).padStart(2, "0")}`;
  }

  function workflowPages() {
    return state.pageOrder.map(id => state.pages[id]).filter(page => page && !page.isSettings);
  }

  function workflowSurfaceOptions(pageId) {
    const page = state.pages[pageId];
    if (!page || !page.built) return [];
    const rows = (page.blocks.B04.values.rows || []).map(record => ({ value: record.id || record._id, label: `${record.id || record._id} — ${record.name || "Unnamed row"} · ${record.role || "custom"}` }));
    const panels = (page.blocks.B04.values.panels || []).map(record => ({ value: record.id || record._id, label: `${record.id || record._id} — ${record.name || "Unnamed panel"} · ${record.role || "custom"}` }));
    const sections = (page.blocks.B04.values.elements || []).filter(record => record.kind === "section").map(record => ({ value: record.id || record._id, label: `${record.id || record._id} — ${record.name || "Unnamed section"} · ${record.surfaceRole || "ordinary section"}` }));
    return [...rows, ...panels, ...sections];
  }

  function workflowActionOptions(pageId) {
    const page = state.pages[pageId];
    if (!page || !page.built) return [];
    return (page.blocks.B04.values.controls || []).map(record => ({ value: record.id || record._id, label: `${record.id || record._id} — ${record.name || "Unnamed action"}` }));
  }

  function workflowIssues(workflow) {
    const issues = [];
    const steps = workflow.steps || [];
    const stepIds = new Set(steps.map(step => step.id));
    if (!String(workflow.name || "").trim()) issues.push("Workflow name is missing.");
    if (!steps.length) return [...issues, "No steps are defined."];
    if (!stepIds.has(workflow.startStepId)) issues.push("Starting step is missing or broken.");
    steps.forEach(step => {
      const page = state.pages[step.pageId];
      if (!page || page.isSettings) issues.push(`${step.id} references a missing page.`);
      if (step.surfaceId && !workflowSurfaceOptions(step.pageId).some(option => option.value === step.surfaceId)) issues.push(`${step.id} references a missing surface.`);
      const transitions = step.transitions || [];
      if (step.terminalOutcome && transitions.length) issues.push(`${step.id} is terminal but still has outgoing transitions.`);
      if (!step.terminalOutcome && !transitions.length) issues.push(`${step.id} has neither an outgoing transition nor a terminal outcome.`);
      transitions.forEach(transition => {
        if (!stepIds.has(transition.nextStepId)) issues.push(`${step.id} has a transition to a missing step.`);
        if (transition.triggerRef && transition.triggerRef !== "business-event" && !workflowActionOptions(step.pageId).some(option => option.value === transition.triggerRef)) issues.push(`${step.id} references a missing action ${transition.triggerRef}.`);
        if (!transition.triggerRef) issues.push(`${step.id} has a transition without an action or business event.`);
      });
    });
    if (stepIds.has(workflow.startStepId)) {
      const reachable = new Set();
      const visit = id => { if (reachable.has(id)) return; reachable.add(id); const step = steps.find(candidate => candidate.id === id); (step && step.transitions || []).forEach(transition => visit(transition.nextStepId)); };
      visit(workflow.startStepId);
      steps.filter(step => !reachable.has(step.id)).forEach(step => issues.push(`${step.id} is unreachable from the start.`));
      if (!steps.some(step => reachable.has(step.id) && step.terminalOutcome)) issues.push("No reachable terminal outcome is defined.");
    }
    return issues;
  }

  function renderWorkflowSettings() {
    const workflows = state.app.workflows || [];
    const pages = workflowPages();
    const pageOptions = value => `<option value="">Select page</option>${pages.map(page => `<option value="${esc(page.id)}" ${value === page.id ? "selected" : ""}>${esc(page.name)}${page.built ? "" : " · not drawn"}</option>`).join("")}`;
    return `<section class="workflow-settings"><div class="reviewer-settings-head"><div><strong>Application workflows</strong><span>Canonical graphs use stable page, surface and action IDs. B10 on each page is generated from these records.</span></div><button class="button button--small" data-add-workflow type="button">+ Add workflow</button></div>
      ${workflows.length ? workflows.map((workflow, workflowIndex) => {
        const issues = workflowIssues(workflow);
        return `<article class="workflow-card"><div class="workflow-card-head"><span class="row-id">${esc(workflow.id)}</span><input data-workflow-field="name" data-workflow="${workflowIndex}" value="${esc(workflow.name || "")}" placeholder="Workflow name"><button class="remove-row" data-remove-workflow="${workflowIndex}" type="button">Remove workflow</button></div>
          <label class="field"><span>Starting step</span><select data-workflow-field="startStepId" data-workflow="${workflowIndex}"><option value="">Select start</option>${(workflow.steps || []).map(step => `<option value="${esc(step.id)}" ${workflow.startStepId === step.id ? "selected" : ""}>${esc(step.id)} — ${esc(step.name || "Unnamed step")}</option>`).join("")}</select></label>
          ${workflow.note ? `<p class="form-help">${esc(workflow.note)}</p>` : ""}
          ${issues.length ? `<div class="workflow-issues"><strong>Graph checks</strong>${issues.map(issue => `<span>${esc(issue)}</span>`).join("")}</div>` : `<div class="workflow-valid">Graph references and paths are valid.</div>`}
          <div class="workflow-steps">${(workflow.steps || []).map((step, stepIndex) => {
            const surfaces = workflowSurfaceOptions(step.pageId);
            const actions = workflowActionOptions(step.pageId);
            return `<div class="workflow-step"><div class="workflow-step-head"><span class="row-id">${esc(step.id)}</span><input data-step-field="name" data-workflow="${workflowIndex}" data-step="${stepIndex}" value="${esc(step.name || "")}" placeholder="Step name"><button class="remove-row" data-remove-step data-workflow="${workflowIndex}" data-step="${stepIndex}" type="button">Remove</button></div>
              <div class="workflow-step-fields"><label class="field"><span>Page</span><select data-step-field="pageId" data-workflow="${workflowIndex}" data-step="${stepIndex}">${pageOptions(step.pageId)}</select></label><label class="field"><span>Surface</span><select data-step-field="surfaceId" data-workflow="${workflowIndex}" data-step="${stepIndex}"><option value="">Page root</option>${surfaces.map(option => `<option value="${esc(option.value)}" ${step.surfaceId === option.value ? "selected" : ""}>${esc(option.label)}</option>`).join("")}</select></label><label class="field field--wide"><span>Terminal outcome</span><input data-step-field="terminalOutcome" data-workflow="${workflowIndex}" data-step="${stepIndex}" value="${esc(step.terminalOutcome || "")}" placeholder="Leave empty when this step continues"></label></div>
              <div class="workflow-transitions"><div class="workflow-transition-head"><strong>Outgoing transitions</strong><button class="button button--small" data-add-transition data-workflow="${workflowIndex}" data-step="${stepIndex}" type="button">+ Add transition</button></div>${(step.transitions || []).map((transition, transitionIndex) => `<div class="workflow-transition"><span class="row-id">${esc(transition.id)}</span><label class="field"><span>Action or event</span><select data-transition-field="triggerRef" data-workflow="${workflowIndex}" data-step="${stepIndex}" data-transition="${transitionIndex}"><option value="">Select trigger</option><option value="business-event" ${transition.triggerRef === "business-event" ? "selected" : ""}>Business event / automatic</option>${actions.map(option => `<option value="${esc(option.value)}" ${transition.triggerRef === option.value ? "selected" : ""}>${esc(option.label)}</option>`).join("")}</select></label><label class="field"><span>Condition</span><input data-transition-field="condition" data-workflow="${workflowIndex}" data-step="${stepIndex}" data-transition="${transitionIndex}" value="${esc(transition.condition || "")}" placeholder="Optional branch condition"></label><label class="field"><span>Next step</span><select data-transition-field="nextStepId" data-workflow="${workflowIndex}" data-step="${stepIndex}" data-transition="${transitionIndex}"><option value="">Select next step</option>${(workflow.steps || []).filter(candidate => candidate.id !== step.id).map(candidate => `<option value="${esc(candidate.id)}" ${transition.nextStepId === candidate.id ? "selected" : ""}>${esc(candidate.id)} — ${esc(candidate.name || "Unnamed step")}</option>`).join("")}</select></label><button class="remove-row" data-remove-transition data-workflow="${workflowIndex}" data-step="${stepIndex}" data-transition="${transitionIndex}" type="button">Remove</button></div>`).join("") || `<p class="repeater-empty">No outgoing transitions. Add one or define a terminal outcome.</p>`}</div>
            </div>`;
          }).join("") || `<p class="repeater-empty">No workflow steps yet.</p>`}</div><button class="button button--small" data-add-step data-workflow="${workflowIndex}" type="button">+ Add step</button>
        </article>`;
      }).join("") : `<p class="repeater-empty">No application workflows yet.</p>`}
    </section>`;
  }

  function renderWorkflowParticipation(page) {
    const memberships = (state.app.workflows || []).map(workflow => ({ workflow, steps: (workflow.steps || []).filter(step => step.pageId === page.id) })).filter(item => item.steps.length);
    if (!memberships.length) return `<div class="workflow-participation"><p>No canonical application workflow currently references this page.</p><button class="button button--small" data-open-page="settings" type="button">Manage workflows in Settings</button></div>`;
    return `<div class="workflow-participation">${memberships.map(({ workflow, steps }) => `<article><div><span class="row-id">${esc(workflow.id)}</span><strong>${esc(workflow.name || "Unnamed workflow")}</strong></div>${steps.map(step => { const incoming = (workflow.steps || []).flatMap(source => (source.transitions || []).filter(transition => transition.nextStepId === step.id).map(transition => `${source.id}${transition.condition ? ` · ${transition.condition}` : ""}`)); return `<div class="participation-step"><strong>${esc(step.id)} — ${esc(step.name || "Unnamed step")}</strong><span>Surface: ${esc(step.surfaceId || "Page root")}</span><span>Previous: ${esc(incoming.join(", ") || (workflow.startStepId === step.id ? "Workflow start" : "None"))}</span><span>Next: ${esc(step.terminalOutcome ? `Outcome — ${step.terminalOutcome}` : (step.transitions || []).map(transition => `${transition.triggerRef || "?"} → ${transition.nextStepId || "?"}${transition.condition ? ` (${transition.condition})` : ""}`).join(", ") || "Not connected")}</span><button class="button button--small" data-open-workflow-step data-workflow-id="${esc(workflow.id)}" data-step-id="${esc(step.id)}" type="button">Open target</button></div>`; }).join("")}${workflowIssues(workflow).length ? `<small>${workflowIssues(workflow).length} graph issue${workflowIssues(workflow).length === 1 ? "" : "s"} must be resolved in Settings.</small>` : ""}</article>`).join("")}<button class="button button--small" data-open-page="settings" type="button">Manage workflows in Settings</button></div>`;
  }

  function renderBlockPager() {
    if (showAllBlocks) return `<div class="block-view-note"><span>All thirteen blocks are visible for review, printing, and browser search.</span></div>`;
    const index = Math.max(0, BLOCKS.findIndex(block => block.id === selection.blockId));
    const previous = BLOCKS[index - 1];
    const next = BLOCKS[index + 1];
    return `<nav class="block-pager" aria-label="Move between Mockument blocks"><button class="button button--small" data-previous-block type="button" ${previous ? "" : "disabled"}>← ${previous ? `${esc(previous.id)} ${esc(BLOCK_SUMMARIES[previous.id])}` : "Previous"}</button><span><strong>${esc(BLOCKS[index].id)}</strong> ${esc(BLOCK_SUMMARIES[BLOCKS[index].id])}<button class="block-view-link" data-toggle-block-view type="button">View all blocks</button></span><button class="button button--small" data-next-block type="button" ${next ? "" : "disabled"}>${next ? `${esc(next.id)} ${esc(BLOCK_SUMMARIES[next.id])}` : "Next"} →</button></nav>`;
  }

  function renderApplicationSettings() {
    return `<section class="application-settings" aria-labelledby="application-settings-title">
      <div><span class="eyebrow">Mockument-wide setting</span><h2 id="application-settings-title">Application identity</h2><p>The application name appears in the left column, mock navigation, exports, and before the page name in every browser tab.</p></div>
      <label class="field"><span>Application name</span><input data-app-setting="name" value="${esc(state.app.name || "Application Name")}" placeholder="Application Name"><small class="field-question">Example browser title: ${esc(state.app.name || "Application Name")} — Template</small></label>
      <div class="reviewer-settings"><div class="reviewer-settings-head"><div><strong>People working on this application</strong><span>These names appear in every human-review dropdown.</span></div><button class="button button--small" data-add-reviewer type="button">+ Add person</button></div><div class="reviewer-list">${(state.app.reviewers || []).length ? state.app.reviewers.map((name, index) => `<div class="reviewer-row"><input data-reviewer-index="${index}" value="${esc(name)}" placeholder="Person's name"><button class="remove-row" data-remove-reviewer="${index}" type="button">Remove</button></div>`).join("") : `<p class="repeater-empty">No people added yet.</p>`}</div></div>
      ${renderWorkflowSettings()}
    </section>`;
  }

  function renderDocument() {
    const page = activePage();
    if (!page) { state.activePageId = "template"; saveState(); return render(); }
    if (!page.built) {
      document.title = `${state.app.name || "Application Name"} — ${page.name}`;
      $("#document").innerHTML = `${page.isSettings ? renderApplicationSettings() : ""}<div class="unbuilt"><span class="eyebrow">Application page · not drawn</span><h1>${esc(page.name)}</h1><p>This page belongs in the proposed system but does not have a Mockument yet.</p><button class="button button--primary" data-build-page="${esc(page.id)}" type="button">Copy Template into ${esc(page.name)}</button></div>`;
      return;
    }
    const templateMode = page.id === "template";
    const title = templateMode ? "Template" : (page.blocks.B01.values.name || page.name);
    const route = templateMode ? "/template" : (page.blocks.B01.values.route || page.route);
    document.title = `${state.app.name || "Application Name"} — ${title}`;
    const aiStatuses = calculateBlockReadiness(page);
    const humanStatuses = calculateHumanReadiness(page, aiStatuses);
    const showPageOverview = showAllBlocks || selection.blockId === "B01";
    const pageOverview = showPageOverview ? `${page.isSettings ? renderApplicationSettings() : ""}<header class="document-head">
      <span class="eyebrow">${templateMode ? "Canonical page source" : "Mockument page"}</span>
      <h1>${esc(title)}</h1>
      <p class="document-lede">${templateMode ? "Interactive preview: try every field, dropdown, status and mock-composer action. Changes are temporary, are never copied into a new page, and reset when the browser reloads." : esc(page.blocks.B01.values.activity || "This page has no business activity yet.")}</p>
      <div class="meta-strip"><span class="meta-chip">${esc(route)}</span><span class="meta-chip">Template v${esc(page.templateVersion)}</span><span class="meta-chip">Schema v${esc(page.schemaVersion)}</span></div>
      <div class="document-toolbar">
        ${templateMode ? `<button class="button button--primary" data-open-new-page type="button">Copy Template</button><button class="button" data-reset-template-preview type="button">Reset preview</button>` : `<button class="button" data-export-page type="button">Export this page</button>${page.isSettings ? "" : `<button class="button button--danger" data-delete-page="${esc(page.id)}" type="button">Delete page</button>`}`}
        <button class="button" data-toggle-block-view type="button">${showAllBlocks ? "Focus active block" : "View all blocks"}</button>
      </div>
    </header>${renderReadiness(page)}` : "";
    $("#document").innerHTML = `${renderBlockJump(page, aiStatuses, humanStatuses)}${pageOverview}
    ${renderBlockPager()}
    <div class="block-list">${(showAllBlocks ? BLOCKS : BLOCKS.filter(definition => definition.id === selection.blockId)).map(definition => renderBlock(definition, page.blocks[definition.id], page, false, aiStatuses, humanStatuses)).join("")}</div>
    ${showAllBlocks ? "" : renderBlockPager()}`;
  }

  function findField(definition, key) {
    return definition && definition.fields.find(field => field.key === key);
  }

  function findRecord(page, id) {
    for (const definition of BLOCKS) {
      for (const field of definition.fields.filter(candidate => candidate.type === "rows")) {
        const row = (page.blocks[definition.id].values[field.key] || []).find(candidate => candidate.id === id || candidate._id === id);
        if (row) return { definition, field, row };
      }
    }
    return null;
  }

  function inspectorRecordEditor(found, disabled) {
    const row = found.row;
    const page = activePage();
    const inputs = found.field.fields.filter(column => (!column.forKinds || column.forKinds.includes(row.kind)) && (!column.forPresentations || column.forPresentations.includes(row.presentation)) && (!column.forTypes || column.forTypes.includes(row.type))).map(column => {
      const attributes = `data-record-field="${column.key}" data-record-id="${esc(row.id || row._id)}" ${disabled || column.key === "id" ? "disabled" : ""}`;
      let control;
      if (column.type === "textarea") control = `<textarea ${attributes} rows="3">${esc(row[column.key] || "")}</textarea>`;
      else if (column.type === "select" && column.dynamicOptions === "data") {
        const definitions = page.blocks.B03.values.data || [];
        const choices = [
          { value: "", label: "No data definition required" },
          { value: "Not yet defined", label: "Not yet defined" },
          ...definitions.map(definition => ({ value: definition.id || definition._id, label: `${definition.id || definition._id} — ${definition.name || "Unnamed data"} · ${definition.cardinality || "?"} ${definition.structure || "?"}` }))
        ];
        control = `<select ${attributes}>${choices.map(choice => `<option value="${esc(choice.value)}" ${row[column.key] === choice.value ? "selected" : ""}>${esc(choice.label)}</option>`).join("")}<option value="__create_data__">+ Create a new data definition</option></select>`;
      }
      else if (column.type === "select" && column.dynamicOptions === "presentation") {
        const definition = (page.blocks.B03.values.data || []).find(candidate => (candidate.id || candidate._id) === row.dataRef);
        let choices = ["not yet defined"];
        if (definition && definition.cardinality === "one" && definition.structure === "value") choices.push("displayed value", "input", "status", "metric");
        if (definition && definition.cardinality === "one" && definition.structure === "record") choices.push("summary", "details", "form");
        if (definition && definition.cardinality === "many") choices.push("list", "table");
        if (row[column.key] && !choices.includes(row[column.key])) choices.push(row[column.key]);
        control = `<select ${attributes}>${choices.map(choice => `<option value="${esc(choice)}" ${row[column.key] === choice ? "selected" : ""}>${esc(choice)}</option>`).join("")}</select>`;
      }
      else if (column.type === "select") control = `<select ${attributes}>${column.choices.map(choice => `<option value="${esc(choice)}" ${row[column.key] === choice ? "selected" : ""}>${esc(choice)}</option>`).join("")}</select>`;
      else control = `<input ${attributes} value="${esc(row[column.key] || "")}">`;
      return `<label class="field"><span>${esc(column.label)}</span>${control}<small class="field-question">${esc(column.question)}</small></label>`;
    }).join("");
    return `<div class="inspector-section"><h3>Edit selected mock record</h3><div class="inspector-edit">
      <label class="field"><span>Work status</span>${statusSelect(row._status || "todo", `data-record-meta="status" data-record-id="${esc(row.id || row._id)}"`, disabled)}</label>
      ${inputs}
      <label class="field"><span>Who must answer or accept</span><input data-record-meta="accountable" data-record-id="${esc(row.id || row._id)}" value="${esc(row._accountable || "")}" ${disabled ? "disabled" : ""}></label>
      <label class="field"><span>Status note</span><textarea data-record-meta="note" data-record-id="${esc(row.id || row._id)}" ${disabled ? "disabled" : ""}>${esc(row._note || "")}</textarea></label>
    </div></div>`;
  }

  function renderInspector() {
    const inspector = $("#inspector");
    const page = activePage();
    if (!page) return;
    let definition = BLOCKS.find(block => block.id === selection.blockId) || BLOCKS[0];
    let extra = "";
    if (selection.kind === "field") {
      const field = findField(definition, selection.fieldKey);
      if (field) extra = `<div class="inspector-section"><h3>Question to ask</h3><p>${esc(field.question)}</p></div><div class="inspector-section"><h3>Input</h3><p>${field.type === "rows" ? "Repeatable structured records" : esc(field.label)}</p></div>`;
    }
    if (selection.kind === "row") {
      const field = findField(definition, selection.fieldKey);
      const row = field && (page.blocks[definition.id].values[field.key] || [])[selection.rowIndex];
      if (row) extra = `<div class="inspector-section"><h3>Selected record</h3><div class="inspector-record">${Object.entries(row).filter(([key]) => !key.startsWith("_")).map(([key, value]) => `<div><span>${esc(key)}</span><strong>${esc(value || "—")}</strong></div>`).join("")}</div></div>`;
    }
    if (selection.kind === "record") {
      const found = findRecord(page, selection.recordId);
      if (found) {
        definition = found.definition;
        extra = inspectorRecordEditor(found, false);
      } else extra = `<div class="inspector-section"><h3>No specification record</h3><p>This visible item has no record. Add it through the B04 Mock composer, or remove it from the mock.</p></div>`;
    }
    const block = page.blocks[definition.id];
    const readiness = calculateBlockReadiness(page)[definition.id];
    const readinessDetails = READINESS_GATES.map(gate => { const status = readiness[gate.key]; const label = status.state === "ready" ? "Ready" : status.state === "warning" ? "In progress" : status.state === "missing" ? "Missing" : "Not applicable"; return `<div class="readiness-detail readiness-detail--${status.state}"><b>${gate.short}</b><span><strong>${esc(gate.name)}</strong><small>${esc(label)} · ${esc(status.reason)}</small></span></div>`; }).join("");
    inspector.innerHTML = `<span class="inspector-kicker">${definition.id}</span><h2>${esc(definition.title)}</h2><div class="inspector-owner">Answered by ${esc(definition.answeredBy)}</div>
      <div class="inspector-section"><h3>Definition</h3><p>${esc(definition.definition)}</p></div>
      <div class="inspector-section"><h3>Why it exists</h3><p>${esc(definition.why)}</p></div>
      <div class="inspector-section"><h3>Current honesty</h3><p><span class="status-chip status--${esc(block.status)}"><span class="status-dot"></span>${esc(statusLabel(block.status))}</span>${block.accountable ? ` · ${esc(block.accountable)}` : ""}</p></div>
      <div class="inspector-section"><h3>Block readiness</h3><div class="readiness-details">${readinessDetails}</div></div>
      ${extra}`;
  }

  function renderPreview() {
    const page = activePage();
    document.body.classList.add("is-previewing");
    if (!page) { previewMode = false; return render(); }
    $("#document").innerHTML = `<div class="fullscreen-preview"><button class="preview-exit" data-exit-preview type="button" aria-label="Back to B04" title="Back to B04">↗</button>${renderMock(page, true)}</div>`;
    $("#inspector").innerHTML = "";
  }

  function render() {
    if (previewMode) { renderPreview(); return; }
    document.body.classList.remove("is-previewing");
    renderMenu();
    renderDocument();
    renderInspector();
  }

  function currentEditablePage() {
    const page = activePage();
    return page && page.built ? page : null;
  }

  function updateLayoutSize(target) {
    const page = currentEditablePage();
    if (!page) return;
    const node = page.blocks.B04.values.layout[Number(target.dataset.layoutIndex)];
    if (!node) return;
    node.sizePercent = target.value === "" ? null : clampPercent(target.value);
    normalizeAllLayoutSizes(page);
    saveState();
  }

  function updateValue(target) {
    const page = currentEditablePage();
    if (!page || !page.built) return;
    const block = page.blocks[target.dataset.block];
    if (!block) return;
    if (target.dataset.blockStatus) block.status = target.value;
    else if (target.dataset.blockMeta) block[target.dataset.blockMeta] = target.value;
    else if (target.dataset.rowStatus) block.values[target.dataset.field][Number(target.dataset.row)]._status = target.value;
    else if (target.dataset.rowMeta) block.values[target.dataset.field][Number(target.dataset.row)][`_${target.dataset.rowMeta}`] = target.value;
    else if (target.dataset.valueInput !== undefined) {
      if (target.dataset.row == null) block.values[target.dataset.field] = target.value;
      else block.values[target.dataset.rowKey][Number(target.dataset.row)][target.dataset.field] = target.value;
    }
    const identity = page.blocks.B01.values;
    page.name = identity.name || page.name;
    page.route = identity.route || page.route;
    page.updatedAt = new Date().toISOString();
    saveState();
  }

  function updateRecord(target) {
    const page = currentEditablePage();
    if (!page || !page.built) return;
    const found = findRecord(page, target.dataset.recordId);
    if (!found) return;
    if (target.dataset.recordField && target.value === "__create_data__") {
      if (target.dataset.dataCreated) return;
      target.dataset.dataCreated = "true";
      const dataField = findField(BLOCKS.find(definition => definition.id === "B03"), "data");
      const dataRows = page.blocks.B03.values.data;
      const dataRow = newRow(dataField, dataRows.length);
      dataRow._accountable = "Data owner";
      dataRows.push(dataRow);
      found.row[target.dataset.recordField] = dataRow.id;
      selection = { kind: "record", recordId: dataRow.id, blockId: "B03" };
    }
    else if (target.dataset.recordField) {
      found.row[target.dataset.recordField] = target.value;
      if (target.dataset.recordField === "dataRef" && found.row.kind === "data") found.row.presentation = "not yet defined";
    }
    else if (target.dataset.recordMeta === "status") found.row._status = target.value;
    else if (target.dataset.recordMeta) found.row[`_${target.dataset.recordMeta}`] = target.value;
    page.updatedAt = new Date().toISOString();
    saveState();
  }

  function updateWorkflowField(target) {
    const workflow = state.app.workflows[Number(target.dataset.workflow)];
    if (!workflow) return;
    if (target.dataset.workflowField) workflow[target.dataset.workflowField] = target.value;
    if (target.dataset.stepField) {
      const step = workflow.steps[Number(target.dataset.step)];
      if (!step) return;
      step[target.dataset.stepField] = target.value;
      if (target.dataset.stepField === "pageId") {
        step.surfaceId = "";
        (step.transitions || []).forEach(transition => { if (transition.triggerRef !== "business-event") transition.triggerRef = ""; });
      }
    }
    if (target.dataset.transitionField) {
      const step = workflow.steps[Number(target.dataset.step)];
      const transition = step && step.transitions[Number(target.dataset.transition)];
      if (!transition) return;
      transition[target.dataset.transitionField] = target.value;
    }
    saveState();
  }

  function updateAppSetting(target) {
    if (target.dataset.appSetting !== "name") return;
    state.app.name = target.value;
    saveState();
    const applicationName = state.app.name || "Application Name";
    $("#app-name-small").textContent = applicationName;
    const page = activePage();
    const pageName = page ? (page.id === "template" ? "Template" : (page.blocks.B01.values.name || page.name)) : "Template";
    document.title = `${applicationName} — ${pageName}`;
  }

  function updateDevQa(target) {
    const page = currentEditablePage();
    if (!page || !page.built) return;
    const block = page.blocks[target.dataset.block];
    if (!block) return;
    if (target.matches("[data-devqa-evidence]")) block.devQa.evidence = target.value;
    page.updatedAt = new Date().toISOString();
    saveState();
  }

  function updateReviewerName(target) {
    const index = Number(target.dataset.reviewerIndex);
    const oldName = state.app.reviewers[index] || "";
    const newName = target.value;
    state.app.reviewers[index] = newName;
    const pages = [...Object.values(state.pages), ...(templatePreview ? [templatePreview] : [])];
    if (oldName) pages.forEach(page => BLOCKS.forEach(definition => {
      Object.values(page.blocks[definition.id].humanReviews).forEach(review => { if (review.reviewer === oldName) review.reviewer = newName; });
    }));
    saveState();
  }

  function updateHumanReviewer(target) {
    const page = currentEditablePage();
    if (!page) return;
    const review = page.blocks[target.dataset.block].humanReviews[target.dataset.gate];
    review.reviewer = target.value;
    review.confirmed = false;
    review.confirmedAt = "";
    review.reviewedContentHash = "";
    saveState();
  }

  function toggleHumanReview(target) {
    const page = currentEditablePage();
    if (!page) return;
    const block = page.blocks[target.dataset.block];
    const ai = calculateBlockReadiness(page)[target.dataset.block][target.dataset.gate];
    const review = block.humanReviews[target.dataset.gate];
    if (ai.state !== "ready" || !review.reviewer) return;
    const confirmedCurrent = review.confirmed && review.reviewedContentHash === blockContentFingerprint(block, target.dataset.gate);
    review.confirmed = !confirmedCurrent;
    review.confirmedAt = review.confirmed ? new Date().toISOString() : "";
    review.reviewedContentHash = review.confirmed ? blockContentFingerprint(block, target.dataset.gate) : "";
    saveState();
  }

  function openNewPageDialog() {
    const select = $("#parent-page-select");
    const candidates = state.pageOrder.map(id => state.pages[id]).filter(page => page && !page.parentId && !page.isSettings && page.built);
    select.innerHTML = `<option value="">Top-level menu</option>${candidates.map(page => `<option value="${esc(page.id)}">Submenu under ${esc(page.name)}</option>`).join("")}`;
    $("#new-page-form").reset();
    $("#new-page-dialog").showModal();
    setTimeout(() => $("#new-page-form [name=name]").focus(), 0);
  }

  function createFromTemplate(name, route, parentId, existingId = null) {
    const id = existingId || uniqueId(slugify(name));
    const page = createPage(id, name, route || `/${slugify(name)}`, true, existingId === "settings");
    page.parentId = parentId || null;
    if (existingId && state.pages[existingId]) {
      page.parentId = state.pages[existingId].parentId || null;
      state.pages[existingId] = page;
    } else {
      state.pages[id] = page;
      const settingsIndex = state.pageOrder.indexOf("settings");
      state.pageOrder.splice(settingsIndex < 0 ? state.pageOrder.length : settingsIndex, 0, id);
    }
    state.activePageId = id;
    selectBlock("B01");
    saveState();
    render();
    $("#document-column").focus();
    showToast(`${name} created from Template`);
  }

  function exportJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function addRowRegion(page, parentId = "canvas") {
    const mock = page.blocks.B04.values;
    const id = nextRecordId(page, "ROW");
    mock.rows.push({ _id: id, _status: "todo", _accountable: "Page owner", _note: "", id, name: `Row ${mock.rows.length + 1}`, description: "", role: parentId === "canvas" ? "content band" : "custom", trace: "" });
    mock.layout.push({ uid: `ROW-${Date.now()}-${id}`, type: "row", recordId: id, parentId, sizePercent: 20, items: [] });
    normalizeAllLayoutSizes(page);
    selection = { kind: "record", recordId: id, blockId: "B04" };
  }

  function addPanel(page, parentId = "canvas") {
    const mock = page.blocks.B04.values;
    const id = nextRecordId(page, "PNL");
    mock.panels.push({ _id: id, _status: "todo", _accountable: "Page owner", _note: "", id, name: `Panel ${mock.panels.length + 1}`, description: "", role: mock.panels.length ? "custom" : "primary content", width: "1", trace: "" });
    mock.layout.push({ uid: `PANEL-${Date.now()}-${id}`, type: "panel", recordId: id, parentId, sizePercent: 20, items: [] });
    normalizeAllLayoutSizes(page);
    selection = { kind: "record", recordId: id, blockId: "B04" };
  }

  function addLayoutSection(page, parentId) {
    const id = nextRecordId(page, "EL");
    page.blocks.B04.values.elements.push({ _id: id, _status: "todo", _accountable: "Page owner", _note: "", id, kind: "section", name: "New content section", shows: "", dataRef: "", presentation: "", surfaceRole: "ordinary section", navigationSource: "application pages", navigationTargets: "", trace: "" });
    page.blocks.B04.values.layout.push({ uid: `SECTION-${Date.now()}-${id}`, type: "section", recordId: id, parentId, columns: 1, items: [] });
    selection = { kind: "record", recordId: id, blockId: "B04" };
  }

  function addLayoutItem(page, sectionIndex, type) {
    const allowedTypes = ["content", "data", "navigation", "notice", "action"];
    type = allowedTypes.includes(type) ? type : "content";
    const isAction = type === "action";
    const id = nextRecordId(page, isAction ? "CTL" : "EL");
    const names = { content: "New static content", data: "New data component", navigation: "New navigation", notice: "New notice", action: "New action" };
    if (isAction) page.blocks.B04.values.controls.push({ _id: id, _status: "todo", _accountable: "Business user", _note: "", id, name: names[type], effect: "acts on data", dataRef: "", serverData: "unknown", leadsTo: "", confirmation: "" });
    else page.blocks.B04.values.elements.push({ _id: id, _status: "todo", _accountable: "Business user", _note: "", id, kind: type, name: names[type], shows: "", dataRef: type === "data" ? "Not yet defined" : "", presentation: type === "data" ? "not yet defined" : "", surfaceRole: "ordinary section", navigationSource: "application pages", navigationTargets: "", trace: "" });
    page.blocks.B04.values.layout[sectionIndex].items.push({ recordId: id });
    selection = { kind: "record", recordId: id, blockId: "B04" };
  }

  function removeRecord(page, recordId) {
    page.blocks.B04.values.rows = page.blocks.B04.values.rows.filter(row => (row.id || row._id) !== recordId);
    page.blocks.B04.values.panels = page.blocks.B04.values.panels.filter(row => (row.id || row._id) !== recordId);
    page.blocks.B04.values.elements = page.blocks.B04.values.elements.filter(row => (row.id || row._id) !== recordId);
    page.blocks.B04.values.controls = page.blocks.B04.values.controls.filter(row => (row.id || row._id) !== recordId);
  }

  function collectLayoutRecordIds(layout, node) {
    const ids = [node.recordId];
    (node.items || []).forEach(item => ids.push(item.recordId));
    layout.filter(candidate => (candidate.parentId || candidate.panelId || "canvas") === node.recordId).forEach(child => ids.push(...collectLayoutRecordIds(layout, child)));
    return ids;
  }

  function removeLayoutNode(page, layoutIndex) {
    const mock = page.blocks.B04.values;
    const node = mock.layout[layoutIndex];
    if (!node) return;
    const ids = collectLayoutRecordIds(mock.layout, node);
    mock.layout = mock.layout.filter(candidate => !ids.includes(candidate.recordId));
    ids.forEach(id => removeRecord(page, id));
  }

  function moveEntry(items, index, direction) {
    const target = ["up", "left"].includes(direction) ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
  }

  function moveLayoutNode(page, layoutIndex, direction) {
    const layout = page.blocks.B04.values.layout;
    const node = layout[layoutIndex];
    if (!node) return;
    const parentId = node.parentId || node.panelId || "canvas";
    const indices = layout.map((candidate, index) => (candidate.parentId || candidate.panelId || "canvas") === parentId ? index : -1).filter(index => index >= 0);
    const localIndex = indices.indexOf(layoutIndex);
    const targetLocal = ["up", "left"].includes(direction) ? localIndex - 1 : localIndex + 1;
    if (targetLocal < 0 || targetLocal >= indices.length) return;
    const targetIndex = indices[targetLocal];
    [layout[layoutIndex], layout[targetIndex]] = [layout[targetIndex], layout[layoutIndex]];
  }

  function resizeGroupTracks(group, axis) {
    const tracks = group.map(node => `${clampPercent(node.sizePercent) || (100 / group.length)}%`);
    return tracks.flatMap((track, index) => index < tracks.length - 1 ? [track, "6px"] : [track]).join(" ");
  }

  function startResize(handle, event) {
    const page = currentEditablePage();
    if (!page) return;
    const parentId = handle.dataset.resizeParent || "canvas";
    const axis = handle.dataset.resizeAxis;
    const type = axis === "x" ? "panel" : "row";
    const children = layoutChildren(page, parentId);
    const left = children.find(node => node.recordId === handle.dataset.resizeLeft);
    const right = children.find(node => node.recordId === handle.dataset.resizeRight);
    if (!left || !right) return;
    const leftIndex = children.indexOf(left);
    const rightIndex = children.indexOf(right);
    const group = [];
    for (let index = leftIndex; index >= 0 && children[index].type === type; index -= 1) group.unshift(children[index]);
    for (let index = leftIndex + 1; index < children.length && children[index].type === type; index += 1) group.push(children[index]);
    normalizeLayoutSizes(page, group, type);
    activeResize = { page, axis, group, left, right, startX: event.clientX, startY: event.clientY, startLeft: Number(left.sizePercent) || 50, startRight: Number(right.sizePercent) || 50, container: handle.parentElement };
    document.body.classList.add("is-resizing-layout");
    event.preventDefault();
  }

  function updateActiveResize(event) {
    if (!activeResize) return;
    const rect = activeResize.container.getBoundingClientRect();
    const span = activeResize.axis === "x" ? rect.width : rect.height;
    if (!span) return;
    const delta = activeResize.axis === "x" ? event.clientX - activeResize.startX : event.clientY - activeResize.startY;
    const deltaPercent = delta / span * 100;
    const pairTotal = activeResize.startLeft + activeResize.startRight;
    const minimum = Math.max(5, Math.min(20, pairTotal / 2 - 1));
    const nextLeft = Math.max(minimum, Math.min(pairTotal - minimum, Math.round((activeResize.startLeft + deltaPercent) * 10) / 10));
    activeResize.left.sizePercent = nextLeft;
    activeResize.right.sizePercent = Math.round((pairTotal - nextLeft) * 10) / 10;
    if (activeResize.container) activeResize.container.style[activeResize.axis === "x" ? "gridTemplateColumns" : "gridTemplateRows"] = resizeGroupTracks(activeResize.group, activeResize.axis);
  }

  function finishActiveResize() {
    if (!activeResize) return;
    normalizeLayoutSizes(activeResize.page, activeResize.group, activeResize.axis === "x" ? "panel" : "row");
    saveState();
    activeResize = null;
    document.body.classList.remove("is-resizing-layout");
    render();
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-on"), 1800);
  }

  document.addEventListener("mousedown", event => {
    const handle = event.target.closest("[data-resize-axis]");
    if (handle) startResize(handle, event);
  });

  document.addEventListener("mousemove", updateActiveResize);
  document.addEventListener("mouseup", finishActiveResize);

  document.addEventListener("click", event => {
    const openWorkflowStep = event.target.closest("[data-open-workflow-step]");
    if (openWorkflowStep) {
      const workflow = (state.app.workflows || []).find(candidate => candidate.id === openWorkflowStep.dataset.workflowId);
      const step = workflow && (workflow.steps || []).find(candidate => candidate.id === openWorkflowStep.dataset.stepId);
      if (step && state.pages[step.pageId]) {
        state.activePageId = step.pageId;
        selection = step.surfaceId ? { kind: "record", recordId: step.surfaceId, blockId: "B04" } : { kind: "block", blockId: "B04" };
        showAllBlocks = false;
        updateBlockHash();
        saveState();
        render();
        const target = step.surfaceId && document.querySelector(`[data-mock-record="${step.surfaceId}"]`);
        if (target) { target.classList.add("is-selected"); if (typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "smooth", block: "center" }); }
      }
      return;
    }
    if (event.target.closest("[data-toggle-block-view]")) { showAllBlocks = !showAllBlocks; if (!showAllBlocks) updateBlockHash(); renderDocument(); renderInspector(); if (!showAllBlocks) revealActiveBlock(); return; }
    if (event.target.closest("[data-previous-block], [data-next-block]")) { const index = BLOCKS.findIndex(block => block.id === selection.blockId); const offset = event.target.closest("[data-previous-block]") ? -1 : 1; const target = BLOCKS[index + offset]; if (target) { selectBlock(target.id); renderDocument(); renderInspector(); revealActiveBlock(); } return; }
    const containingBlock = event.target.closest(".block[data-block-section]");
    if (containingBlock) {
      selection = { kind: "block", blockId: containingBlock.dataset.blockSection };
      updateBlockHash();
      $$(".block-jump button").forEach(button => button.classList.toggle("is-active", button.dataset.jumpBlock === selection.blockId));
      $$(".block").forEach(block => block.classList.toggle("is-selected", block.id === selection.blockId));
      renderInspector();
    }
    const openPage = event.target.closest("[data-open-page]");
    if (openPage) { previewMode = false; state.activePageId = openPage.dataset.openPage; selectBlock("B01"); saveState(); render(); return; }
    if (event.target.closest("#template-link")) { previewMode = false; state.activePageId = "template"; selectBlock("B01"); saveState(); render(); return; }
    if (event.target.closest("#new-page-button, [data-open-new-page]")) { openNewPageDialog(); return; }
    if (event.target.closest("#export-button")) { exportJson(state, `${slugify(state.app.name)}-mockument.json`); return; }
    if (event.target.closest("#theme-button")) { cycleTheme(); return; }
    if (event.target.closest("[data-open-preview]")) { previewMode = true; selectBlock("B04"); render(); return; }
    if (event.target.closest("[data-exit-preview]")) { previewMode = false; selectBlock("B04"); render(); revealActiveBlock(); return; }
    if (event.target.closest("[data-add-reviewer]")) { state.app.reviewers.push(""); saveState(); render(); return; }
    if (event.target.closest("[data-add-workflow]")) { const id = nextWorkflowId(); state.app.workflows.push({ id, name: "New workflow", startStepId: "", steps: [], note: "" }); saveState(); render(); return; }
    const removeWorkflow = event.target.closest("[data-remove-workflow]");
    if (removeWorkflow) { state.app.workflows.splice(Number(removeWorkflow.dataset.removeWorkflow), 1); saveState(); render(); return; }
    const addStep = event.target.closest("[data-add-step]");
    if (addStep) { const workflow = state.app.workflows[Number(addStep.dataset.workflow)]; const highest = workflow.steps.reduce((max, step) => { const match = String(step.id || "").match(/^STEP-(\d+)$/); return match ? Math.max(max, Number(match[1])) : max; }, 0); const id = `STEP-${String(highest + 1).padStart(2, "0")}`; workflow.steps.push({ id, name: "New step", pageId: "", surfaceId: "", terminalOutcome: "", note: "", transitions: [] }); if (!workflow.startStepId) workflow.startStepId = id; saveState(); render(); return; }
    const removeStep = event.target.closest("[data-remove-step]");
    if (removeStep) { const workflow = state.app.workflows[Number(removeStep.dataset.workflow)]; const [removed] = workflow.steps.splice(Number(removeStep.dataset.step), 1); workflow.steps.forEach(step => { step.transitions = (step.transitions || []).filter(transition => transition.nextStepId !== removed.id); }); if (workflow.startStepId === removed.id) workflow.startStepId = workflow.steps[0] ? workflow.steps[0].id : ""; saveState(); render(); return; }
    const addTransition = event.target.closest("[data-add-transition]");
    if (addTransition) { const workflow = state.app.workflows[Number(addTransition.dataset.workflow)]; const step = workflow.steps[Number(addTransition.dataset.step)]; const highest = (step.transitions || []).reduce((max, transition) => { const match = String(transition.id || "").match(/^TR-(\d+)$/); return match ? Math.max(max, Number(match[1])) : max; }, 0); step.transitions = step.transitions || []; step.transitions.push({ id: `TR-${String(highest + 1).padStart(2, "0")}`, triggerRef: "", condition: "", nextStepId: "" }); saveState(); render(); return; }
    const removeTransition = event.target.closest("[data-remove-transition]");
    if (removeTransition) { const workflow = state.app.workflows[Number(removeTransition.dataset.workflow)]; const step = workflow.steps[Number(removeTransition.dataset.step)]; step.transitions.splice(Number(removeTransition.dataset.transition), 1); saveState(); render(); return; }
    const removeReviewer = event.target.closest("[data-remove-reviewer]");
    if (removeReviewer) { state.app.reviewers.splice(Number(removeReviewer.dataset.removeReviewer), 1); saveState(); render(); return; }
    const humanToggle = event.target.closest("[data-human-toggle]");
    if (humanToggle) { toggleHumanReview(humanToggle); const scrollY = window.scrollY; render(); window.scrollTo(0, scrollY); return; }
    if (event.target.closest("[data-reset-template-preview]")) { templatePreview = null; selectBlock("B01"); activeGateFilter = null; render(); showToast("Template preview reset"); return; }
    const gateFilter = event.target.closest("[data-gate-filter]");
    if (gateFilter) { activeGateFilter = activeGateFilter === gateFilter.dataset.gateFilter ? null : gateFilter.dataset.gateFilter; const scrollY = window.scrollY; renderDocument(); renderInspector(); window.scrollTo(0, scrollY); return; }
    const build = event.target.closest("[data-build-page]");
    if (build) { const page = state.pages[build.dataset.buildPage]; createFromTemplate(page.name, page.route, page.parentId, page.id); return; }
    const addRowButton = event.target.closest("[data-add-row-region]");
    if (addRowButton) { const page = currentEditablePage(); addRowRegion(page, addRowButton.dataset.addRowRegion || "canvas"); saveState(); render(); return; }
    const addPanelButton = event.target.closest("[data-add-panel-region]");
    if (addPanelButton) { const page = currentEditablePage(); addPanel(page, addPanelButton.dataset.addPanelRegion || "canvas"); saveState(); render(); return; }
    const moveLayout = event.target.closest("[data-move-layout]");
    if (moveLayout) { const page = currentEditablePage(); moveLayoutNode(page, Number(moveLayout.dataset.layoutIndex), moveLayout.dataset.moveLayout); saveState(); render(); return; }
    const removeLayout = event.target.closest("[data-remove-layout]");
    if (removeLayout && confirm("Remove this layout region and everything inside it from the mock and specification registers?")) { const page = currentEditablePage(); removeLayoutNode(page, Number(removeLayout.dataset.layoutIndex)); selection = { kind: "block", blockId: "B04" }; saveState(); render(); return; }
    const addSection = event.target.closest("[data-add-section]");
    if (addSection) { const page = currentEditablePage(); addLayoutSection(page, addSection.dataset.parentId || "canvas"); saveState(); render(); return; }
    const addItem = event.target.closest("[data-add-item]");
    if (addItem) { const page = currentEditablePage(); const type = addItem.closest(".composer-add").querySelector("[data-new-item-type]").value; addLayoutItem(page, Number(addItem.dataset.section), type); saveState(); render(); return; }
    const moveItem = event.target.closest("[data-move-item]");
    if (moveItem) { const page = currentEditablePage(); const items = page.blocks.B04.values.layout[Number(moveItem.dataset.section)].items; moveEntry(items, Number(moveItem.dataset.item), moveItem.dataset.moveItem); saveState(); render(); return; }
    const removeItem = event.target.closest("[data-remove-item]");
    if (removeItem && confirm("Remove this item from the mock and its specification register?")) { const page = currentEditablePage(); const items = page.blocks.B04.values.layout[Number(removeItem.dataset.section)].items; const [removed] = items.splice(Number(removeItem.dataset.item), 1); removeRecord(page, removed.recordId); selectBlock("B04"); saveState(); render(); return; }
    const removeSection = event.target.closest("[data-remove-section]");
    if (removeSection && confirm("Remove this section and all of its items from the mock and specification registers?")) { const page = currentEditablePage(); const [removed] = page.blocks.B04.values.layout.splice(Number(removeSection.dataset.section), 1); [removed.recordId, ...removed.items.map(item => item.recordId)].forEach(id => removeRecord(page, id)); selectBlock("B04"); saveState(); render(); return; }
    const add = event.target.closest("[data-add-row]");
    if (add) {
      const page = currentEditablePage();
      const definition = BLOCKS.find(item => item.id === add.dataset.block);
      const fieldDefinition = findField(definition, add.dataset.field);
      const rows = page.blocks[definition.id].values[fieldDefinition.key];
      const row = newRow(fieldDefinition, rows.length);
      rows.push(row);
      if (fieldDefinition.compact) selection = { kind: "record", recordId: row.id || row._id, blockId: definition.id };
      saveState(); render(); return;
    }
    const remove = event.target.closest("[data-remove-row]");
    if (remove) {
      const page = currentEditablePage();
      const rows = page.blocks[remove.dataset.block].values[remove.dataset.field];
      const [removed] = rows.splice(Number(remove.dataset.row), 1);
      if (remove.dataset.block === "B03" && removed) {
        const id = removed.id || removed._id;
        [...page.blocks.B04.values.elements, ...page.blocks.B04.values.controls].forEach(record => { if (record.dataRef === id) { record.dataRef = "Not yet defined"; if (record.kind === "data") record.presentation = "not yet defined"; } });
      }
      if (remove.dataset.block === "B04" && removed) {
        const id = removed.id || removed._id;
        const layout = page.blocks.B04.values.layout;
        const sectionIndex = layout.findIndex(section => section.recordId === id);
        if (sectionIndex >= 0) {
          const [section] = layout.splice(sectionIndex, 1);
          if (layout[0]) layout[0].items.push(...section.items);
        }
        layout.forEach(section => { section.items = section.items.filter(item => item.recordId !== id); });
      }
      saveState(); render(); return;
    }
    const mockButton = event.target.closest("[data-mock-choice]");
    if (mockButton) { mockChoice[mockButton.dataset.mockChoice] = mockButton.dataset.value; renderDocument(); renderInspector(); return; }
    const record = event.target.closest("[data-mock-record]");
    if (record) { selection = { kind: "record", recordId: record.dataset.mockRecord, blockId: "B04" }; updateBlockHash(); renderInspector(); $$("[data-mock-record]").forEach(node => node.classList.toggle("is-selected", node === record)); $$(".block-jump button").forEach(node => node.classList.toggle("is-active", node.dataset.jumpBlock === selection.blockId)); return; }
    const jump = event.target.closest("[data-jump-block]");
    if (jump) { selectBlock(jump.dataset.jumpBlock); renderDocument(); renderInspector(); revealActiveBlock(); return; }
    const row = event.target.closest("[data-inspect-row]");
    if (row) {
      selection = row.dataset.recordId
        ? { kind: "record", recordId: row.dataset.recordId, blockId: row.dataset.block }
        : { kind: "row", blockId: row.dataset.block, fieldKey: row.dataset.field, rowIndex: Number(row.dataset.row) };
      updateBlockHash();
      renderInspector();
      return;
    }
    const field = event.target.closest("[data-inspect-field]");
    if (field) { selection = { kind: "field", blockId: field.dataset.block, fieldKey: field.dataset.inspectField }; updateBlockHash(); renderInspector(); return; }
    const block = event.target.closest("[data-inspect-block]");
    if (block) { selection = { kind: "block", blockId: block.dataset.inspectBlock }; updateBlockHash(); renderInspector(); $$(".block").forEach(node => node.classList.toggle("is-selected", node.id === selection.blockId)); $$(".block-jump button").forEach(node => node.classList.toggle("is-active", node.dataset.jumpBlock === selection.blockId)); return; }
    if (event.target.closest("[data-export-page]")) { const page = activePage(); exportJson(page, `${slugify(page.name)}-mockument.json`); return; }
    const deleteButton = event.target.closest("[data-delete-page]");
    if (deleteButton && confirm("Delete this page and its local Mockument data?")) {
      const id = deleteButton.dataset.deletePage;
      state.pageOrder.filter(pageId => state.pages[pageId] && state.pages[pageId].parentId === id).forEach(pageId => { state.pages[pageId].parentId = null; });
      state.pageOrder = state.pageOrder.filter(pageId => pageId !== id);
      delete state.pages[id];
      state.activePageId = "template";
      saveState(); render(); showToast("Page deleted");
    }
  });

  document.addEventListener("input", event => {
    if (event.target.matches("[data-workflow-field], [data-step-field], [data-transition-field]")) updateWorkflowField(event.target);
    if (event.target.matches("[data-reviewer-index]")) updateReviewerName(event.target);
    if (event.target.matches("[data-app-setting]")) updateAppSetting(event.target);
    if (event.target.matches("[data-layout-size]")) updateLayoutSize(event.target);
    if (event.target.matches("[data-value-input], [data-block-meta], [data-row-meta]")) updateValue(event.target);
    if (event.target.matches("[data-record-field], [data-record-meta]")) updateRecord(event.target);
    if (event.target.matches("[data-devqa-evidence]")) updateDevQa(event.target);
  });

  document.addEventListener("change", event => {
    if (event.target.matches("[data-workflow-field], [data-step-field], [data-transition-field]")) {
      updateWorkflowField(event.target);
      const scrollY = window.scrollY;
      render();
      window.scrollTo(0, scrollY);
      return;
    }
    if (event.target.matches("[data-human-reviewer]")) {
      updateHumanReviewer(event.target);
      const scrollY = window.scrollY;
      render();
      window.scrollTo(0, scrollY);
      return;
    }
    if (event.target.matches("[data-app-setting]")) {
      updateAppSetting(event.target);
      const scrollY = window.scrollY;
      render();
      window.scrollTo(0, scrollY);
      return;
    }
    if (event.target.matches("[data-devqa-evidence]")) {
      updateDevQa(event.target);
      const scrollY = window.scrollY;
      render();
      window.scrollTo(0, scrollY);
      return;
    }
    if (event.target.matches("[data-layout-size]")) {
      updateLayoutSize(event.target);
      const scrollY = window.scrollY;
      render();
      window.scrollTo(0, scrollY);
      return;
    }
    if (event.target.matches("[data-panel-width]")) {
      const page = currentEditablePage();
      if (page) { page.blocks.B04.values.panels[Number(event.target.dataset.panel)].width = event.target.value; normalizeAllLayoutSizes(page); saveState(); render(); }
      return;
    }
    if (event.target.matches("[data-section-columns]")) {
      const page = currentEditablePage();
      if (page) { page.blocks.B04.values.layout[Number(event.target.dataset.section)].columns = Number(event.target.value); saveState(); render(); }
      return;
    }
    if (event.target.matches("[data-record-field], [data-record-meta]")) {
      updateRecord(event.target);
      const scrollY = window.scrollY;
      render();
      window.scrollTo(0, scrollY);
      return;
    }
    if (event.target.matches("[data-block-status], [data-block-meta], [data-row-status], [data-value-input]")) {
      updateValue(event.target);
      const scrollY = window.scrollY;
      render();
      window.scrollTo(0, scrollY);
    }
  });

  $("#new-page-form").addEventListener("submit", event => {
    event.preventDefault();
    if (event.submitter && event.submitter.value === "cancel") { $("#new-page-dialog").close(); return; }
    const data = new FormData(event.currentTarget);
    createFromTemplate(String(data.get("name")).trim(), String(data.get("route")).trim(), String(data.get("parentId")).trim());
    $("#new-page-dialog").close();
  });

  window.addEventListener("hashchange", () => {
    const blockId = String(window.location.hash || "").replace(/^#/, "");
    if (BLOCKS.some(block => block.id === blockId)) { selectBlock(blockId); renderDocument(); renderInspector(); revealActiveBlock(); }
  });

  const systemTheme = window.matchMedia("(prefers-color-scheme: light)");
  systemTheme.addEventListener("change", () => {
    if ((localStorage.getItem(THEME_KEY) || "system") === "system") applyTheme("system");
  });
  applyTheme(localStorage.getItem(THEME_KEY) || "system");
  render();
})();
