# Diffyt

A YouTrack app that diffs issues: the versions of one issue over time, or two issues against each other.

It adds two items to the issue options menu ("…" in the issue toolbar):

- **Compare versions** lists every summary, description, and custom field change from the issue's
  activity stream and shows a line-by-line diff, inline or side by side, with optional word-level
  highlighting.
- **Compare to other** diffs the current issue against another issue picked through a search field.
  The search matches issue IDs and summary text. Two modes: **Content** (summary and description,
  opened first) and **Fields** (all custom fields as one YAML-style document). Only the latest state
  of both issues is compared.

### Compare versions

- Every version is the **complete issue state** after one save; v1 is the state at creation.
- Choose a part to compare: **Content** (summary and description) or **Fields** (all custom fields
  as one YAML-style document). The list shows the versions that changed that part, plus v1.
- Select **one** version to see what changed in it, or tick **two** to diff them directly.
- Collapse the version list to give the diff the full width.

Both widgets are frontend only: they call the YouTrack REST API
(`GET /api/issues/{id}/activities` for the `DescriptionCategory`, `SummaryCategory`, and
`CustomFieldCategory` categories) through the Host API. There is no app backend, no workflows, and no settings.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create `.env` in the project root (see `.env.example`):

```bash
YOUTRACK_HOST=https://your-youtrack.url
YOUTRACK_TOKEN=perm:your-permanent-token
```

Get a permanent token: YouTrack profile → Account Security → New token. See
[token management](https://www.jetbrains.com/help/youtrack/server/manage-permanent-token.html).

3. Build and upload:

```bash
npm run update
```

4. In YouTrack, open **Administration → Apps → Diffyt**, attach the app to a project, then open an
issue in that project and pick **Compare versions** from the "…" menu.

## Project Structure

```
manifest.json                     # App manifest: one ISSUE_OPTIONS_MENU_ITEM widget
public/icon.svg                   # App icon
src/
├── common/
│   ├── utils/logger.ts           # Frontend logger
│   └── compare/                  # Shared by both widgets
│       ├── api.ts                # REST types + fetches (activities, snapshot, issue search)
│       ├── field-values.ts       # Custom field value presentation and multi-value set arithmetic
│       ├── issue-state.ts        # Field catalogue and Content/Fields text rendering
│       ├── diff-pane.tsx/.css    # Toolbar + react-diff-viewer-continued
│       ├── use-dark-theme.ts     # Dark-mode detection inside the widget iframe
│       └── types.ts              # LoadStatus, ViewOptions, DiffModel
├── widgets/compare-versions/
│   ├── index.html / index.tsx    # Widget entry (Ring UI styles, React root)
│   ├── app.tsx                   # Host registration, data loading, state
│   ├── versions.ts               # Builds the timeline of full issue states (v1 + one per save)
│   ├── selection.ts              # Selection rules, diff derivation, formatting
│   ├── version-list.tsx          # Left column: part tabs, version rows, checkboxes
│   ├── app.css                   # Layout (Ring UI CSS variables only)
│   └── widget-icon.svg
└── widgets/compare-issues/
    ├── index.html / index.tsx    # Widget entry
    ├── app.tsx                   # Current issue + picked issue → Content/Fields diff
    ├── issue-search.tsx          # Ring UI Select with server-side issue search
    ├── app.css
    └── widget-icon.svg
```

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | Clean, lint, typecheck, build `dist/`, validate the manifest |
| `npm run build:nolint` | Same without lint/typecheck |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run typecheck` | `tsc --noEmit` for the widget code |
| `npm run upload-local` | Upload `dist/` using `.env` credentials |
| `npm run update` | `build` + `upload-local` |
| `npm run watch` | Rebuild on change and upload after every build (refresh the YouTrack page) |
| `npm run dev` | Upload a dev bundle that loads from `localhost:9000`, then start Vite with HMR |
| `npm run pack` | Create `diffyt.zip` for manual upload |

## Compare to other

The search field runs a YouTrack search query. Text that looks like an issue ID (`ABC-12` or a bare
number) is searched with `issue id:`; other text is searched in summaries with `summary:`, falling back
to a free-text search when that finds nothing. The current issue is excluded from the results. After a
pick, both issues' current state is loaded and diffed, current issue on the left. The Fields document
covers the union of both issues' custom fields, in the current issue's project order first.

## How the versions diff is derived

All Summary, Description, and custom field activity items are sorted by time and traversed to build a
timeline of **complete issue states**. Items with the same timestamp were saved together and form one
version, labelled with everything it changed (e.g. "Summary, Priority"). v1 is the state at creation,
dated with the issue's creation time and reporter.

Each version holds two parts, and the **Content | Fields** tabs pick which part is diffed. A tab
lists only the versions that changed its part (plus v1); version numbers are global, so a tab may show
v1, v3, v7. Because each version is a full state, any two picks diff correctly.

The Content part is the summary on the first line, a blank line, `Description:`, and the description:

```
Start button stays grey after restart

Description:
Intro paragraph about the feature.
…
```

- Summary and Description activity items hold the text after the change in `added`; the text at
  creation is the oldest item's `removed`, or the current text when the field never changed.
- Custom field items carry the values added and removed. For multi-value fields these are only the
  changed values, so states are reconstructed by starting from the issue's current field values and
  walking backwards (`before = after − added + removed`). Without current values, states are built
  forwards from the oldest item's `removed`.
- The Fields part lists every custom field of the issue in project order, including unchanged ones
  (they fold away with "Only changes"), plus fields that appear in history but no longer exist. The
  document is compared with the diff viewer's YAML method, which is line-based, so word-level
  highlighting is not available in that mode:

```
Priority: Critical
Subsystems:
- UI
- API
Due Date: Oct 1, 2026
Type: Bug
```

- One selected version: diff against the previous version listed in the tab. v1 has no predecessor,
  so its text is shown as is.
- Two selected versions: diff between them, oldest on the left. The first pick is the baseline; a
  third pick replaces the second.

Requests, all in parallel: the Summary/Description list with `added` only (pages of 42), the custom
field list with `added` and `removed`, the oldest Summary and Description items with `removed`, and the
issue's `created`, `reporter`, `summary`, `description`, and current `customFields`.

## Ideas for later

- Rendered-markdown diff mode (render both sides, then an HTML-aware diff).
- Comments as an additional category.
- Article version comparison via `ARTICLE_OPTIONS_MENU_ITEM`.

## Learn More

- [YouTrack App Development Guide](https://www.jetbrains.com/help/youtrack/devportal/apps-quick-start-guide.html)
- [Extension points](https://www.jetbrains.com/help/youtrack/devportal/apps-reference-extension-points.html)
- [Activities REST resource](https://www.jetbrains.com/help/youtrack/devportal/resource-api-issues-issueID-activities.html)
- [react-diff-viewer-continued](https://github.com/Aeolun/react-diff-viewer-continued)
