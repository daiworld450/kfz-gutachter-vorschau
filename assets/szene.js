/* ============================================================
   Interaktions-Skript, ohne Bibliothek
   ------------------------------------------------------------
   1. Mobiles Menü: aus dem Fokus solange es zu ist, Esc, Fokus zurück
   2. Inhalte erscheinen beim Erreichen (ohne Skript sind sie sichtbar)
   3. Fahrzeug im Hero: sanfte Verschiebung der Ebenen bei Mausbewegung (nur transform, nur Zeigergerät mit Maus)
   4. Schadenaufnahme: Klick auf einen Bereich der Zeichnung wählt ihn (Radiobuttons funktionieren auch ohne Skript);
      gilt für die Startseite und für Schritt 2 des Schadenmelders
   5. Scroll-Story: aktiver Schritt steuert die Bühne (ohne Skript steht sie im Endzustand)
   Der Messstrahl über dem Fahrzeug läuft rein per CSS. Formulare (Schadenmelder, Kurzmelder, Zusammenarbeit): assets/melder.js.
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

  /* -------------------- Fahrzeug: Ebenen verschieben sich leicht gegeneinander -------------------- */
  var fahrzeug = document.querySelector('[data-fahrzeug]');
  if (fahrzeug && !sparsam) {
    var ebenen = Array.prototype.slice.call(fahrzeug.querySelectorAll('.fz-ebene'));
    var tiefe = [-3, 4, 5];                        /* Boden, Wagen, Messpunkte: Wagen und Messpunkte fast gleich, damit die Punkte nicht vom Blech wegwandern */
    var ziel = { x: 0, y: 0 }, ist = { x: 0, y: 0 }, laeuft = false, im_bild = true;
    var begrenzen = function (v) { return Math.max(-1, Math.min(1, v)); };
    var schritt = function () {
      ist.x += (ziel.x - ist.x) * 0.12;
      ist.y += (ziel.y - ist.y) * 0.12;
      ebenen.forEach(function (e, i) {
        e.style.transform = 'translate(' + (ist.x * tiefe[i]).toFixed(2) + 'px,' + (ist.y * tiefe[i] * 0.6).toFixed(2) + 'px)';
      });
      if (Math.abs(ziel.x - ist.x) > 0.002 || Math.abs(ziel.y - ist.y) > 0.002) { requestAnimationFrame(schritt); } else { laeuft = false; }
    };
    var anstossen = function () { if (!laeuft && im_bild) { laeuft = true; requestAnimationFrame(schritt); } };
    var buehne = document.querySelector('.titelblatt') || fahrzeug;
    fahrzeug.classList.add('fz-aktiv');
    buehne.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = buehne.getBoundingClientRect();
      ziel.x = begrenzen((e.clientX - r.left) / r.width * 2 - 1);
      ziel.y = begrenzen((e.clientY - r.top) / r.height * 2 - 1);
      anstossen();
    });
    buehne.addEventListener('pointerleave', function () { ziel.x = 0; ziel.y = 0; anstossen(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { im_bild = es[0].isIntersecting; }, { threshold: 0 }).observe(fahrzeug);
    }
  }

  /* -------------------- Schadenaufnahme: Klick auf die Zeichnung wählt den Bereich -------------------- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-aufnahme]'), function (aufnahme) {
    aufnahme.addEventListener('click', function (e) {
      var zone = e.target.closest('.sa-zone');
      if (!zone) return;
      var radio = aufnahme.querySelector('.sa-radio[value="' + zone.getAttribute('data-zone') + '"]');
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  });

  /* -------------------- Scroll-Story: aktiver Schritt steuert die Bühne -------------------- */
  var schritte = document.querySelectorAll('.story-schritt');
  var story_buehne = document.querySelector('.story-buehne');
  if (schritte.length && story_buehne && 'IntersectionObserver' in window) {
    var aktiv = null;
    var setzen = function (el) {
      if (aktiv === el) return;
      if (aktiv) aktiv.classList.remove('ist-aktiv');
      el.classList.add('ist-aktiv');
      aktiv = el;
      story_buehne.setAttribute('data-schritt', el.getAttribute('data-schritt'));
    };
    story_buehne.setAttribute('data-schritt', '1');
    schritte[0].classList.add('ist-aktiv');
    aktiv = schritte[0];
    var beobachter_story = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (e) { if (e.isIntersecting) setzen(e.target); });
    }, { rootMargin: '-42% 0px -50% 0px', threshold: 0 });
    Array.prototype.forEach.call(schritte, function (el) { beobachter_story.observe(el); });
  }
})();
