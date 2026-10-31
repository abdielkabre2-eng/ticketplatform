import {
  PDFDocument, StandardFonts, rgb,
  pushGraphicsState, popGraphicsState,
  moveTo, lineTo, appendBezierCurve, closePath, clip, endPath,
} from "pdf-lib";
import QRCode from "qrcode";

/*
  Billet GoldTix en PDF : même rendu que le bouton « Télécharger mon billet en PDF »
  de billet.html (carte blanche de 380 pt, affiche, bloc d'infos, badge, QR, ID, bandeau).
  Renvoie un Buffer. Le "_" initial évite que Vercel le publie comme route d'API.
*/

const NOIR = rgb(0.067, 0.067, 0.067);
const GRIS = rgb(0.42, 0.45, 0.5);
const GRIS_BORD = rgb(0.88, 0.88, 0.88);
const BEIGE = rgb(0.973, 0.965, 0.945);
const LIGNE = rgb(0.9, 0.89, 0.86);
const OR_FOND = rgb(1, 0.92, 0.62);
const OR_BORD = rgb(0.85, 0.65, 0.15);
const OR_TEXTE = rgb(0.6, 0.38, 0.05);
const GRIS_AFFICHE = rgb(0.25, 0.25, 0.27);

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
  "septembre", "octobre", "novembre", "décembre"];

function formaterDateHeure(date, heure) {
  let d = "";
  const s = String(date ?? "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) d = `${parseInt(m[3], 10)} ${MOIS[parseInt(m[2], 10) - 1]} ${m[1]}`;
  else d = s;
  let h = "";
  const mh = String(heure ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (mh) h = `${mh[1].padStart(2, "0")}:${mh[2]}`;
  else h = String(heure ?? "");
  return [d, h].filter(Boolean).join(" · ");
}

function nomCategorie(billet, evenement) {
  const direct = billet?.nom_categorie || billet?.type_billet;
  if (direct) return String(direct);
  try {
    let cats = evenement?.categories_data;
    if (typeof cats === "string") cats = JSON.parse(cats);
    if (Array.isArray(cats)) {
      const c = cats.find((x) => String(x.id) === String(billet?.categorie_id));
      if (c) return String(c.nom || c.name || "");
    }
  } catch {}
  return "";
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

  // ---- Données
  const titreEv = evenement?.titre || "Événement";
  const lignesTitre = retourLigne(titreEv, gras, 20, 330).slice(0, 2);
  const rows = [
    ["Date & Heure", formaterDateHeure(evenement?.date, evenement?.heure)],
    ["Lieu", evenement?.lieu || ""],
    ["Participant", billet?.nom_participant || ""],
  ];
  if (billet?.telephone) rows.push(["Téléphone", String(billet.telephone)]);
  const categorie = nomCategorie(billet, evenement);
  const codePublic = String(billet?.code_public ?? "");
  const idBillet = String(billet?.numero_billet ?? billet?.code_public ?? "");

  // ---- Mise en page (coordonnées « haut vers bas »)
  const MARGE = 18, CW = 380, W = CW + MARGE * 2;
  const cx = MARGE;
  const POSTER_H = 170, ROW_H = 38, BAND_H = 44;

  const yPosterBas = MARGE + POSTER_H;
  const yLabel = yPosterBas + 28;
  const yTitre = yLabel + 28;
  const yBloc = yTitre + (lignesTitre.length - 1) * 25 + 24;
  const blocH = rows.length * ROW_H + 8;
  const yBadge = yBloc + blocH + 22;
  const badgeH = 30;
  const ySep = yBadge + (categorie ? badgeH : 0) + 30;
  const yQr = ySep + 28;
  const QR = 128;
  const yIdLabel = yQr + QR + 28;
  const yIdNum = yIdLabel + 22;
  const yBand = yIdNum + 30;
  const yCarteBas = yBand + BAND_H;
  const H = yCarteBas + MARGE;

  const page = pdf.addPage([W, H]);
  const Y = (y) => H - y;
  const texteCentre = (t, y, police, taille, couleur) =>
    page.drawText(t, { x: (W - police.widthOfTextAtSize(t, taille)) / 2, y: Y(y), size: taille, font: police, color: couleur });
  const svg = (chemin, opts) => page.drawSvgPath(chemin, { x: 0, y: H, ...opts });

  // ---- Carte
  svg(cheminArrondi(cx, MARGE, CW, yCarteBas - MARGE, 20, 20, 20, 20),
    { color: rgb(1, 1, 1), borderColor: GRIS_BORD, borderWidth: 1 });

  // ---- Affiche (recadrage « cover », coins du haut arrondis)
  let urlAffiche = evenement?.affiche_url || evenement?.image_url || evenement?.affiche || "";
  let origine = "";
  try { origine = new URL(lienBillet).origin; } catch {}
  if (urlAffiche && urlAffiche.startsWith("/") && origine) urlAffiche = origine + urlAffiche;
  const imgAffiche = await integrerImage(pdf, await telecharger(urlAffiche));

  if (imgAffiche) {
    const sc = Math.max(CW / imgAffiche.width, POSTER_H / imgAffiche.height);
    const dw = imgAffiche.width * sc, dh = imgAffiche.height * sc;
    const x0 = cx, x1 = cx + CW, yH = Y(MARGE), yB = Y(yPosterBas), r = 20, k = 0.5523 * r;
    page.pushOperators(
      pushGraphicsState(),
      moveTo(x0, yB), lineTo(x0, yH - r),
      appendBezierCurve(x0, yH - r + k, x0 + r - k, yH, x0 + r, yH),
      lineTo(x1 - r, yH),
      appendBezierCurve(x1 - r + k, yH, x1, yH - r + k, x1, yH - r),
      lineTo(x1, yB), closePath(), clip(), endPath(),
    );
    page.drawImage(imgAffiche, {
      x: cx + (CW - dw) / 2, y: Y(MARGE + (POSTER_H - dh) / 2 + dh), width: dw, height: dh,
    });
    page.pushOperators(popGraphicsState());
  } else {
    svg(cheminArrondi(cx, MARGE, CW, POSTER_H, 20, 20, 0, 0), { color: GRIS_AFFICHE });
    const lg = retourLigne(titreEv, gras, 22, CW - 50).slice(0, 3);
    let yy = MARGE + POSTER_H / 2 - ((lg.length - 1) * 28) / 2 + 7;
    for (const l of lg) { texteCentre(l, yy, gras, 22, rgb(1, 1, 1)); yy += 28; }
  }

  // ---- Titre
  texteCentre("Billet Officiel · GoldTix", yLabel, normal, 11, GRIS);
  lignesTitre.forEach((l, i) => texteCentre(l, yTitre + i * 25, gras, 20, NOIR));

  // ---- Bloc d'infos
  const bx = cx + 28, bw = CW - 56;
  svg(cheminArrondi(bx, yBloc, bw, blocH, 14, 14, 14, 14), { color: BEIGE });
  rows.forEach(([label, valeur], i) => {
    const yy = yBloc + 4 + i * ROW_H + 24;
    page.drawText(sur(label), { x: bx + 16, y: Y(yy), size: 12, font: normal, color: NOIR });
    const maxV = bw - 32 - normal.widthOfTextAtSize(sur(label), 12) - 12;
    const v = tronquer(valeur, gras, 12.5, maxV);
    page.drawText(v, { x: bx + bw - 16 - gras.widthOfTextAtSize(v, 12.5), y: Y(yy), size: 12.5, font: gras, color: NOIR });
    if (i < rows.length - 1) {
      const yl = yBloc + 4 + (i + 1) * ROW_H;
      page.drawLine({ start: { x: bx + 16, y: Y(yl) }, end: { x: bx + bw - 16, y: Y(yl) }, thickness: 0.6, color: LIGNE });
    }
  });

  // ---- Badge catégorie
  if (categorie) {
    const t = tronquer(categorie, gras, 13, 300);
    const tw = gras.widthOfTextAtSize(t, 13);
    const bwid = tw + 40;
    svg(cheminArrondi((W - bwid) / 2, yBadge, bwid, badgeH, 15, 15, 15, 15),
      { color: OR_FOND, borderColor: OR_BORD, borderWidth: 1 });
    page.drawText(t, { x: (W - tw) / 2, y: Y(yBadge + 20), size: 13, font: gras, color: OR_TEXTE });
  }

  // ---- Séparateur pointillé + encoches
  for (let x = cx + 14; x < cx + CW - 14; x += 8) {
    page.drawLine({ start: { x, y: Y(ySep) }, end: { x: x + 4, y: Y(ySep) }, thickness: 1.2, color: NOIR });
  }
  page.drawCircle({ x: cx, y: Y(ySep), size: 7, color: NOIR });
  page.drawCircle({ x: cx + CW, y: Y(ySep), size: 7, color: NOIR });

  // ---- QR code (contenu = code_public, comme sur la page)
  const png = await QRCode.toBuffer(codePublic, { margin: 0, width: 512, errorCorrectionLevel: "M" });
  const imgQr = await pdf.embedPng(png);
  page.drawImage(imgQr, { x: (W - QR) / 2, y: Y(yQr + QR), width: QR, height: QR });

  // ---- ID billet
  const spaced = "ID BILLET".split("").join(" ");
  texteCentre(spaced, yIdLabel, gras, 9, GRIS);
  texteCentre(sur(idBillet), yIdNum, mono, 15, NOIR);

  // ---- Bandeau du bas (logo + texte)
  svg(cheminArrondi(cx + 0.5, yBand, CW - 1, BAND_H - 0.5, 0, 0, 19.5, 19.5), { color: BEIGE });
  let imgLogo = null;
  if (origine) imgLogo = await integrerImage(pdf, await telecharger(origine + "/images/logo.png"));
  const texteBand = "•  Plateforme de billetterie sécurisée";
  const tbW = normal.widthOfTextAtSize(sur(texteBand), 10.5);
  const logoW = imgLogo ? 22 : gras.widthOfTextAtSize("GoldTix", 11);
  const totalW = logoW + 8 + tbW;
  const xDeb = (W - totalW) / 2;
  const yMid = yBand + BAND_H / 2;
  if (imgLogo) {
    page.drawImage(imgLogo, { x: xDeb, y: Y(yMid + 11), width: 22, height: 22 });
  } else {
    page.drawText("GoldTix", { x: xDeb, y: Y(yMid + 4), size: 11, font: gras, color: NOIR });
  }
  page.drawText(sur(texteBand), { x: xDeb + logoW + 8, y: Y(yMid + 4), size: 10.5, font: normal, color: GRIS });

  return Buffer.from(await pdf.save());
}
