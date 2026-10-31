import {
  PDFDocument, StandardFonts, rgb,
  pushGraphicsState, popGraphicsState,
  moveTo, lineTo, appendBezierCurve, closePath, clip, endPath,
} from "pdf-lib";
import QRCode from "qrcode";

/*
  Billet GoldTix en PDF, copie fidèle du PDF de billet.html
  (bouton « Télécharger mon billet en PDF » : carte de 380 px, marge de 18 pt).
  Renvoie un Buffer. Le "_" initial évite que Vercel le publie comme route d'API.

  Affiche : comme dans billet.html, elle remplit le cadre de 380 x 170 pt (toute l'affiche est visible,
  simplement mise à la taille du cadre).
*/

const hex = (h) => rgb(
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
);
const mix = (c1, c2, t) => rgb(
  c1.red + (c2.red - c1.red) * t,
  c1.green + (c2.green - c1.green) * t,
  c1.blue + (c2.blue - c1.blue) * t,
);

const TXT = hex("#1c1917");
const GRIS_ID = hex("#a8a29e");
const BEIGE = hex("#faf8f4");
const LIGNE = hex("#efece4");
const RING = hex("#ece7dd");
const FOOT_LINE = hex("#f1f0ef");
const OR_1 = hex("#fef3c7");
const OR_2 = hex("#fde68a");
const OR_BORD = hex("#d97706");
const OR_TEXTE = hex("#92400e");
const NEUTRE_1 = hex("#c9c3b6");
const NEUTRE_2 = hex("#8a8478");

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
  "septembre", "octobre", "novembre", "décembre"];

// Même rendu que billet.html : « 17 octobre 2026 » (jour sur 2 chiffres), heure « 18:00 »
function formaterDate(date) {
  if (!date) return "—";
  const s = String(date);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]} ${MOIS[parseInt(m[2], 10) - 1]} ${m[1]}`;
  return s;
}
function formaterHeure(heure) {
  if (!heure) return "—";
  return String(heure).slice(0, 5);
}

// Même logique que billet.html pour retrouver le nom de la catégorie
function nomCategorie(billet, evenement) {
  let nom = billet?.nom_categorie || billet?.type_billet || "Standard";
  try {
    let cats = evenement?.categories_data;
    if (typeof cats === "string") cats = JSON.parse(cats);
    if (Array.isArray(cats) && cats.length > 0) {
      let i = -1;
      if (billet?.categorie_id) i = cats.findIndex((c) => String(c.id) === String(billet.categorie_id));
      if (i === -1 && billet?.nom_categorie) i = cats.findIndex((c) => c.nom === billet.nom_categorie || c.name === billet.nom_categorie);
      if (i === -1 && billet?.type_billet) i = cats.findIndex((c) => c.nom === billet.type_billet || c.name === billet.type_billet);
      if (i !== -1) nom = cats[i].nom || cats[i].name || nom;
    }
  } catch {}
  return String(nom);
}

async function telecharger(url) {
  try {
    if (!url) return null;
    if (url.startsWith("data:")) {
      const i = url.indexOf("base64,");
      return i >= 0 ? Buffer.from(url.slice(i + 7), "base64") : null;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

// PNG et JPEG uniquement (pdf-lib ne gère pas le WebP)
async function integrerImage(pdf, buf) {
  try {
    if (!buf || buf.length < 4) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50) return await pdf.embedPng(buf);
    if (buf[0] === 0xff && buf[1] === 0xd8) return await pdf.embedJpg(buf);
  } catch {}
  return null;
}

// Chemin SVG de rectangle arrondi (coordonnées « haut-gauche », y vers le bas)
function cheminArrondi(x, y, w, h, tl, tr, br, bl) {
  const k = 0.5523;
  return [
    `M ${x + tl} ${y}`,
    `L ${x + w - tr} ${y}`,
    `C ${x + w - tr + tr * k} ${y} ${x + w} ${y + tr - tr * k} ${x + w} ${y + tr}`,
    `L ${x + w} ${y + h - br}`,
    `C ${x + w} ${y + h - br + br * k} ${x + w - br + br * k} ${y + h} ${x + w - br} ${y + h}`,
    `L ${x + bl} ${y + h}`,
    `C ${x + bl - bl * k} ${y + h} ${x} ${y + h - bl + bl * k} ${x} ${y + h - bl}`,
    `L ${x} ${y + tl}`,
    `C ${x} ${y + tl - tl * k} ${x + tl - tl * k} ${y} ${x + tl} ${y}`,
    "Z",
  ].join(" ");
}

// Opérateurs PDF de découpe en rectangle arrondi (coordonnées PDF : yTop = bord haut)
function operateursClip(x, yTop, w, h, tl, tr, br, bl) {
  const k = 0.5523;
  const yBas = yTop - h;
  return [
    moveTo(x + tl, yTop),
    lineTo(x + w - tr, yTop),
    appendBezierCurve(x + w - tr + tr * k, yTop, x + w, yTop - tr + tr * k, x + w, yTop - tr),
    lineTo(x + w, yBas + br),
    appendBezierCurve(x + w, yBas + br - br * k, x + w - br + br * k, yBas, x + w - br, yBas),
    lineTo(x + bl, yBas),
    appendBezierCurve(x + bl - bl * k, yBas, x, yBas + bl - bl * k, x, yBas + bl),
    lineTo(x, yTop - tl),
    appendBezierCurve(x, yTop - tl + tl * k, x + tl - tl * k, yTop, x + tl, yTop),
    closePath(), clip(), endPath(),
  ];
}

export async function genererBilletPdf({ billet, evenement, lienBillet }) {
  const pdf = await PDFDocument.create();
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const mono = await pdf.embedFont(StandardFonts.CourierBold);

  const supportes = new Set(normal.getCharacterSet());
  const sur = (t) =>
    Array.from(String(t ?? "")).map((c) => (supportes.has(c.codePointAt(0)) ? c : "?")).join("");

  const retourLigne = (texte, police, taille, largeurMax) => {
    const mots = sur(texte).split(/\s+/).filter(Boolean);
    const lignes = [];
    let cour = "";
    for (const mot of mots) {
      const essai = cour ? cour + " " + mot : mot;
      if (police.widthOfTextAtSize(essai, taille) <= largeurMax) cour = essai;
      else { if (cour) lignes.push(cour); cour = mot; }
    }
    if (cour) lignes.push(cour);
    return lignes;
  };

  const tronquer = (texte, police, taille, largeurMax) => {
    let t = sur(texte);
    if (police.widthOfTextAtSize(t, taille) <= largeurMax) return t;
    while (t.length > 1 && police.widthOfTextAtSize(t + "…", taille) > largeurMax) t = t.slice(0, -1);
    return t + "…";
  };

  // ---- Données (mêmes valeurs et mêmes valeurs par défaut que billet.html)
  const titreEv = evenement?.titre || "Événement";
  const lignesTitre = retourLigne(titreEv, gras, 20, 336).slice(0, 2);
  const tel = billet?.telephone ? String(billet.telephone) : "";
  const rows = [
    ["Date & Heure", `${formaterDate(evenement?.date)} · ${formaterHeure(evenement?.heure)}`],
    ["Lieu", evenement?.lieu || "—"],
    ["Participant", billet?.nom_participant || "—"],
  ];
  if (tel && tel !== "—") rows.push(["Téléphone", tel]);
  const categorie = nomCategorie(billet, evenement) || "—";
  const codePublic = String(billet?.code_public ?? "");
  const idBillet = String(billet?.numero_billet ?? billet?.code_public ?? "");

  // ---- Affiche (chargée avant la mise en page)
  const MARGE = 18, CW = 380, W = CW + MARGE * 2, cx = MARGE;
  let urlAffiche = evenement?.affiche_url || evenement?.image_url || evenement?.affiche || "";
  let origine = "";
  try { origine = new URL(lienBillet).origin; } catch {}
  if (urlAffiche && urlAffiche.startsWith("/") && origine) urlAffiche = origine + urlAffiche;
  const imgAffiche = await integrerImage(pdf, await telecharger(urlAffiche));
  const POSTER_H = 170;

  // ---- Mise en page (coordonnées « haut vers bas », mêmes cotes que billet.html)
  const INSET = 22;                    // marge intérieure de la carte
  const ROW = 37.6, ROW_SEP = 1;       // ligne d'info + trait
  const BADGE_H = 35, QR = 128, BAND_H = 37;

  const yPosterBas = MARGE + POSTER_H;
  const yTop = yPosterBas + 18;
  const yLabel = yTop + 12;
  const yTitreHaut = yTop + 15 + 6;
  const yTitre = yTitreHaut + 19;
  const yBloc = yTitreHaut + 25 * lignesTitre.length + 14;
  const blocH = 4 + rows.length * ROW + (rows.length - 1) * ROW_SEP;
  const yBadge = yBloc + blocH + 14;
  const ySepHaut = yBadge + BADGE_H + 16;
  const ySep = ySepHaut + 9;
  const yQr = ySep + 35;
  const yQrBas = yQr + QR;
  const yIdLabel = yQrBas + 35;
  const yIdNum = yQrBas + 56;
  const yBand = yQrBas + 79;
  const yCarteBas = yBand + BAND_H;
  const H = yCarteBas + MARGE;

  const page = pdf.addPage([W, H]);
  const Y = (y) => H - y;
  const texteCentre = (t, y, police, taille, couleur) =>
    page.drawText(t, { x: (W - police.widthOfTextAtSize(t, taille)) / 2, y: Y(y), size: taille, font: police, color: couleur });
  const svg = (chemin, opts) => page.drawSvgPath(chemin, { x: 0, y: H, ...opts });
  const texteEspace = (t, y, police, taille, esp, couleur) => {
    const total = police.widthOfTextAtSize(t, taille) + esp * (t.length - 1);
    let x = (W - total) / 2;
    for (const c of t) {
      page.drawText(c, { x, y: Y(y), size: taille, font: police, color: couleur });
      x += police.widthOfTextAtSize(c, taille) + esp;
    }
  };
  // Dégradé horizontal dans un rectangle arrondi (découpé)
  const degrade = (x, top, w, h, r, c1, c2) => {
    page.pushOperators(pushGraphicsState(), ...operateursClip(x, Y(top), w, h, r[0], r[1], r[2], r[3]));
    const n = 40;
    for (let i = 0; i < n; i++) {
      page.drawRectangle({
        x: x + (w * i) / n, y: Y(top + h), width: w / n + 0.6, height: h,
        color: mix(c1, c2, i / (n - 1)),
      });
    }
    page.pushOperators(popGraphicsState());
  };

  // ---- Carte (fond blanc)
  svg(cheminArrondi(cx, MARGE, CW, yCarteBas - MARGE, 20, 20, 20, 20), { color: rgb(1, 1, 1) });

  // ---- Affiche (remplit le cadre, coins du haut arrondis)
  if (imgAffiche) {
    page.pushOperators(pushGraphicsState(), ...operateursClip(cx, Y(MARGE), CW, POSTER_H, 20, 20, 0, 0));
    page.drawImage(imgAffiche, { x: cx, y: Y(MARGE + POSTER_H), width: CW, height: POSTER_H });
    page.pushOperators(popGraphicsState());
  } else {
    degrade(cx, MARGE, CW, POSTER_H, [20, 20, 0, 0], NEUTRE_1, NEUTRE_2);
    const lg = retourLigne(titreEv, gras, 22, CW - 36).slice(0, 3);
    let yy = MARGE + POSTER_H / 2 - ((lg.length - 1) * 14) + 7;
    for (const l of lg) { texteCentre(l, yy, gras, 22, rgb(1, 1, 1)); yy += 28; }
  }

  // ---- Libellé et titre
  texteCentre("Billet Officiel · GoldTix", yLabel, normal, 12, TXT);
  lignesTitre.forEach((l, i) => texteCentre(l, yTitre + i * 25, gras, 20, TXT));

  // ---- Bloc d'infos
  const bx = cx + INSET, bw = CW - INSET * 2;
  svg(cheminArrondi(bx, yBloc, bw, blocH, 14, 14, 14, 14), { color: BEIGE });
  rows.forEach(([label, valeur], i) => {
    const haut = yBloc + 2 + i * (ROW + ROW_SEP);
    const base = haut + 10 + 13.5;
    page.drawText(sur(label), { x: bx + 18, y: Y(base), size: 13, font: normal, color: TXT });
    const maxV = bw - 36 - normal.widthOfTextAtSize(sur(label), 13) - 12;
    const v = tronquer(valeur, gras, 14, maxV);
    page.drawText(v, { x: bx + bw - 18 - gras.widthOfTextAtSize(v, 14), y: Y(base), size: 14, font: gras, color: TXT });
    if (i < rows.length - 1) {
      const yl = haut + ROW + ROW_SEP / 2;
      page.drawLine({ start: { x: bx + 18, y: Y(yl) }, end: { x: bx + bw - 18, y: Y(yl) }, thickness: 1, color: LIGNE });
    }
  });

  // ---- Badge catégorie (dégradé doré, bordure, texte brun)
  {
    const t = tronquer(categorie, gras, 13, 300);
    const tw = gras.widthOfTextAtSize(t, 13);
    const bwid = tw + 48 + 3;
    const bxx = (W - bwid) / 2;
    degrade(bxx, yBadge, bwid, BADGE_H, [17.5, 17.5, 17.5, 17.5], OR_1, OR_2);
    svg(cheminArrondi(bxx + 0.75, yBadge + 0.75, bwid - 1.5, BADGE_H - 1.5, 16.75, 16.75, 16.75, 16.75),
      { borderColor: OR_BORD, borderWidth: 1.5 });
    page.drawText(t, { x: (W - tw) / 2, y: Y(yBadge + 22), size: 13, font: gras, color: OR_TEXTE });
  }

  // ---- Séparateur pointillé + demi-disques sur les bords de la carte
  for (let x = cx + 9; x < cx + CW - 9; x += 8) {
    const fin = Math.min(x + 5, cx + CW - 9);
    page.drawLine({ start: { x, y: Y(ySep) }, end: { x: fin, y: Y(ySep) }, thickness: 2, color: TXT });
  }
  svg(`M ${cx} ${ySep - 9} A 9 9 0 0 1 ${cx} ${ySep + 9} Z`, { color: TXT });
  svg(`M ${cx + CW} ${ySep + 9} A 9 9 0 0 1 ${cx + CW} ${ySep - 9} Z`, { color: TXT });

  // ---- QR code (contenu = code_public, comme sur la page)
  const png = await QRCode.toBuffer(codePublic, { margin: 0, width: 512, errorCorrectionLevel: "M" });
  const imgQr = await pdf.embedPng(png);
  page.drawImage(imgQr, { x: (W - QR) / 2, y: Y(yQrBas), width: QR, height: QR });

  // ---- ID billet
  texteEspace("ID BILLET", yIdLabel, gras, 10, 1.6, GRIS_ID);
  texteEspace(sur(idBillet), yIdNum, mono, 18, 0.72, TXT);

  // ---- Bandeau du bas : logo + « • Plateforme de billetterie sécurisée »
  svg(cheminArrondi(cx, yBand, CW, BAND_H, 0, 0, 20, 20), { color: BEIGE });
  page.drawLine({ start: { x: cx, y: Y(yBand + 0.5) }, end: { x: cx + CW, y: Y(yBand + 0.5) }, thickness: 1, color: FOOT_LINE });

  let imgLogo = null;
  if (origine) imgLogo = await integrerImage(pdf, await telecharger(origine + "/images/logo.png"));
  const bullet = "•";
  const texteBand = sur("Plateforme de billetterie sécurisée");
  const wBullet = normal.widthOfTextAtSize(bullet, 10);
  const wTexte = normal.widthOfTextAtSize(texteBand, 10);
  const logoH = 16;
  const logoW = imgLogo ? (logoH * imgLogo.width) / imgLogo.height : gras.widthOfTextAtSize("GoldTix", 11);
  const total = logoW + 8 + wBullet + 8 + wTexte;
  let xx = (W - total) / 2;
  const yMilieu = yBand + 1 + 10 + 8;
  if (imgLogo) {
    page.drawImage(imgLogo, { x: xx, y: Y(yMilieu + logoH / 2), width: logoW, height: logoH });
  } else {
    page.drawText("GoldTix", { x: xx, y: Y(yMilieu + 4), size: 11, font: gras, color: TXT });
  }
  xx += logoW + 8;
  page.drawText(bullet, { x: xx, y: Y(yMilieu + 3.5), size: 10, font: normal, color: TXT });
  xx += wBullet + 8;
  page.drawText(texteBand, { x: xx, y: Y(yMilieu + 3.5), size: 10, font: normal, color: TXT });

  // ---- Liseré fin autour de la carte
  svg(cheminArrondi(cx, MARGE, CW, yCarteBas - MARGE, 20, 20, 20, 20), { borderColor: RING, borderWidth: 1 });

  return Buffer.from(await pdf.save());
}
