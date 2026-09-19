import type {Part} from './versions';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface ViewOptions {
  splitView: boolean;
  wordDiff: boolean;
  showDiffOnly: boolean;
}

/** `part` says which text is diffed, so the pane can pick YAML mode and section headings from it. */
export type DiffModel =
  | {mode: 'diff'; part: Part; label: string; oldText: string; newText: string; leftTitle: string; rightTitle: string}
  | {mode: 'initial'; part: Part; label: string; text: string; title: string};
