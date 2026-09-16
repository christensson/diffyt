export type LoadStatus = 'loading' | 'ready' | 'error';

export interface ViewOptions {
  splitView: boolean;
  wordDiff: boolean;
  showDiffOnly: boolean;
}

export type DiffModel =
  | {mode: 'diff'; label: string; oldText: string; newText: string; leftTitle: string; rightTitle: string}
  | {mode: 'initial'; label: string; text: string; title: string};
