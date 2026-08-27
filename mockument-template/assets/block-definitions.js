(function () {
  "use strict";

  const text = (key, label, question, options = {}) => ({ type: "text", key, label, question, ...options });
  const textarea = (key, label, question, options = {}) => ({ type: "textarea", key, label, question, ...options });
  const select = (key, label, question, choices, options = {}) => ({ type: "select", key, label, question, choices, ...options });
  const rows = (key, label, question, fields, options = {}) => ({ type: "rows", key, label, question, fields, ...options });

  window.MOCKUMENT_BLOCKS = [
    {
      id: "B01", group: "Identity", title: "Page header", answeredBy: "Page owner",
      definition: "Name the page and record its route, build status, version, date, owner, readiness gates, and the share of visible elements that are actually required.",
      why: "A page must be independently identifiable, ownable and reviewable. Readiness is calculated from its records rather than asserted.",
      fields: [
        text("name", "Page name", "What is this page called? This one value is also used for the menu label, page heading, and browser title.", { required: true, placeholder: "Template" }),
        textarea("activity", "Business activity", "What business activity does this page support, why does someone open it, and what should they leave with?", { required: true, rows: 4 }),
        text("route", "Route", "Where does this page live in the proposed app?", { required: true, placeholder: "/book-of-business" }),
        select("buildStatus", "Build status", "Is this page new or a modification of an existing page?", ["new", "modification of an existing page"]),
        text("version", "Version", "Which version of this page specification is this?", { placeholder: "0.1" }),
        text("updated", "Updated", "When was this page last changed?", { inputType: "date" }),
        text("owner", "Page owner", "Who keeps this page specification accurate?", { required: true })
      ]
    },
    {
      id: "B02", group: "Identity", title: "Roles", answeredBy: "Business user",
      definition: "List the roles that can access this page, what differs for each role, and what each role must not see. A role belongs here only when it can reach the page.",
      why: "Listing a role grants page access in the specification. Roles without access are omitted rather than documented one by one.",
      fields: [rows("roles", "Roles with access", "Which roles can access this page, and what differs between them?", [
        text("role", "Role", "Which role can access this page?"),
        textarea("differs", "What differs", "What changes for this role?"),
        textarea("mustNotSee", "Must not see", "What must this role never see?")
      ], { idPrefix: "ROLE" })]
    },
    {
      id: "B03", group: "Specification", title: "Data definitions", answeredBy: "Business user for meaning and timing; data owner for source",
      definition: "Define the business data available to the page before composing data-bearing elements. Definitions may remain provisional while the mock reveals what is missing.",
      why: "Presentation should select known business data rather than silently inventing meaning, provenance, timing or calculations after it has been drawn.",
      fields: [rows("data", "Data definitions for this page", "What business data can this page use?", [
        text("id", "Data ID", "What stable ID addresses this definition?", { placeholder: "DATA-01" }),
        text("name", "Business name", "What is this data called?"),
        textarea("meaning", "Meaning", "What does it mean in business words?"),
        select("cardinality", "Cardinality", "Does this definition describe one item or many?", ["not yet defined", "one", "many"]),
        select("structure", "Structure", "Is each item an atomic value or a record with named attributes?", ["not yet defined", "value", "record"]),
        text("unit", "Unit or format", "What unit or display format does it use?"),
        text("asOf", "As of", "What point in time is this value as of?"),
        text("visibleWhen", "Available when", "When is it available to this page?"),
        select("provenance", "Provenance", "Who supplies it?", ["held by us", "a provider", "the user", "computed", "nobody knows"]),
        textarea("calculation", "Calculation", "How is it calculated, if applicable?"),
        select("userChange", "User can change", "Can a person change this data here?", ["yes", "no", "unknown"]),
        text("sample", "Example value", "What example value may appear in the mock?"),
        select("rung", "Rung", "How far has this definition climbed?", ["below L0", "L0 exists", "L1 display", "L2 sourced", "L3 verified"])
      ], { idPrefix: "DATA", compact: true })]
    },
    {
      id: "B04", group: "The mock", title: "Mock composer", answeredBy: "Page owner with business users",
      definition: "Compose the low-fidelity page from sections, static content, data-bound components, notices and actions. Every component receives a stable record edited in the inspector.",
      why: "B03 defines what the data is; B04 defines how a person encounters it. Presentation choices are constrained by the selected data definition instead of silently inventing another data model.",
      custom: "mock",
      fields: [
        text("defaultRole", "Default role", "Which role opens first?"),
        rows("elements", "Element records", "Canonical records created by the mock composer and edited in the inspector.", [
          text("id", "ID", "What stable ID addresses this element?", { placeholder: "EL-01" }),
          select("kind", "Kind", "What structural kind of component is this?", ["content", "data", "notice", "section"]),
          text("name", "Component", "What is the component called?"),
          textarea("shows", "Shows or accepts", "What does it show or accept?"),
          select("dataRef", "Data definition", "Which B03 data definition supplies this component?", [], { dynamicOptions: "data", allowUnresolved: true, forKinds: ["data"] }),
          select("presentation", "Presentation", "How should a person encounter the selected data?", [], { dynamicOptions: "presentation", forKinds: ["data"] }),
          select("surfaceRole", "Surface role", "Can a workflow target this section as a named surface?", ["ordinary section", "workflow section", "tab", "wizard step", "panel"], { forKinds: ["section"] }),
          text("trace", "Traces to", "Which requirement, decision or question accounts for it?"),
          textarea("itemTemplate", "List item", "What does one list item contain?", { forPresentations: ["list"] }),
          textarea("columns", "Table columns", "Which named columns appear, and what does each mean?", { forPresentations: ["table"] }),
          textarea("ordering", "Ordering", "What order does this collection appear in?", { forPresentations: ["list", "table"] }),
          textarea("filtering", "Filter or group", "How may it be filtered or grouped?", { forPresentations: ["list", "table"] }),
          textarea("selection", "Selection", "Can items be picked out, and what happens then?", { forPresentations: ["list", "table"] }),
          textarea("nesting", "Nesting", "Does anything sit inside anything else, and how deep?", { forPresentations: ["list"] }),
          textarea("empty", "Nothing", "What appears when the collection is empty?", { forPresentations: ["list", "table"] }),
          textarea("one", "One", "What appears when there is only one item?", { forPresentations: ["list", "table"] }),
          textarea("overflow", "More than fits", "What appears when there are more items than fit here?", { forPresentations: ["list", "table"] })
        ], { idPrefix: "EL", starter: true, hidden: true }),
        rows("controls", "Control records", "Canonical controls created by the mock composer and edited in the inspector.", [
          text("id", "ID", "What stable ID addresses this control?", { placeholder: "CTL-01" }),
          text("name", "Control", "What is the control called?"),
          select("effect", "Business effect", "What does this control do?", ["acts on data", "changes the page", "both"]),
          select("dataRef", "Data definition", "Which B03 data definition does this control read or change?", [], { dynamicOptions: "data", allowUnresolved: true }),
          select("serverData", "Server-only data", "Does it use information only the server knows?", ["yes", "no", "unknown"]),
          text("leadsTo", "Leads to", "Where does it lead?"),
          textarea("confirmation", "Confirm or undo", "What confirmation or undo must exist?")
        ], { idPrefix: "CTL", starter: true, hidden: true })
      ]
    },
    {
      id: "B05", group: "Specification", title: "Page conditions", answeredBy: "Business user",
      definition: "Record only named, page-level conditions that materially change what a person sees, understands, or is allowed to do. The default condition is automatic.",
      why: "Sorting, filtering, column movement, selection and expansion belong to B04 component behavior. A page condition belongs here only when the page's message, major visibility, available business actions, ability to continue, or required next step changes.",
      fields: [rows("conditions", "Departures from default", "When does the page enter a materially different condition?", [
        text("name", "Condition", "What is this page-level condition called?", { placeholder: "read-only, submitted, locked, unavailable…" }),
        textarea("when", "When", "What business or availability circumstance causes it?"),
        textarea("changes", "What changes from default", "What does the person see or understand differently?"),
        text("affected", "Affected components", "Which B04 component IDs change, disappear, or become prominent?"),
        textarea("unavailableActions", "Unavailable actions", "Which business actions are no longer available, and why?"),
        textarea("next", "What next", "Can the primary work continue, and what must the person do next?")
      ], { idPrefix: "COND" })]
    },
    {
      id: "B06", group: "Specification", title: "What can go wrong", answeredBy: "Business user",
      definition: "Describe failures as the person notices them, what should happen next, and who should be told. Do not guess at technical causes.",
      why: "“The message did not arrive” is a business failure. “The network dropped” is an implementation diagnosis.",
      fields: [rows("failures", "Failure register", "What can go wrong as the person would notice it?", [
        textarea("noticed", "What they notice", "What can go wrong as the person notices it?"),
        textarea("response", "Expected response", "What should happen when it does?"),
        text("whoIsTold", "Who is told", "Who needs to know?")
      ], { idPrefix: "FAIL" })]
    },
    {
      id: "B07", group: "Specification", title: "Remembered between visits", answeredBy: "Business user",
      definition: "State what the app remembers about this person between visits, for how long, and whether the person can clear it.",
      why: "Remembered choices feel like facts about the world, so people rarely volunteer them unless asked directly.",
      fields: [
        textarea("remembered", "What is remembered", "What should the app remember about you between visits?"),
        text("duration", "For how long", "How long should it remember this?"),
        textarea("clearable", "Clearing it", "Can the person clear or reset what is remembered?")
      ]
    },
    {
      id: "B08", group: "Specification", title: "Updates while the page is open", answeredBy: "Business user",
      definition: "State whether meaningful business information may change while the page remains open without the current person directly causing that change.",
      why: "B04 owns immediate results of the person's actions. B08 owns changes caused by the underlying world, including how the person learns about them and how stale or in-progress work is protected.",
      fields: [
        select("updateExpectation", "Update expectation", "Can meaningful information change while this page remains open?", ["not yet answered", "nothing changes unless the person acts or refreshes", "information may change while the page is open"]),
        rows("liveChanges", "Updates while open", "What may change without the current person directly causing it?", [
          textarea("change", "What changes", "What business information may become different or stale?"),
          textarea("businessEvent", "Business event", "What event in the underlying world causes the change?"),
          text("affected", "Affected data and components", "Which B03 data IDs and B04 component IDs are affected?"),
          text("whenSeen", "When it should appear", "When should the person see the newer information?"),
          select("updateMethod", "Update method", "How does the business expect the newer information to appear?", ["not yet defined", "automatically", "when the person refreshes", "either is acceptable"]),
          textarea("howTold", "How they are told", "How does the person know that something changed?"),
          textarea("collectionEffect", "Collection effect", "Can items arrive, disappear, or move within the current order?"),
          textarea("midAction", "During an action", "What happens if the person is editing or acting when it changes?"),
          textarea("staleConflict", "Stale work or conflict", "How is stale work or a conflicting change handled?"),
          text("resultingCondition", "Resulting page condition", "Does this lead to a B05 condition? Record its condition ID or name.")
        ], { idPrefix: "LIVE", showWhen: { key: "updateExpectation", value: "information may change while the page is open" } })
      ]
    },
    {
      id: "B09", group: "Specification", title: "Connections", answeredBy: "Page owner",
      definition: "Record where a person arrives from, where they can go, and which shared components the page uses. Keep the graph walkable in both directions.",
      why: "Real links expose dead ends and missing pages while the app is still inexpensive to change.",
      fields: [
        rows("from", "Comes from", "Where can a person arrive from?", [text("label", "Page or step", "What is it called?"), text("href", "Destination", "What route or page ID links it?")], { idPrefix: "FROM" }),
        rows("to", "Goes to", "Where can a person go next?", [text("label", "Page or step", "What is it called?"), text("href", "Destination", "What route or page ID links it?")], { idPrefix: "TO" }),
        rows("components", "Shared components", "Which shared components does this page use?", [text("id", "Component ID", "What stable ID addresses it?"), text("name", "Component", "What is it called?")], { idPrefix: "CMP" })
      ]
    },
    {
      id: "B10", group: "Specification", title: "Workflow participation", answeredBy: "Business user",
      definition: "Show the canonical application workflows that reference this page, its sections, tabs, wizard steps, panels, or actions.",
      why: "Workflows cross page boundaries and therefore live at application level. B10 is generated from stable references rather than asking each page to repeat names and positions as text.",
      custom: "workflowParticipation",
      fields: []
    },
    {
      id: "B11", group: "Honesty", title: "Copy register", answeredBy: "Business user",
      definition: "Record every user-visible string and mark it as required wording or placeholder wording.",
      why: "Wording is where unattended builders invent most freely. A labeled placeholder is safe; an unlabeled one becomes product.",
      fields: [rows("copy", "Copy register", "What exact words can a person see?", [
        text("id", "Copy ID", "What stable ID addresses this string?", { placeholder: "COPY-01" }),
        text("where", "Where", "Where does it appear?"),
        textarea("string", "Exact string", "What exact words appear?"),
        select("copyStatus", "Wording status", "Is this required wording or a placeholder?", ["required wording", "placeholder"]),
        textarea("note", "Note", "What should a reviewer know about it?")
      ], { idPrefix: "COPY" })]
    },
    {
      id: "B12", group: "Honesty", title: "Decisions, observations, questions and scope", answeredBy: "The person responsible for the selected record type",
      definition: "Keep one typed honesty register. Every entry begins by declaring whether it is a decision, observation, question, or scope exclusion, then asks only the fields appropriate to that type.",
      why: "One addressable register keeps discoveries and boundaries together without blurring their authority: decisions are accepted, observations are learned, questions remain unresolved, and scope exclusions are deliberate.",
      fields: [rows("records", "Honesty register", "What must remain visible about this page?", [
        select("type", "Type", "What kind of record is this?", ["decision", "observation", "question", "scope"]),
        textarea("statement", "Record", "What was decided, observed, asked, or placed outside scope?"),
        text("affects", "Affected records", "Which stable page, data, component, action, condition, workflow, or wording IDs does this affect?"),
        select("decisionScope", "Decision scope", "How broadly does this accepted decision apply?", ["this page", "application-wide", "data or source", "workflow"], { forTypes: ["decision"] }),
        text("decidedBy", "Decided by", "Who had authority to make or accept this decision?", { forTypes: ["decision"] }),
        text("decidedWhen", "Decision date", "When was it decided?", { inputType: "date", forTypes: ["decision"] }),
        textarea("rationale", "Rationale", "Why was this choice made?", { forTypes: ["decision"] }),
        text("supersedes", "Supersedes", "Which earlier decision ID does this replace?", { forTypes: ["decision"] }),
        select("decisionLifecycle", "Decision lifecycle", "Is this decision active or superseded?", ["active", "superseded"], { forTypes: ["decision"] }),
        text("appliedTo", "Applied to", "Which canonical records were updated because of this decision?", { forTypes: ["decision"] }),
        text("raisedBy", "Raised by", "Who made this observation?", { forTypes: ["observation"] }),
        text("observedWhen", "Observed on", "When was it observed?", { inputType: "date", forTypes: ["observation"] }),
        textarea("questionWhy", "Why it matters", "Why does this question need an answer?", { forTypes: ["question"] }),
        text("blocks", "Blocks", "What review, decision, workflow, or build work does it block?", { forTypes: ["question"] }),
        text("answerOwner", "Who must answer", "Who owes the answer?", { forTypes: ["question"] }),
        text("neededBy", "Needed by", "When is the answer needed?", { inputType: "date", forTypes: ["question"] }),
        textarea("scopeWhy", "Why outside scope", "Why is this deliberately not answered here?", { forTypes: ["scope"] })
      ], { idPrefix: "HON", compact: true })]
    },
    {
      id: "B13", group: "Honesty", title: "Build contract and machine-readable record", answeredBy: "Page owner and implementing agent",
      definition: "Produce the instruction handed to the builder: what to build, what not to invent, what to ask about first, what done means, and the structured record used by tooling.",
      why: "The contract constrains implementation to agreed information and turns missing answers into explicit stops rather than inventions.",
      custom: "contract",
      fields: [
        textarea("must", "Build exactly this", "What must the implementation include?", { rows: 5 }),
        textarea("mustNotInvent", "Do not invent", "Which choices must the builder not make?", { rows: 5 }),
        textarea("askFirst", "Stop and ask first", "Which unanswered matters must be resolved before building?", { rows: 5 }),
        textarea("acceptance", "Done means", "What observable, testable outcomes mean this page is done?", { rows: 5 })
      ]
    }
  ];
})();
