# Diffyt

A YouTrack app that compares versions of an issue's **summary**, **description**, and **custom fields**.

It adds a **Compare versions** item to the issue options menu ("…" in the issue toolbar). The widget
lists every summary, description, and custom field change from the issue's activity stream and shows a
line-by-line diff, inline or side by side, with optional word-level highlighting.

- Select **one** version to see what changed in it compared to the previous version.
- Tick **two** versions of the same field to diff them directly, including the initial content.
- Filter the list by **All | Summary | Description | Fields**.
- Collapse the version list to give the diff the full width.

The widget is frontend only: it calls the YouTrack REST API
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
├── common/utils/logger.ts        # Frontend logger
└── widgets/compare-versions/
    ├── index.html / index.tsx    # Widget entry (Ring UI styles, React root)
    ├── app.tsx                   # Host registration, data loading, state
    ├── api.ts                    # Activity item types + paginated fetch via host.fetchYouTrack
    ├── versions.ts               # Builds version streams (incl. v1 and custom field state reconstruction)
    ├── field-values.ts           # Custom field value presentation and multi-value set arithmetic
    ├── selection.ts              # Pure helpers: selection rules, diff derivation, formatting
    ├── version-list.tsx          # Left column: filter, version rows, checkboxes
    ├── diff-pane.tsx             # Toolbar + react-diff-viewer-continued
    ├── use-dark-theme.ts         # Dark-mode detection inside the widget iframe
    ├── app.css                   # Layout (Ring UI CSS variables only)
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

## How the diff is derived

The list shows **versions** of a field, not raw changes. Every field (Summary, Description, and each
custom field) is its own version stream numbered v1, v2, …; two versions can only be compared within
one stream.

**Summary and Description.** Each activity item holds the text after the change in `added`, so every
item becomes one version. The state before the oldest change is taken from that item's `removed` and
shown as v1, dated with the issue's creation time and reporter. If the oldest change started from an
empty field, that change itself is v1 and no extra row is added.

**Custom fields.** Items of `CustomFieldCategory` carry the values that were added and removed. For
multi-value fields these are only the changed values, so the full state of every version is
reconstructed by starting from the issue's current field values and walking the changes backwards
(`before = after − added + removed`). If the current values cannot be loaded, states are built forwards
from the oldest item's `removed`. Versions are rendered as text so they can be diffed:

```
Priority: Critical

Subsystems:
- UI
- API
```

Date fields are formatted as dates, period fields use their presentation, and an empty field renders
as just `Field:`.

- One selected version: diff against the previous version of the same field. v1 has no predecessor,
  so its text is shown as is.
- Two selected versions: diff between them, oldest on the left. The first pick is the baseline; a
  third pick replaces the second. Picking v1 and the newest version shows the whole history of the
  field in one diff.

Requests, all in parallel: the Summary/Description list with `added` only (pages of 42), the custom
field list with `added` and `removed`, the oldest Summary and Description items with `removed`, and the
issue's `created`, `reporter`, and current `customFields`.

## Ideas for later

- Rendered-markdown diff mode (render both sides, then an HTML-aware diff).
- Comments as an additional category.
- Article version comparison via `ARTICLE_OPTIONS_MENU_ITEM`.

## Learn More

- [YouTrack App Development Guide](https://www.jetbrains.com/help/youtrack/devportal/apps-quick-start-guide.html)
- [Extension points](https://www.jetbrains.com/help/youtrack/devportal/apps-reference-extension-points.html)
- [Activities REST resource](https://www.jetbrains.com/help/youtrack/devportal/resource-api-issues-issueID-activities.html)
- [react-diff-viewer-continued](https://github.com/Aeolun/react-diff-viewer-continued)
