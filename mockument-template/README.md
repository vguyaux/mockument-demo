# Mockument Template

A static, local-first authoring template built from the Honest Mockument and Honest Requirements methods.

## Run locally

From the repository root:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8000/mockument-template/
```

## Navigation model

- **Template** is permanent and parked at the bottom of the left column. It is never part of the proposed application menu.
- Template is an interactive preview: fields, dropdowns, statuses, rows, sections, columns and composer actions can all be tried temporarily. Preview changes are never persisted or copied and can be reset.
- Copy Template to create a page. The page receives fresh, independent B01–B13 records from the canonical source—not the temporary preview.
- New pages can be top-level menu items or submenus beneath an existing top-level page.
- Planned pages can be added as `not drawn`, keeping proposed destinations visible until Template is copied into them.
- **Settings** always exists as an application page. It begins as `not drawn` and can be built from Template.
- **Data Dictionary** is an application-level left-menu section, not a page. It has submenu links for Data catalog, Provider registry, Provider feeds, Source routes, Page usages and Data questions. Each section can switch between **Look in form** and **Look in tables** views.
- Settings also contains the Mockument-wide application name and a clean list of people working on it. Human-review dropdowns use this same people list. Browser titles use `Application Name — Page Name`.
- Every block has four human-review controls—Walk-through, Mockument QA, Build and Dev QA. Each box records the confirming person and date/time. A block must have Block status set to `Done` before its Walk-through AI stage can be ready. Mockument QA becomes available only after the Walk-through human check is confirmed, Build becomes available only after the Mockument QA human check is confirmed, and Dev QA becomes available once Build is confirmed.
- The top navigator shows separate AI-stage and human-check matrices for all 13 blocks and acts as the block menu.
- Focused block view is the default. B01 includes the page overview—Canonical page source/Mockument page heading, metadata, page tools and overall readiness—above the B01 block. B02–B13 hide that overview and render only the selected block beneath the pinned dashboard. A reserved scrollbar gutter prevents movement when block heights differ. Previous/Next controls and URL hashes support sequential and deep-linked navigation.
- **View all blocks** remains available for printing, browser search and full-document review.

## Data Dictionary, data definitions and mock composer

Data Dictionary is the application-wide source of truth for data. A canonical field belongs in the Data catalog once; if it can come from different places for CAD/USD, US/Canada, security/ETF/fund or any other condition, each option becomes a separate Source route with explicit routing conditions. Provider facts belong in the Provider registry. Provider Registry column F is split into Provider feeds so routes can point at exact feed/file IDs rather than repeating free text. Spreadsheet/source text is retained as raw imported evidence until a human turns it into verified routes.

B03 defines page-specific business data before B04 composes the page. A B03 row can link to a Data Dictionary field or remain local/provisional. Cardinality (`one` or `many`) and structure (`value` or `record`) describe the data independently of its presentation. Data-bound mock records select a B03 definition, a Data Dictionary definition, remain explicitly unresolved, or create a new B03 definition directly from the inspector.

B04 begins as a blank layout canvas; it no longer assumes a fixed application menu, content column, or single panel row. A copied page can:

- Add rows for full-width horizontal bands, or add panels directly for a split screen.
- Nest panels inside rows and rows inside panels, so headers, split content, inspectors, toolbars, footers and nested regions can be represented in either direction.
- Give every row a stable `ROW-##` ID and every panel a stable `PNL-##` ID, semantic role, human-readable description and trace.
- Size sibling panels and rows as responsive percentages. Drag the divider between panels to change width, or between rows to change height; the stored percentages resize with the browser.
- Mark every row, panel, section, component and action as required, proposed, unanswered, observed or out of scope independently from its work status.
- Restrict rows, panels, sections, components and actions by role or page condition, so switching the mock controls changes what is visible.
- Add content sections inside any row or panel and choose one, two or three inner columns per section.
- Add static content, data-bound components, navigation, notices and actions to a content section.
- Build application-page, current-surface, workflow-step or custom navigation only when the page actually needs it.
- Click any row, panel, section or component and edit its canonical record in the permanent right inspector.
- Open a full-browser Preview that shows only the mock canvas filling the tab; the small arrow in the top-right returns to B04.

B04 owns canonical row, panel, component and action records without rendering repeated registers. A data-bound component derives valid presentation choices from its B03 definition: one value, one record, or a many-item list/table presentation. Lists require an item definition and tables require named columns. Its grouped **Review view** offers Clean, Honesty, IDs, and Honesty + IDs modes so status evidence, backing markers and stable references remain independently inspectable without permanent visual clutter. The inspector also lists B12 records that reference the selected mock item.

B05 records only material page-level departures from the automatic default condition. Sorting, filtering, column movement, selection and expansion remain B04 component behavior. Selecting a B05 condition annotates the mock with its changed message, affected components, unavailable actions and next step.

B08 explicitly records whether nothing changes without a person acting or refreshing, or whether meaningful information may change while the page remains open. Only the latter reveals update records. B04 owns immediate interaction results; B08 owns externally caused updates, notification timing and stale-work handling.

B12 is one compact honesty register. Every record begins with a Decision, Observation, Question or Scope dropdown and reveals only the fields appropriate to that authority. Active decisions are included in B13’s build contract only when their applied canonical references are recorded.

Settings includes a generated Mockument overview: all drawn and not-drawn pages, page readiness, blocking questions, page-level data references and shared component references.

Application workflows are canonical graphs managed in Settings. Steps select real pages and optional B04 rows, panels, sections, tabs or wizard steps by stable ID. Transitions select real B04 actions or an explicit business event, support branch conditions and point to another stable step or a terminal outcome. B10 is a generated local participation view; graph validation catches missing, unreachable and unconnected references.

## Data and persistence

The app stores the working Mockument, including Data Dictionary, in browser `localStorage` under `honest-mockument-template-state`. The initial Buckler IDD workbook is converted into `assets/seed-data-dictionary.js` so new/local states start with the imported catalog, providers, provider feeds from column F, source lineage, screen usages and generated data questions.

Use **Export** to download the complete Mockument as JSON.

## App-wide changes

Shared layout, definitions, validation and inspector behavior live in `assets/`. Existing pages store only page content. Schema changes should:

1. Update `block-definitions.js` and the canonical Template.
2. Increase `SCHEMA_VERSION` and/or `TEMPLATE_VERSION` in `template.js`.
3. Add a migration in `migrateState()`.
4. Preserve existing answers and mark newly required information as To Do.
5. Add an entry to the app-level change log.

The phrase **“This is a change to the app”** means the change must affect shared behavior, migrate existing pages, and update Template for future pages.
