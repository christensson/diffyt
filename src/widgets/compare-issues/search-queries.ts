/** `ABC-12` or a bare issue number. */
const ID_PATTERN = /^(?:[A-Za-z][\w]*-\d+|\d+)$/;

/**
 * Search queries to try in order: issue-id search for id-like text, summary search for a single
 * word, then plain free text (which also matches summaries) as the fallback.
 */
export const buildQueries = (text: string): string[] => {
  const trimmed = text.trim();
  if (trimmed === '') {
    return [];
  }
  if (ID_PATTERN.test(trimmed)) {
    return [`issue id: ${trimmed}`, trimmed];
  }
  return trimmed.includes(' ') ? [trimmed] : [`summary: ${trimmed}`, trimmed];
};
