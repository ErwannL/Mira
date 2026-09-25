/** What the in-page measurement returns (a subset of Facts plus the alert texts). */
export interface PageMeasure {
  visibleFields: number;
  requiredFields: number;
  visibleWords: number;
  unnamedControls: number;
  unnamedByRole: Record<string, number>;
  captcha: boolean;
  cookieBanner: boolean;
  termsCheckbox: boolean;
  horizontalOverflow: boolean;
  foreignText: boolean;
  validationErrors: number;
  unclearErrors: number;
  alerts: string[];
}

/**
 * Measures the facts of the current page from the DOM only (what an accessibility tree exposes).
 * Self-contained: unit-tested in happy-dom and injected into real pages as source text.
 */
export function measurePage(doc: Document, win: Window, locale: string): PageMeasure {
  const hiddenEl = (el: Element | null): boolean => {
    for (let e = el; e; e = e.parentElement) {
      if (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true') return true;
      if (win.getComputedStyle(e).display === 'none') return true;
    }
    return false;
  };
  const text = (el: Element | null): string => (el ? (el.textContent as string) : '').replace(/\s+/g, ' ').trim();
  const nameOf = (el: Element): string => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) return by.split(/\s+/).map((id) => text(doc.getElementById(id))).join(' ').trim();
    const id = el.getAttribute('id');
    const forLabel = id ? doc.querySelector(`label[for="${id}"]`) : null;
    const label = forLabel ?? el.closest('label');
    if (label) return text(label);
    if (el.tagName === 'BUTTON' || el.tagName === 'A') {
      const alt = Array.from(el.querySelectorAll('img[alt]')).map((i) => i.getAttribute('alt')).join(' ');
      return `${text(el)} ${alt}`.trim();
    }
    return (el.getAttribute('title') ?? el.getAttribute('placeholder') ?? '').trim();
  };
  const roleOf = (el: Element): string => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    if (el.tagName === 'A') return 'link';
    if (el.tagName === 'BUTTON') return 'button';
    if (el.tagName === 'SELECT') return 'combobox';
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') return type;
    if (type === 'submit' || type === 'button') return 'button';
    if (type === 'search') return 'searchbox';
    return 'textbox';
  };

  const controls = Array.from(doc.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"]')).filter(
    (el) => el.getAttribute('type') !== 'hidden' && !hiddenEl(el),
  );
  const fields = controls.filter((el) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && !['submit', 'button'].includes(el.getAttribute('type') ?? ''));
  const unnamedByRole: Record<string, number> = {};
  for (const el of controls) {
    if (nameOf(el)) continue;
    const role = roleOf(el);
    unnamedByRole[role] = (unnamedByRole[role] ?? 0) + 1;
  }

  const words: string[] = [];
  const walker = doc.createTreeWalker(doc.body, 4);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement as Element;
    if (['SCRIPT', 'STYLE'].includes(parent.tagName) || hiddenEl(parent)) continue;
    words.push(...((n.textContent as string).match(/\p{L}+/gu) ?? []));
  }
  const lower = words.map((w) => w.toLowerCase());
  const count = (list: string[]) => lower.filter((w) => list.includes(w)).length;
  const enScore = count(['the', 'and', 'your', 'you', 'with', 'to', 'of', 'for', 'this']);
  const frScore = count(['le', 'la', 'les', 'et', 'vous', 'votre', 'des', 'pour', 'une', 'du']);
  const foreign = words.length > 5 && (locale === 'fr' ? enScore > frScore : frScore > enScore);

  const dialogs = Array.from(doc.querySelectorAll('[role="dialog"], [role="alertdialog"]')).filter((d) => !hiddenEl(d));
  const checkboxes = fields.filter((el) => roleOf(el) === 'checkbox');
  const alerts = Array.from(doc.querySelectorAll('[role="alert"]'))
    .filter((a) => !hiddenEl(a))
    .map(text)
    .filter(Boolean);
  const unclear = (m: string): boolean =>
    m.length < 15 || /^(error|erreur|invalid|invalide|oops|something went wrong|une erreur est survenue)\W*$/i.test(m);

  return {
    visibleFields: fields.length,
    requiredFields: fields.filter((el) => el.hasAttribute('required') || el.getAttribute('aria-required') === 'true').length,
    visibleWords: words.length,
    unnamedControls: Object.values(unnamedByRole).reduce((a, b) => a + b, 0),
    unnamedByRole,
    captcha: checkboxes.some((el) => /robot|captcha/i.test(nameOf(el))) || doc.querySelector('iframe[src*="captcha"]') !== null,
    cookieBanner: dialogs.some((d) => /cookie/i.test(`${d.getAttribute('aria-label') ?? ''} ${text(d)}`)),
    termsCheckbox: checkboxes.some((el) => /terms|conditions|cgu/i.test(nameOf(el))),
    horizontalOverflow: doc.documentElement.scrollWidth > win.innerWidth + 1,
    foreignText: foreign,
    validationErrors: alerts.length,
    unclearErrors: alerts.filter(unclear).length,
    alerts,
  };
}

export function measureScript(locale: string): string {
  return `(${measurePage.toString()})(document, window, ${JSON.stringify(locale)})`;
}
