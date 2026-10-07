/* ============================================================
   Interaktions-Skript, ohne Bibliothek
   ------------------------------------------------------------
   1. Mobiles Menü: aus dem Fokus solange es zu ist, Esc, Fokus zurück
   2. Inhalte erscheinen beim Erreichen (ohne Skript sind sie sichtbar)
   3. Referenzen-Filter (nur auf /referenzen vorhanden)
   4. Kontaktformular an den Worker anbinden (Ziel steht in der Form-Aktion)
   Die Spur im Schaublatt zeichnet sich rein per CSS.
   ============================================================ */
(function () {
  'use strict';
  var wurzel = document.documentElement;
  wurzel.classList.add('js');
  var sparsam = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------------------- Mobiles Menü -------------------- */
  var menuKnopf = document.querySelector('.menu-knopf');
  var menu = document.querySelector('.mobilmenue');
  var hinter = document.querySelectorAll('main, .abschluss, footer.fuss, .fussleiste, .notleiste');
  function menuSetzen(offen, fokusZurueck) {
    if (!menu || !menuKnopf) return;
    menu.setAttribute('data-offen', String(offen));
    menuKnopf.setAttribute('aria-expanded', String(offen));
    menuKnopf.setAttribute('aria-label', offen ? 'Menü schließen' : 'Menü öffnen');
    document.body.style.overflow = offen ? 'hidden' : '';
    Array.prototype.forEach.call(hinter, function (el) {
      if (offen) { el.setAttribute('inert', ''); } else { el.removeAttribute('inert'); }
    });
    if (offen) {
      var erster = menu.querySelector('a');
      if (erster) erster.focus({ preventScroll: true });
    } else if (fokusZurueck) {
      menuKnopf.focus();
    }
  }
  if (menuKnopf && menu) {
    menuKnopf.addEventListener('click', function () {
      menuSetzen(menu.getAttribute('data-offen') !== 'true', true);
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) menuSetzen(false, false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.getAttribute('data-offen') === 'true') menuSetzen(false, true);
    });
    matchMedia('(min-width: 1080px)').addEventListener('change', function (e) {
      if (e.matches && menu.getAttribute('data-offen') === 'true') menuSetzen(false, false);
    });
  }

  /* -------------------- Einsetzender Inhalt -------------------- */
  var ziele = document.querySelectorAll('[data-einsetzen]');
  if (ziele.length && 'IntersectionObserver' in window) {
    var verzoegerung = 0;
    var beobachter = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (e) {
        if (!e.isIntersecting) return;
        var wartezeit = sparsam ? 0 : Math.min(verzoegerung, 3) * 50;
        verzoegerung += 1;
        setTimeout(function () { verzoegerung = Math.max(0, verzoegerung - 1); }, 300);
        setTimeout(function () { e.target.setAttribute('data-eingesetzt', 'true'); }, wartezeit);
        beobachter.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(ziele, function (el) { beobachter.observe(el); });
  } else {
    Array.prototype.forEach.call(ziele, function (el) { el.setAttribute('data-eingesetzt', 'true'); });
  }

  /* -------------------- Referenzen-Filter -------------------- */
  var filterLeiste = document.querySelector('.filter-leiste');
  var faelle = document.querySelectorAll('.fallkarte');
  if (filterLeiste && faelle.length) {
    filterLeiste.addEventListener('click', function (e) {
      var knopf = e.target.closest('button');
      if (!knopf) return;
      Array.prototype.forEach.call(filterLeiste.children, function (b) { b.setAttribute('aria-pressed', 'false'); });
      knopf.setAttribute('aria-pressed', 'true');
      var kategorie = knopf.dataset.kategorie;
      Array.prototype.forEach.call(faelle, function (karte) {
        var passt = kategorie === 'alle' || karte.dataset.kategorie === kategorie;
        karte.hidden = !passt;
      });
    });
  }

  /* -------------------- Kontaktformular an den Worker anbinden -------------------- */
  var formular = document.getElementById('schaden-melden');
  var meldung = document.getElementById('formular-meldung');
  function meldungSetzen(text, art) {
    meldung.textContent = text;
    meldung.className = art || '';
  }
  if (formular && meldung && window.fetch) {
    formular.addEventListener('submit', function (e) {
      e.preventDefault();
      var fehlend = [];
      ['name', 'telefon'].forEach(function (n) {
        var f = formular.elements[n];
        var leer = !f.value.trim();
        f.setAttribute('aria-invalid', leer ? 'true' : 'false');
        if (leer) fehlend.push(f);
      });
      var zustimmung = formular.elements.einwilligung;
      if (!zustimmung.checked) fehlend.push(zustimmung);
      if (fehlend.length) {
        meldungSetzen('Bitte Name, Telefonnummer und Einwilligung ausfüllen.', 'fehler');
        fehlend[0].focus();
        return;
      }
      var knopf = formular.querySelector('button[type=submit]');
      knopf.disabled = true;
      meldungSetzen('Wird gesendet …', '');
      var daten = {
        name: formular.name.value.trim(),
        telefon: formular.telefon.value.trim(),
        anliegen: [
          formular.schadenart ? 'Art: ' + formular.schadenart.value : '',
          formular.ort ? 'Ort: ' + formular.ort.value.trim() : '',
          formular.fahrzeug ? 'Fahrzeug: ' + formular.fahrzeug.value.trim() : '',
          formular.unfalldatum && formular.unfalldatum.value ? 'Datum: ' + formular.unfalldatum.value : '',
          formular.kontaktart ? 'Bevorzugt: ' + formular.kontaktart.value : '',
          formular.nachricht ? formular.nachricht.value.trim() : ''
        ].filter(Boolean).join(' · '),
        einwilligung: 'ja',
        website: formular.website ? formular.website.value : ''
      };
      fetch(formular.action, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(daten)
      }).then(function (r) {
        return r.json().catch(function () { return { ok: false }; }).then(function (d) { return { status: r.status, d: d }; });
      }).then(function (x) {
        if (x.d && x.d.ok) {
          meldungSetzen('Danke. Ich melde mich in der Regel am selben Werktag bei Ihnen.', 'ok');
          formular.reset();
        } else if (x.d && x.d.felder) {
          meldungSetzen('Bitte prüfen: ' + Object.values(x.d.felder).join(' '), 'fehler');
        } else {
          meldungSetzen((x.d && x.d.fehler) || 'Senden hat nicht geklappt. Rufen Sie mich bitte direkt an.', 'fehler');
        }
      }).catch(function () {
        meldungSetzen('Keine Verbindung. Rufen Sie mich bitte direkt an oder schreiben Sie per WhatsApp.', 'fehler');
      }).finally(function () { knopf.disabled = false; });
    });
  }
})();
