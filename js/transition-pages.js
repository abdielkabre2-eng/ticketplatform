/* GoldTix — transition en bande dorée entre les pages (à inclure dans le <head> de chaque page concernée)
   - Au clic sur un lien listé dans CIBLES : une bande dorée à bord courbe monte et recouvre l'écran, puis la page change.
   - À l'arrivée sur la nouvelle page : la bande se lève vers le haut et révèle la page.
   Aucune autre navigation n'est touchée. */
(function () {
  'use strict';

  var CIBLES = ['guide.html', 'histoire.html', 'contact.html', 'conditions.html'];
  var COULEUR = '#d97706';
  var CLE = 'gxTransitionPage';
  var DUREE_SORTIE = 220;   /* ms : la bande monte et couvre l'écran */
  var DUREE_ENTREE = 240;   /* ms : la bande se lève et révèle la page */

  var reduit = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var racine = document.documentElement;
  var enCours = false;

  function doux(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }

  function creerVoile() {
    var v = document.createElement('div');
    v.id = 'gx-page-wipe';
    v.setAttribute('aria-hidden', 'true');
    v.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483000;overflow:hidden;pointer-events:auto';
    (document.body || racine).appendChild(v);
    var r = v.getBoundingClientRect();
    var w = Math.max(1, r.width), h = Math.max(1, r.height) + 60;
    v.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;display:block"><path fill="' + COULEUR + '"/></svg>';
    return {
      el: v,
      path: v.querySelector('path'),
      w: w,
      h: h,
      s: Math.max(16, Math.min(60, w * 0.055))
    };
  }

  /* Zone dorée qui part du bord courbe situé à y et va jusqu'en bas */
  function zoneBas(o, y) {
    o.path.setAttribute('d', 'M0,' + y + 'Q' + (o.w / 2) + ',' + (y + 2 * o.s) + ' ' + o.w + ',' + y + 'V' + o.h + 'H0Z');
  }
  /* Zone dorée qui part du haut et va jusqu'au bord courbe situé à y */
  function zoneHaut(o, y) {
    o.path.setAttribute('d', 'M0,0H' + o.w + 'V' + y + 'Q' + (o.w / 2) + ',' + (y + 2 * o.s) + ' 0,' + y + 'Z');
  }

  function animer(duree, image, fin) {
    var debut = null;
    function pas(ts) {
      if (debut === null) debut = ts;
      var p = Math.min(1, (ts - debut) / duree);
      image(doux(p));
      if (p < 1) requestAnimationFrame(pas); else if (fin) fin();
    }
    requestAnimationFrame(pas);
  }

  /* ── Sortie : la bande monte et recouvre l'écran, puis on change de page ── */
  function partir(url) {
    if (enCours) return;
    enCours = true;
    if (reduit) { window.location.href = url; return; }
    var o = creerVoile();
    var yDeb = o.h, yFin = -o.s - 2;
    zoneBas(o, yDeb);
    var parti = false;
    function aller() {
      if (parti) return;
      parti = true;
      try { sessionStorage.setItem(CLE, String(Date.now())); } catch (e) {}
      window.location.href = url;
    }
    animer(DUREE_SORTIE, function (e) { zoneBas(o, yDeb + (yFin - yDeb) * e); }, aller);
    setTimeout(aller, 1200); /* sécurité */
  }

  /* ── Arrivée : si on vient d'une transition, la page est couverte puis révélée ── */
  function arriver() {
    var t = null;
    try {
      t = sessionStorage.getItem(CLE);
      sessionStorage.removeItem(CLE);
    } catch (e) {}
    if (!t || reduit || (Date.now() - Number(t)) > 6000) return;

    var o = creerVoile();
    var yDeb = o.h, yFin = -o.s - 2;
    zoneHaut(o, yDeb);                       /* écran entièrement doré dès le premier affichage */
    var retire = function () { if (o.el.parentNode) o.el.parentNode.removeChild(o.el); };
    var lance = false;
    function reveler() {
      if (lance) return;
      lance = true;
      requestAnimationFrame(function () {
        animer(DUREE_ENTREE, function (e) { zoneHaut(o, yDeb + (yFin - yDeb) * e); }, retire);
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reveler);
    else reveler();
    setTimeout(function () { reveler(); }, 1500);
    setTimeout(retire, 3500);                /* sécurité */
  }

  function cible(a) {
    if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return null;
    var u;
    try { u = new URL(a.href, window.location.href); } catch (e) { return null; }
    if (u.origin !== window.location.origin) return null;
    var nom = u.pathname.split('/').pop();
    if (CIBLES.indexOf(nom) === -1) return null;
    if (u.pathname === window.location.pathname) return null;
    return u.href;
  }

  document.addEventListener('click', function (ev) {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
    var url = cible(a);
    if (!url) return;
    ev.preventDefault();
    partir(url);
  });

  /* Retour arrière : la page peut revenir figée avec la bande dorée, on la retire */
  window.addEventListener('pageshow', function (ev) {
    if (!ev.persisted) return;
    enCours = false;
    var v = document.getElementById('gx-page-wipe');
    if (v && v.parentNode) v.parentNode.removeChild(v);
  });

  /* Préchauffage : pendant que la personne lit, on télécharge discrètement les pages cibles
     pour qu'elles s'ouvrent plus vite au moment du clic (inactif en mode économie de données) */
  function prechauffer() {
    var c = navigator.connection;
    if (c && c.saveData) return;
    var vus = {};
    var liens = document.querySelectorAll('a[href]');
    for (var i = 0; i < liens.length; i++) {
      var u = cible(liens[i]);
      if (u && !vus[u]) {
        vus[u] = true;
        try { fetch(u, { credentials: 'same-origin' }).catch(function () {}); } catch (e) {}
      }
    }
  }
  window.addEventListener('load', function () {
    setTimeout(prechauffer, 800);
  });

  arriver();
})();