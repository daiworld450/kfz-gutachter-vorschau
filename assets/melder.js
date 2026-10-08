/* ============================================================
   Formulare: Schadenmelder (fünf Schritte), Kurzmelder (Startseite), Zusammenarbeit (Kanzleien)
   ------------------------------------------------------------
   - Ohne Skript bleibt jedes Formular ein normales einseitiges Formular (der Browser prüft selbst).
   - Solange die Form-Aktion noch der Platzhalter [[WORKER-ADRESSE …]] ist (Vorschau), geht NICHTS ins Netz.
     Der Erfolgszustand sagt dann ehrlich, dass nichts gesendet wurde.
   - Fotos werden hier nicht verarbeitet: Schritt 4 verweist ehrlich auf WhatsApp (der Worker nimmt keine Anhänge an).
   - Übergabe von der Startseite: sessionStorage (nur in diesem Tab, nie in der Adresse), Telefonnummer und Ort
     stehen deshalb nicht in der URL. Von der Schadenaufnahme kommt ?zone=front|heck|links|rechts|scheibe|felge.
   ============================================================ */
(function () {
  'use strict';
  var sparsam = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ZONEN = ['front', 'heck', 'links', 'rechts', 'scheibe', 'felge'];
  var ARTEN = ['auffahrunfall', 'parkschaden', 'seitenschaden', 'frontschaden', 'sonstiges'];
  var SPEICHER = 'melder-start';

  function $(s, w) { return (w || document).querySelector(s); }
  function $$(s, w) { return Array.prototype.slice.call((w || document).querySelectorAll(s)); }
  function leeren(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function heuteIso() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function datumDe(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : iso; }
  function istVorschau(form) { var a = form.getAttribute('action') || ''; return !/^https:\/\//i.test(a) || a.indexOf('[[') !== -1; }

  /* -------------------- Prüfung -------------------- */
  var FORMAT = {
    name:        function (v) { return v.trim().length >= 2; },
    ort:         function (v) { return v.trim().length >= 3; },
    telefon:     function (v) { var z = v.replace(/\D/g, ''); return z.length >= 7 && z.length <= 15 && /^[0-9+()\/.\s-]+$/.test(v); },
    email:       function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); },
    kennzeichen: function (v) { return /^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 \-]{1,11}$/i.test(v.trim()); },
    datum:       function (v) { return !v || (v >= '2000-01-01' && v <= heuteIso()); }
  };

  function fehlerEl(feld) { return feld.id ? document.getElementById(feld.id + '-fehler') : null; }
  function fehlerSetzen(feld, text) {
    var el = fehlerEl(feld);
    if (text) {
      feld.setAttribute('aria-invalid', 'true');
      if (el) { el.querySelector('span').textContent = text; el.hidden = false; }
    } else {
      feld.removeAttribute('aria-invalid');
      if (el) { el.hidden = true; el.querySelector('span').textContent = ''; }
    }
  }
  /* streng: auch "leer" melden. Beim Verlassen eines Feldes (streng = false) nur falsches Format. */
  function pruefen(feld, streng) {
    if (feld.hasAttribute('data-gruppe')) {
      return (streng && feld.hasAttribute('data-pflicht') && !feld.querySelector('input:checked')) ? feld.getAttribute('data-fehler-leer') : '';
    }
    if (feld.type === 'checkbox') return (streng && feld.required && !feld.checked) ? feld.getAttribute('data-fehler-leer') : '';
    var wert = feld.value;
    var pflicht = feld.required || feld.hasAttribute('data-pflicht');
    if (!wert.trim()) return (streng && pflicht) ? (feld.getAttribute('data-fehler-leer') || 'Bitte ausfüllen.') : '';
    var fmt = feld.getAttribute('data-format');
    if (fmt && FORMAT[fmt] && !FORMAT[fmt](wert)) return feld.getAttribute('data-fehler-format') || feld.getAttribute('data-fehler-leer') || 'Bitte prüfen.';
    return '';
  }
  function felderIn(bereich) {
    return $$('[data-gruppe], input, select, textarea', bereich).filter(function (f) {
      return !f.disabled && f.type !== 'radio' && f.name !== 'website' && (f.id || f.hasAttribute('data-gruppe'));
    });
  }
  /* "Telefon ODER E-Mail": In einer Gruppe (data-oder-gruppe) genügt eines der Felder (data-oder). Die Meldung steht einmal
     über beiden Feldern, beide Felder zeigen aria-invalid und verweisen per aria-describedby darauf. Liefert das erste Feld, wenn die Gruppe leer ist. */
  function oderGruppen(bereich, streng) {
    var erstes = null;
    $$('[data-oder-gruppe]', bereich).forEach(function (g) {
      var felder = $$('[data-oder]', g), fehler = document.getElementById(g.getAttribute('data-oder-gruppe') + '-fehler');
      var leer = felder.every(function (f) { return !f.value.trim(); });
      var meldung = (streng && leer) ? g.getAttribute('data-fehler-oder') : '';
      if (fehler) { fehler.hidden = !meldung; fehler.querySelector('span').textContent = meldung; }
      felder.forEach(function (f) {
        var eigen = fehlerEl(f);
        if (meldung) f.setAttribute('aria-invalid', 'true');
        else if (eigen && eigen.hidden) f.removeAttribute('aria-invalid');
      });
      if (meldung && !erstes) erstes = felder[0];
    });
    return erstes;
  }
  /* steht die Gruppen-Meldung gerade, nach jeder Eingabe neu bewerten (verschwindet, sobald eines der Felder gefüllt ist) */
  function oderAuffrischen(feld) {
    var g = feld.closest && feld.closest('[data-oder-gruppe]');
    var fehler = g && document.getElementById(g.getAttribute('data-oder-gruppe') + '-fehler');
    if (fehler && !fehler.hidden) oderGruppen(g.parentNode, true);   /* parentNode: querySelectorAll findet nur Nachfahren */
  }
  /* prüft einen Bereich, zeigt alle Fehler, liefert das erste fehlerhafte Feld */
  function bereichPruefen(bereich) {
    var erstes = null;
    /* das erste Feld in Dokumentreihenfolge gewinnt, auch wenn der Fehler aus der Telefon-oder-E-Mail-Gruppe stammt */
    function frueher(f) { if (f && (!erstes || (erstes.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_PRECEDING))) erstes = f; }
    felderIn(bereich).forEach(function (f) {
      var t = pruefen(f, true);
      fehlerSetzen(f, t);
      if (t) frueher(f);
    });
    frueher(oderGruppen(bereich, true));
    return erstes;
  }
  /* bringt ein Element in den sichtbaren Bereich, unter dem festen Kopf und über der Handy-Leiste */
  function sichtbar(el) {
    var kopf = (document.querySelector('header.kopf') || { offsetHeight: 64 }).offsetHeight;
    var leiste = document.querySelector('.fussleiste');
    var unten = leiste && getComputedStyle(leiste).display !== 'none' ? leiste.offsetHeight : 0;
    var r = el.getBoundingClientRect(), dy = 0;
    if (r.top < kopf + 16) dy = r.top - kopf - 24;
    else if (r.bottom > window.innerHeight - unten - 16) dy = r.bottom - window.innerHeight + unten + 24;
    if (dy) { try { window.scrollBy({ top: dy, behavior: 'instant' }); } catch (e) { window.scrollBy(0, dy); } }
  }
  function fehlerFokus(feld) {
    var ziel = feld.hasAttribute('data-gruppe') ? (feld.querySelector('input:checked') || feld.querySelector('input')) : feld;
    if (ziel) ziel.focus({ preventScroll: true });
    var grp = feld.closest && feld.closest('[data-oder-gruppe]');
    var gf = grp && document.getElementById(grp.getAttribute('data-oder-gruppe') + '-fehler');
    var el = (gf && !gf.hidden) ? grp : (feld.closest('.feld') || fehlerEl(feld) || feld);
    sichtbar(el);
  }
  /* sofortige Rückmeldung: beim Verlassen nur Format, beim Tippen/Wählen Fehler wieder wegnehmen */
  function liveRueckmeldung(form) {
    form.addEventListener('focusout', function (e) {
      var f = e.target;
      if (!f.id || f.type === 'radio' || f.type === 'checkbox' || !(f.matches('input,select,textarea'))) return;
      fehlerSetzen(f, pruefen(f, false));
      oderAuffrischen(f);
    });
    function wegnehmen(e) {
      var f = e.target.closest ? (e.target.closest('[data-gruppe]') || e.target) : e.target;
      if (f.getAttribute && f.getAttribute('aria-invalid') === 'true') fehlerSetzen(f, pruefen(f, true));
      oderAuffrischen(f);
    }
    form.addEventListener('input', wegnehmen);
    form.addEventListener('change', wegnehmen);
  }

  /* -------------------- gemeinsamer Erfolgszustand -------------------- */
  function erfolgZeigen(form, vorschau) {
    var erfolg = $('[data-erfolg]', form);
    if (!erfolg) return;
    $('[data-erfolg-vorschau]', erfolg).hidden = !vorschau;
    $('[data-erfolg-live]', erfolg).hidden = vorschau;
    erfolg.hidden = false;
    form.classList.add('ist-gesendet');
    erfolg.focus({ preventScroll: true });
    var r = erfolg.getBoundingClientRect();
    if (r.top < 70 || r.top > window.innerHeight * 0.5) {
      try { window.scrollTo({ top: window.pageYOffset + r.top - 90, behavior: 'instant' }); } catch (e) { window.scrollTo(0, window.pageYOffset + r.top - 90); }
    }
  }
  function senden(form, nutzlast, wennOk, statusEl, knopf) {
    knopf.disabled = true;
    statusEl.className = 'melder-status';
    statusEl.textContent = 'Wird gesendet …';
    function fehler(t) { statusEl.className = 'melder-status fehler-box'; statusEl.textContent = t; }
    fetch(form.getAttribute('action'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nutzlast) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (d) { return { status: r.status, d: d }; }); })
      .then(function (x) {
        if (x.d && x.d.ok) { statusEl.textContent = ''; wennOk(); }
        else if (x.status === 429) fehler('Zu viele Versuche kurz hintereinander. Bitte in zehn Minuten erneut versuchen oder anrufen. Ihre Angaben sind noch da.');
        else if (x.d && x.d.felder) fehler('Bitte prüfen: ' + Object.keys(x.d.felder).map(function (k) { return x.d.felder[k]; }).join(' '));
        else fehler((x.d && x.d.fehler) || 'Senden hat nicht geklappt. Ihre Angaben sind noch da. Bitte rufen Sie mich direkt an oder schreiben Sie per WhatsApp.');
      })
      .catch(function () { fehler('Keine Verbindung. Ihre Angaben sind noch da. Bitte erneut versuchen, anrufen oder per WhatsApp schreiben.'); })
      .then(function () { knopf.disabled = false; });
  }

  /* ============================================================
     Schadenmelder
     ============================================================ */
  function melderInit(form) {
    var schritte = $$('.schritt', form);
    var N = schritte.length;
    var punkte = $$('.melder-fortschritt li', form);
    var ansage = $('[data-ansage]', form);
    var statusEl = $('[data-status]', form);
    var kopf = $('.melder-kopf', form), block = $('.melder-schritte', form);
    var notiz = $('[data-uebernommen]', form);
    var vorschau = istVorschau(form);
    var aktuell = 1, erreicht = 1, notizFuer = 1;

    form.noValidate = true;
    form.classList.add('melder-aktiv');
    var datum = $('#f-datum', form);
    if (datum) datum.max = heuteIso();
    liveRueckmeldung(form);
    var kz = $('#f-kennzeichen', form);
    if (kz) kz.addEventListener('change', function () { kz.value = kz.value.trim().toUpperCase(); });

    /* Live-Region nur für Fehler und Erfolg. Bei normalem Schrittwechsel sagt der Fokus auf der Gruppe („Schritt x von 5 …“, aus der
       Legende) schon alles; dieselbe Ansage zusätzlich in der Live-Region wäre doppelt. Erst leeren, dann setzen: so wird auch ein
       zweiter, gleich lautender Fehler wieder angesagt. */
    var sagenZeit = 0;
    function sagen(text) {
      ansage.textContent = '';
      clearTimeout(sagenZeit);
      if (text) sagenZeit = setTimeout(function () { ansage.textContent = text; }, 60);
    }
    function radioText(name) {
      var r = $('input[name="' + name + '"]:checked', form);
      if (!r) return '';
      var l = $('label[for="' + r.id + '"]', form);
      var t = l ? (($('b', l) || l).textContent.trim()) : r.value;
      return name === 'zone' ? t.charAt(0) + t.slice(1).toLowerCase() : t;
    }
    function wert(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

    /* ---- Navigation ---- */
    function nachVornScrollen() {
      var r = form.getBoundingClientRect();
      var kopfHoehe = (document.querySelector('header.kopf') || { offsetHeight: 64 }).offsetHeight;
      if (r.top < kopfHoehe + 8 || r.top > window.innerHeight * 0.4) {
        var y = window.pageYOffset + r.top - kopfHoehe - 12;
        try { window.scrollTo({ top: y, behavior: 'instant' }); } catch (e) { window.scrollTo(0, y); }
      }
    }
    function gehe(zu, opt) {
      opt = opt || {};
      zu = Math.max(1, Math.min(N, zu));
      var richtung = zu >= aktuell ? 'vor' : 'zurueck';
      aktuell = zu;
      erreicht = Math.max(erreicht, zu);
      schritte.forEach(function (el, i) {
        var an = (i + 1) === zu;
        el.hidden = !an;
        el.classList.remove('ein-vor', 'ein-zurueck');
        if (an && !sparsam && !opt.tastatur && !opt.still) { void el.offsetWidth; el.classList.add(richtung === 'vor' ? 'ein-vor' : 'ein-zurueck'); }
      });
      punkte.forEach(function (li, i) {
        var nr = i + 1, k = $('button', li);
        var status = nr === zu ? 'aktuell' : (nr <= erreicht ? 'fertig' : 'offen');
        li.setAttribute('data-status', status);
        if (nr === zu) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        k.disabled = status === 'offen' || nr === zu;
      });
      if (zu === N) { summeBauen($('[data-summe]', form), true); kurzBauen(); }
      if (notiz.textContent) notiz.hidden = aktuell !== notizFuer;
      sagen('');
      if (opt.verlauf !== 'keiner') {
        try { history[opt.verlauf === 'ersetzen' ? 'replaceState' : 'pushState']({ melder: zu }, ''); } catch (e) { /* ohne Verlauf weiter */ }
      }
      if (!opt.ohneFokus) { schritte[zu - 1].focus({ preventScroll: true }); nachVornScrollen(); }
    }
    function weiter(tastatur) {
      var schlecht = bereichPruefen(schritte[aktuell - 1]);
      if (schlecht) { sagen('Bitte prüfen Sie die markierten Angaben.'); fehlerFokus(schlecht); return; }
      if (aktuell < N) gehe(aktuell + 1, { tastatur: tastatur });
    }
    function zurueck(tastatur) { if (aktuell > 1) gehe(aktuell - 1, { tastatur: tastatur }); }

    form.addEventListener('click', function (e) {
      var k = e.target.closest('button');
      if (!k) return;
      var tastatur = e.detail === 0;      /* Klick per Tastatur: keine Bewegung */
      if (k.hasAttribute('data-weiter')) weiter(tastatur);
      else if (k.hasAttribute('data-zurueck')) zurueck(tastatur);
      else if (k.hasAttribute('data-springe')) { var ziel = parseInt(k.getAttribute('data-springe'), 10); if (ziel && ziel <= erreicht) gehe(ziel, { tastatur: tastatur }); }
      else if (k.hasAttribute('data-neu')) neu();
    });
    /* Enter im Feld: nächster Schritt statt Absenden (Textfelder und Auswahl) */
    form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.isComposing) return;
      var t = e.target;
      if (!t.matches || !t.matches('input') || t.type === 'submit') return;
      e.preventDefault();
      if (aktuell < N) weiter(true); else absenden();
    });
    window.addEventListener('popstate', function (e) {
      if (form.classList.contains('ist-gesendet')) return;
      if (e.state && e.state.melder) gehe(e.state.melder, { verlauf: 'keiner', tastatur: true, ohneFokus: false });
      else if (aktuell !== 1) gehe(1, { verlauf: 'keiner', tastatur: true });
    });

    /* ---- Bereich (Zone) ---- */
    var zoneStand = $('[data-zone-stand]', form), zoneWeg = $('[data-zone-weg]', form);
    function zoneAktualisieren() {
      var z = radioText('zone');
      zoneStand.textContent = z ? 'Gewählt: ' + z : '';
      zoneWeg.hidden = !z;
    }
    form.addEventListener('change', function (e) { if (e.target.name === 'zone') zoneAktualisieren(); });
    zoneWeg.addEventListener('click', function () {
      var r = $('input[name="zone"]:checked', form);
      if (r) r.checked = false;
      zoneAktualisieren();
      var erste = $('input[name="zone"]', form);
      if (erste) erste.focus();
    });

    /* ---- Fährt noch? ---- */
    var fahrHinweis = $('[data-fahr-hinweis]', form);
    form.addEventListener('change', function (e) { if (e.target.name === 'fahrbereit') fahrHinweis.hidden = e.target.value !== 'nein'; });

    /* ---- Übersicht ---- */
    function zeilen(mitKontakt) {
      var fz = [wert('f-fahrzeug'), wert('f-kennzeichen')].filter(Boolean).join(', ');
      var fahr = radioText('fahrbereit');
      var z = [
        ['Unfallart', radioText('unfallart'), 1],
        ['Bereich', radioText('zone'), 2],
        ['Fahrzeug', fz, 3],
        ['Unfalldatum', wert('f-datum') ? datumDe(wert('f-datum')) : '', 3],
        ['Fährt noch', fahr, 3]
      ];
      if (mitKontakt) z.push(['Kontakt', [wert('f-name'), wert('f-telefon'), wert('f-email')].filter(Boolean).join(', '), 5], ['PLZ oder Ort', wert('f-ort'), 5]);
      return z;
    }
    function kurzBauen() {
      var el = $('[data-summe-kurz]', form);
      if (el) el.textContent = zeilen().map(function (z) { return z[1]; }).filter(Boolean).join(', ');
    }
    var box = $('[data-summe-box]', form);
    if (box && matchMedia('(min-width: 720px)').matches) box.open = true;
    function summeBauen(dl, mitAendern) {
      if (!dl) return;
      leeren(dl);
      zeilen(!mitAendern).forEach(function (z) {
        var zeile = document.createElement('div');
        var dt = document.createElement('dt'); dt.textContent = z[0];
        var dd = document.createElement('dd'); dd.textContent = z[1] || 'nicht angegeben'; if (!z[1]) dd.className = 'leer';
        zeile.appendChild(dt); zeile.appendChild(dd);
        if (mitAendern) {
          var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-springe', String(z[2]));
          b.setAttribute('aria-label', z[0] + ' ändern'); b.textContent = 'Ändern';
          zeile.appendChild(b);
        }
        dl.appendChild(zeile);
      });
    }

    /* ---- Absenden ---- */
    function nutzlast() {
      var teile = [
        'Unfallart: ' + radioText('unfallart'),
        radioText('zone') ? 'Bereich: ' + radioText('zone') : '',
        wert('f-fahrzeug') ? 'Fahrzeug: ' + wert('f-fahrzeug') : '',
        wert('f-kennzeichen') ? 'Kennzeichen: ' + wert('f-kennzeichen') : '',
        wert('f-datum') ? 'Datum: ' + datumDe(wert('f-datum')) : '',
        radioText('fahrbereit') ? 'Fährt noch: ' + radioText('fahrbereit') : '',
        'Ort: ' + wert('f-ort'),
        wert('f-telefon') ? 'Rückruf: ' + wert('f-rueckruf') : '',
        wert('f-nachricht')
      ].filter(Boolean).join(' · ');
      var hp = $('input[name="website"]', form);
      return { name: wert('f-name'), telefon: wert('f-telefon'), email: wert('f-email'), anliegen: teile.slice(0, 1900), einwilligung: 'ja', website: hp ? hp.value : '' };
    }
    function fertig() {
      kopf.hidden = true; block.hidden = true;
      summeBauen($('[data-erfolg-summe]', form), false);
      sagen(vorschau ? 'Vorschau beendet. Es wurde nichts gesendet.' : 'Ihre Meldung ist eingegangen.');
      erfolgZeigen(form, vorschau);
    }
    function absenden() {
      for (var i = 1; i <= N; i++) {
        var schlecht = bereichPruefen(schritte[i - 1]);
        if (schlecht) { gehe(i, { tastatur: true, ohneFokus: true }); sagen('Bitte prüfen Sie die markierten Angaben.'); fehlerFokus(schlecht); return; }
      }
      if (vorschau) { fertig(); return; }
      senden(form, nutzlast(), fertig, statusEl, $('[data-absenden]', form));
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); absenden(); });

    function neu() {
      form.reset();
      zoneAktualisieren(); fahrHinweis.hidden = true;
      $$('[aria-invalid]', form).forEach(function (f) { fehlerSetzen(f, ''); });
      $$('.fehler', form).forEach(function (f) { f.hidden = true; });
      statusEl.textContent = ''; statusEl.className = 'melder-status';
      notiz.hidden = true; notiz.textContent = ''; notizFuer = 1;
      form.classList.remove('ist-gesendet');
      $('[data-erfolg]', form).hidden = true;
      kopf.hidden = false; block.hidden = false;
      erreicht = 1; aktuell = 1;
      gehe(1, { verlauf: 'ersetzen' });
    }

    /* ---- Übernahme von Startseite / Schadenaufnahme ---- */
    function einlesen(extra) {
      var p = {};
      try { new URLSearchParams(location.search).forEach(function (v, k) { p[k] = v; }); } catch (e) { /* ohne Parameter */ }
      var m = /[#&?]zone=([a-z]+)/.exec(location.hash || '');
      if (m && !p.zone) p.zone = m[1];
      if (extra) for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) p[k] = extra[k]; }
      var start = null;
      try { start = JSON.parse(sessionStorage.getItem(SPEICHER) || 'null'); sessionStorage.removeItem(SPEICHER); } catch (e) { /* kein Speicher */ }
      if (start) { if (start.unfallart) p.unfallart = start.unfallart; }
      var hinweise = [], ziel = 1;
      if (p.zone && ZONEN.indexOf(p.zone) !== -1) {
        var rz = document.getElementById('mz-' + p.zone);
        if (rz) { rz.checked = true; zoneAktualisieren(); hinweise.push('Bereich ' + radioText('zone')); }
      }
      if (p.unfallart && ARTEN.indexOf(p.unfallart) !== -1) {
        var ra = document.getElementById('ua-' + p.unfallart);
        if (ra) { ra.checked = true; hinweise.push(radioText('unfallart')); ziel = 2; }
      }
      if (start && (start.ort || start.telefon)) {
        if (start.ort) { document.getElementById('f-ort').value = String(start.ort).slice(0, 80); hinweise.push('Ort'); }
        if (start.telefon) { document.getElementById('f-telefon').value = String(start.telefon).slice(0, 40); hinweise.push('Telefon'); }
        ziel = 5;
      }
      if (hinweise.length) {
        notiz.textContent = 'Übernommen: ' + hinweise.join(', ') + '. Sie können alles noch ändern' + (ziel === 5 ? ' und vorher Bereich und Fahrzeug ergänzen.' : '.');
        notizFuer = ziel;
        notiz.hidden = false;
      }
      if (ziel > 1) {
        erreicht = Math.max(erreicht, ziel);
        gehe(ziel, { verlauf: 'ersetzen', tastatur: true });
      }
    }
    window.melderEinlesen = einlesen;

    zoneAktualisieren();
    gehe(1, { verlauf: 'ersetzen', ohneFokus: true, still: true });
    einlesen();
  }

  /* ============================================================
     Kurzmelder auf der Startseite: übergibt in den Schadenmelder
     ============================================================ */
  function kurzInit(form) {
    form.noValidate = true;
    liveRueckmeldung(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var schlecht = bereichPruefen(form);
      if (schlecht) { fehlerFokus(schlecht); return; }
      var art = $('input[name="unfallart"]:checked', form);
      var daten = { unfallart: art ? art.value : '', ort: $('[name="ort"]', form).value.trim(), telefon: $('[name="telefon"]', form).value.trim() };
      var ziel = form.getAttribute('action');
      try { sessionStorage.setItem(SPEICHER, JSON.stringify(daten)); }
      catch (err) { ziel = ziel.replace('#', '?unfallart=' + encodeURIComponent(daten.unfallart) + '#'); }   /* ohne Speicher: nur die Unfallart, nie Telefon oder Ort */
      var ev = new CustomEvent('melder:navigieren', { cancelable: true, detail: { ziel: ziel } });
      if (document.dispatchEvent(ev)) location.assign(ziel);
    });
  }

  /* ============================================================
     Einseitiges Formular (Zusammenarbeit)
     ============================================================ */
  function formularInit(form) {
    var vorschau = istVorschau(form);
    var statusEl = $('[data-status]', form);
    form.noValidate = true;
    liveRueckmeldung(form);
    function wert(name) { var el = form.elements[name]; return el ? el.value.trim() : ''; }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var schlecht = bereichPruefen(form);
      if (schlecht) { statusEl.className = 'melder-status'; statusEl.textContent = 'Bitte prüfen Sie die markierten Angaben.'; fehlerFokus(schlecht); return; }
      statusEl.textContent = '';
      if (vorschau) { erfolgZeigen(form, true); return; }
      var anliegen = ['Kanzlei: ' + wert('kanzlei'), 'Anliegen: ' + wert('anliegen_art'), wert('email') ? 'E-Mail: ' + wert('email') : '', wert('nachricht')].filter(Boolean).join(' · ').slice(0, 1900);
      senden(form, { name: wert('name'), telefon: wert('telefon'), anliegen: anliegen, einwilligung: 'ja', website: wert('website') },
             function () { erfolgZeigen(form, false); }, statusEl, $('button[type=submit]', form));
    });
    form.addEventListener('click', function (e) {
      if (!e.target.closest('[data-neu]')) return;
      form.reset();
      $$('[aria-invalid]', form).forEach(function (f) { fehlerSetzen(f, ''); });
      form.classList.remove('ist-gesendet');
      $('[data-erfolg]', form).hidden = true;
      statusEl.textContent = '';
      var erstes = $('input', form); if (erstes) erstes.focus();
    });
  }

  $$('[data-melder]').forEach(melderInit);
  $$('[data-kurzmelder]').forEach(kurzInit);
  $$('[data-formular]').forEach(formularInit);
})();
