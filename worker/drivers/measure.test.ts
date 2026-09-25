import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { measurePage, measureScript } from './measure.js';

function measure(html: string, locale = 'en', lang = 'en', width = 1024) {
  const win = new Window({ width, height: 800 });
  const doc = win.document as unknown as Document;
  doc.documentElement.setAttribute('lang', lang);
  doc.body.innerHTML = html;
  return measurePage(doc, win as unknown as globalThis.Window, locale);
}

describe('measurePage', () => {
  it('counts visible fields, required ones and words; ignores hidden/script/style', () => {
    const m =
      measure(`<form><label>Email <input name="e" required></label><label>Pw <input type="password" aria-required="true"></label>
      <input type="hidden" name="h"><div hidden><input name="x"><p>hidden words here</p></div><p style="display:none">gone</p>
      <select aria-label="Pick"><option>One</option></select><textarea aria-label="Note"></textarea><input type="submit" value="Go">
      <script>var ignored = "words";</script><style>.x{}</style></form><p>Hello the world</p>`);
    expect(m.visibleFields).toBe(4);
    expect(m.requiredFields).toBe(2);
    expect(m.visibleWords).toBe(6); // Email, Pw, One, Hello, the, world
  });

  it('finds controls without accessible names, by role', () => {
    const m =
      measure(`<button><svg aria-hidden="true"></svg></button><a href="/x"></a><input><input type="checkbox">
      <input type="radio"><input type="search"><select></select><input type="button"><div role="tab" tabindex="0"></div>
      <button aria-label="Named"></button><span id="lbl">Title</span><input aria-labelledby="lbl"><input id="i1"><label for="i1">For</label>
      <input aria-labelledby="missing"><input title="T"><input placeholder="P"><a href="/y"><img alt="Logo"></a><button>Text</button>`);
    expect(m.unnamedByRole).toEqual({
      button: 2,
      link: 1,
      textbox: 2,
      checkbox: 1,
      radio: 1,
      searchbox: 1,
      combobox: 1,
      tab: 1,
    });
    expect(m.unnamedControls).toBe(10);
  });

  it('detects captcha, cookie banner, terms checkbox', () => {
    const m = measure(`<div role="dialog" aria-label="Cookies"><p>We use cookies</p></div>
      <label><input type="checkbox"> I am not a robot</label><label><input type="checkbox"> I accept the terms</label>`);
    expect(m).toMatchObject({ captcha: true, cookieBanner: true, termsCheckbox: true });
    const iframe = measure(
      `<iframe src="https://captcha.example/x"></iframe><div role="alertdialog" hidden>cookie</div>`,
    );
    expect(iframe).toMatchObject({ captcha: true, cookieBanner: false, termsCheckbox: false });
    expect(measure(`<div role="dialog"><p>Plain</p></div>`).cookieBanner).toBe(false);
  });

  it('reads validation errors and judges their clarity', () => {
    const m = measure(
      `<p role="alert">Error.</p><p role="alert">Enter an email address like name@example.com.</p><p role="alert"> </p><p role="alert" hidden>x</p>`,
    );
    expect(m.validationErrors).toBe(2);
    expect(m.unclearErrors).toBe(1);
    expect(m.alerts[1]).toContain('name@example.com');
    expect(measure(`<p role="alert">Une erreur est survenue</p>`).unclearErrors).toBe(1);
  });

  it('flags text in the wrong language', () => {
    const english =
      '<p>Create your account and invite the team to your boards with the plan for this</p>';
    const french =
      '<p>Créez votre compte et invitez les membres de votre équipe pour une meilleure organisation des tâches</p>';
    expect(measure(english, 'fr').foreignText).toBe(true);
    expect(measure(english, 'en').foreignText).toBe(false);
    expect(measure(french, 'en').foreignText).toBe(true);
    expect(measure(french, 'fr').foreignText).toBe(false);
    expect(measure('<p>the the</p>', 'fr').foreignText).toBe(false);
  });

  it('detects horizontal overflow', () => {
    const win = new Window({ width: 300, height: 800 });
    const doc = win.document as unknown as Document;
    Object.defineProperty(doc.documentElement, 'scrollWidth', { value: 500 });
    expect(measurePage(doc, win as unknown as globalThis.Window, 'en').horizontalOverflow).toBe(
      true,
    );
    expect(measure('<p>x</p>').horizontalOverflow).toBe(false);
  });

  it('serialises into an injectable script', () => {
    const script = measureScript('fr');
    expect(script).toContain('function looksForeign(');
    expect(script).toMatch(
      /return \(function measurePage[\s\S]*\)\(document, window, "fr"\);\n\}\)\(\)$/,
    );
    const win = new Window();
    (win.document as unknown as Document).body.innerHTML = '<input aria-label="x">';
    // The serialised helpers run on their own, exactly as in a real page.
    const run = new Function('document', 'window', `return ${script}`);
    expect(run(win.document, win).visibleFields).toBe(1);
  });
});
