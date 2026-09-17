# Diffyt - a YouTrack Diffing App

<img src="./public/icon.svg" alt="Diffyt icon" width="128" height="128">

A YouTrack app that diffs tickets and knowledge base articles: the versions of one item over time, or
two items against each other.

It adds two items to the ticket options menu ("…" in the issue toolbar) and two to the article options
menu:

- **Compare versions** - <img src="./src/widgets/ticket-versions/widget-icon.svg" width="20" height="20"> -
  lists every summary, description, and custom field change from the issue's activity stream and
  shows a line-by-line diff, inline or side by side, with optional word-level highlighting.
- **Compare with another ticket** - <img src="./src/widgets/ticket-compare/widget-icon.svg" width="20" height="20"> -
  diffs the current ticket against another one picked through a
  search field. The search matches ticket IDs and summary text. Two modes: **Content** (summary and
  description, opened first) and **Fields** (all custom fields as one YAML-style document). Only the
  latest state of both tickets is compared.
- **Compare versions** and **Compare with another article** in the article menu do the same for
  articles, diffing the title and content only (articles have no custom fields, so there is no Fields
  mode). Article history comes from the `ArticleSummaryCategory` and `ArticleDescriptionCategory`
  activities.

The diffing uses [react-diff-viewer-continued](https://github.com/Aeolun/react-diff-viewer-continued).

### Compare versions

- Every version is the **complete ticket state** after one save; v1 is the state at creation.
- Choose a part to compare: **Content** (summary and description) or **Fields** (all custom fields
  as one YAML-style document). The list shows the versions that changed that part, plus v1.
- Select **one** version to see what changed in it, or tick **two** to diff them directly.
- Collapse the version list to give the diff the full width.
- Dates follow the **date format and time zone from your YouTrack profile** (Profile → General), read
  once per widget from `GET /api/users/me`. If that request fails, YouTrack's default format
  (`d MMM yyyy HH:mm`) is used.

All widgets are frontend only: they call the YouTrack REST API
(`GET /api/issues/{id}/activities` for the `DescriptionCategory`, `SummaryCategory`, and
`CustomFieldCategory` categories, plus `GET /api/users/me` for the date format) through the Host API. There is no app backend, no workflows, and no settings.

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

4. In YouTrack, open **Administration → Apps → Diffyt**, attach the app to a project, then open a
ticket in that project and pick **Compare versions** from the "…" menu.

## Project Structure

```
manifest.json                     # App manifest: one ISSUE_OPTIONS_MENU_ITEM widget
public/icon.svg                   # App icon
src/
├── common/
│   ├── utils/logger.ts           # Frontend logger
│   └── compare/                  # Everything the four widgets share
│       ├── entity.ts             # Issue/article adapter: REST base, categories, labels
│       ├── api.ts                # REST types + fetches (activities, snapshot, search)
│       ├── versions.ts           # Timeline of full entity states (v1 + one per save)
│       ├── selection.ts          # Selection rules, diff derivation, version titles
│       ├── date-format.ts        # Profile date format/time zone + Java-pattern formatter
│       ├── field-values.ts       # Custom field value presentation and multi-value set arithmetic
│       ├── issue-state.ts        # Field catalogue and Content/Fields text rendering
│       ├── search-queries.ts     # Search plan for the "compare to other" field
│       ├── versions-app.tsx/.css # "Compare versions" UI (version list + diff)
│       ├── compare-app.tsx/.css  # "Compare with another …" UI (search + diff)
│       ├── version-list.tsx, entity-search.tsx, diff-pane.tsx/.css, use-dark-theme.ts, types.ts, base.css
└── widgets/
    ├── ticket-versions/         # Ticket: VersionsApp with the ISSUE adapter
    ├── ticket-compare/           # Ticket: CompareApp with the ISSUE adapter
    ├── article-versions/         # Article: VersionsApp with the ARTICLE adapter
    └── article-compare/          # Article: CompareApp with the ARTICLE adapter
        └── index.html / index.tsx / app.tsx / widget-icon.svg
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

## Compare with another ticket / article

The search field runs a YouTrack search query. Text that looks like a issue ID (`ABC-12` or a bare
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

The Content part is a `Summary:` heading, the summary, a blank line, a `Description:` heading, and the
description. The heading lines are rendered as section titles in the diff:

```
Summary:
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
Due Date: 1 Oct 2026
Type: Bug
```

- One selected version: diff against the previous version listed in the tab. v1 (labelled
  *Initial*) has no predecessor, so it is shown in the same view with nothing highlighted.
- Two selected versions: diff between them, oldest on the left. The first pick is the baseline; a
  third pick replaces the second.

Requests, all in parallel: the Summary/Description list with `added` only (pages of 42), the custom
field list with `added` and `removed`, the oldest Summary and Description items with `removed`, and the
issue's `created`, `reporter`, `summary`, `description`, and current `customFields`.
