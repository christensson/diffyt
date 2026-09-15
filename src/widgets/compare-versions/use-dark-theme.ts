import {useEffect, useState} from 'react';
import {GLOBAL_DARK_CLASS_NAME} from '@jetbrains/ring-ui-built/components/global/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const hasDarkClass = (): boolean =>
  document.documentElement.classList.contains(GLOBAL_DARK_CLASS_NAME) ||
  document.body.classList.contains(GLOBAL_DARK_CLASS_NAME);

const darkMediaQuery = (): MediaQueryList | null =>
  (typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null);

const isDark = (): boolean => hasDarkClass() || Boolean(darkMediaQuery()?.matches);

/**
 * True when the widget should render in dark mode.
 * Prefers Ring UI's dark class (set by the host when it themes the iframe) and falls back to the
 * OS color scheme, which is what Ring UI's own AUTO theme uses.
 */
export function useDarkTheme(): boolean {
  const [dark, setDark] = useState<boolean>(isDark);

  useEffect(() => {
    const update = () => setDark(isDark());

    const observer = new MutationObserver(update);
    const observerOptions: MutationObserverInit = {attributes: true, attributeFilter: ['class']};
    observer.observe(document.documentElement, observerOptions);
    observer.observe(document.body, observerOptions);

    const media = darkMediaQuery();
    media?.addEventListener('change', update);

    return () => {
      observer.disconnect();
      media?.removeEventListener('change', update);
    };
  }, []);

  return dark;
}
