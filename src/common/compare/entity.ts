/** Which of the two text parts of an entity an activity item or lookup refers to. */
export type TextKind = 'Summary' | 'Body';

/** Everything that differs between comparing issues and comparing articles. */
export interface EntityAdapter {
  kind: 'issue' | 'article';
  /** REST collection: `issues` or `articles`. */
  apiBase: 'issues' | 'articles';
  /** Lower-case noun for UI texts. */
  noun: string;
  /** What YouTrack calls the summary in this entity's UI ("summary" / "title"). */
  summaryNoun: string;
  /** Activity categories carrying the summary and body text changes. */
  summaryCategory: string;
  bodyCategory: string;
  /** Display name of the body text ("Description" / "Content"), used as row label and section heading. */
  bodyLabel: string;
  /** REST attribute holding the body text. */
  bodyField: 'description' | 'content';
  /** Whether custom fields exist and get their own compare part. */
  supportsFields: boolean;
  /** Readable id shape, e.g. `ABC-12` or `ABC-A-12`. */
  idPattern: RegExp;
}

export const ISSUE: EntityAdapter = {
  kind: 'issue',
  apiBase: 'issues',
  noun: 'issue',
  summaryNoun: 'summary',
  summaryCategory: 'SummaryCategory',
  bodyCategory: 'DescriptionCategory',
  bodyLabel: 'Description',
  bodyField: 'description',
  supportsFields: true,
  idPattern: /^(?:[A-Za-z][\w]*-\d+|\d+)$/
};

export const ARTICLE: EntityAdapter = {
  kind: 'article',
  apiBase: 'articles',
  noun: 'article',
  summaryNoun: 'title',
  summaryCategory: 'ArticleSummaryCategory',
  bodyCategory: 'ArticleDescriptionCategory',
  bodyLabel: 'Content',
  bodyField: 'content',
  supportsFields: false,
  idPattern: /^[A-Za-z][\w]*-A-\d+$/
};
