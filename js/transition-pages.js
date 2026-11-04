/* GoldTix — transition en bande dorée entre les pages (à inclure dans le <head> de chaque page concernée)
   Même effet que celui de l'intro vers la page d'achat :
   - Au clic sur un lien listé dans CIBLES : l'écran se couvre d'un voile crème, puis la page change.
   - À l'arrivée sur la nouvelle page : une bande dorée à bords courbes monte sur le voile et
     révèle la page derrière elle.
   Aucune autre navigation n'est touchée. */
(function () {
  'use strict';

  var CIBLES = ['guide.html', 'histoire.html', 'contact.html', 'conditions.html'];
  var CREME = '#F5F3ED';
  var OR = '#d97706';
  var CLE = 'gxTransitionPage';
  var FADE = 80;     /* ms : voile crème au clic (comme dans l'intro) */
  var DUREE = 520;   /* ms : passage de la bande (comme dans l'intro) */

  var reduit = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var racine = document.documentElement;
  var enCours = false;

  function creerVoile() {
    var v = document.createElement('div');
    v.id = 'gx-page-wipe';
    v.setAttribute('aria-hidden', 'true');
    v.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483000;overflow:hidden;pointer-events:auto';
    (document.body || racine).appendChild(v);
    var r = v.getBoundingClientRect();
    var w = Math.max(1, r.width), h = Math.max(1, r.height) + 60;
    v.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;display:block">'
      + '<path fill="' + CREME + '"/><path fill="' + OR + '"/></svg>';
    var p = v.querySelectorAll('path');
    return { el: v, voile: p[0], bande: p[1], w: w, h: h, s: Math.max(16, Math.min(60, w * 0.055)) };
  }

  /* Dessine l'image t (0 à 1) : le bord avant de la bande monte vite, le bord arrière la rattrape,
     et la page apparaît derrière le bord arrière (identique à l'intro). */
  function dessiner(o, t) {
    var yDeb = o.h, yFin = -o.s - 2, m = o.w / 2, s = o.s;
    var pl = Math.min(1, t);
    var pt = Math.min(1, Math.max(0, (t - 0.1) / 0.9));
    var el = 1 - Math.pow(1 - pl, 2.2);
    var et = pt < 0.5 ? 4 * pt * pt * pt : 1 - Math.pow(-2 * pt + 2, 3) / 2;
    var L = yDeb + (yFin - yDeb) * el;
    var T = yDeb + (yFin - yDeb) * et;
    o.voile.setAttribute('d', 'M0,0H' + o.w + 'V' + T + 'Q' + m + ',' + (T + 2 * s) + ' 0,' + T + 'Z');
    o.bande.setAttribute('d', 'M0,' + L + 'Q' + m + ',' + (L + 2 * s) + ' ' + o.w + ',' + L + 'L' + o.w + ',' + T + 'Q' + m + ',' + (T + 2 * s) + ' 0,' + T + 'Z');
  }

  function animer(duree, image, fin) {
    var debut = null;
    function pas(ts) {
      if (debut === null) debut = ts;
      var p = Math.min(1, (ts - debut) / duree);
      image(p);
      if (p < 1) requestAnimationFrame(pas); else if (fin) fin();
    }
    requestAnimationFrame(pas);
  }

  /* ── Sortie : l'écran se couvre du voile crème, puis on change de page ── */
  function partir(url) {
    if (enCours) return;
    enCours = true;
    if (reduit) { window.location.href = url; return; }
    var o = creerVoile();
    dessiner(o, 0);
    o.voile.setAttribute('opacity', 0);
    var parti = false;
    function aller() {
      if (parti) return;
      parti = true;
      try { sessionStorage.setItem(CLE, String(Date.now())); } catch (e) {}
      window.location.href = url;
    }
    animer(FADE, function (p) { o.voile.setAttribute('opacity', p); }, aller);
    setTimeout(aller, 1200); /* sécurité */
  }

  /* ── Arrivée : voile crème dès le premier affichage, puis la bande dorée révèle la page ── */
  function arriver() {
    var t = null;
    try {
      t = sessionStorage.getItem(CLE);
      sessionStorage.removeItem(CLE);
    } catch (e) {}
    if (!t || reduit || (Date.now() - Number(t)) > 6000) return;

    var o = creerVoile();
    dessiner(o, 0);                          /* écran entièrement crème dès le premier affichage */
    var retire = function () { if (o.el.parentNode) o.el.parentNode.removeChild(o.el); };
    var lance = false;
    function reveler() {
      if (lance) return;
      lance = true;
      requestAnimationFrame(function () {
        animer(DUREE, function (p) { dessiner(o, p); }, retire);
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

  /* Retour arrière : la page peut revenir figée avec le voile, on le retire */
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