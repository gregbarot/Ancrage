import { createPdfExporter } from "./modules/pdf-export.mjs";
import { context } from "./modules/context.mjs";
import { accountPanel, bindAccountControls } from "./modules/account.mjs";
import { LOCAL_KEY, MAX_NOTEBOOK_BYTES } from "./modules/repository.mjs";
import { escapeHtml, downloadFile } from "./modules/dom.mjs";
import { createReflection } from "./reflection.js";
import {
  MOODS,
  today,
  summary,
  validateBackup,
  csv,
  categoryOf,
  migrateData,
  tagSeries,
  createInitialNotebook,
} from "./core.mjs";
const $ = (selector) => document.querySelector(selector),
  esc = escapeHtml;
const KEY = LOCAL_KEY;
const initial = () =>
  createInitialNotebook(context.session?.user?.username || "Mon carnet");
let data = structuredClone(context.repository.snapshot),
  storageError = !!context.localError;
let tab = "today",
  selected = today(),
  month = today().slice(0, 7),
  statsMode = "month",
  year = Number(today().slice(0, 4)),
  chartTag = "mood",
  draft = { score: null, tags: [], note: "" },
  dirty = false;
const fmt = (date, opts = { day: "numeric", month: "long", year: "numeric" }) =>
  new Intl.DateTimeFormat("fr-FR", opts).format(new Date(date + "T12:00:00"));
const number = (n, d = 0) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d }).format(n);
const mood = (n) => MOODS.find((m) => m.score === n);
const icons = {
  today:
    '<path d="M5 4h12a2 2 0 0 1 2 2v14H6a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Z"/><path d="M7 4v16M11 8h5M11 12h4"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2"/>',
  stats: '<path d="M4 4v16h17M8 15l4-5 4 2 5-7"/>',
  profile:
    '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  leaf: '<path d="M20 3C7 2 2 9 5 16c7 5 16-1 15-13ZM4 21l11-12"/>',
};
const icon = (n) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[n] || icons.leaf}</svg>`;
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("visible"), 3500);
}
function notifyChange(message) {
  toast(
    context.repository.mode === "cloud" && context.repository.hasPending
      ? "Modification prise en compte. Consulte l’état de synchronisation en haut de page."
      : message,
  );
}
function persist(next) {
  try {
    context.repository.save(next);
    data = structuredClone(context.repository.snapshot);
    return true;
  } catch (error) {
    toast(
      error.message ||
        "Enregistrement impossible. Exporte tes données avant de quitter.",
    );
    return false;
  }
}
function update(fn) {
  if (storageError) {
    toast("Récupère ou restaure les données précédentes dans ton profil.");
    return false;
  }
  const next = structuredClone(data);
  fn(next);
  return persist(next);
}
function loadDraft() {
  const e = data.entries.find((e) => e.date === selected);
  draft = e
    ? { score: e.score, tags: [...e.tags], note: e.note }
    : { score: null, tags: [], note: "" };
  dirty = false;
}
loadDraft();
function rangeEntries(start, end) {
  return data.entries
    .filter((e) => e.date >= start && e.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}
function monthEntries() {
  return data.entries
    .filter((e) => e.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date));
}
function monthEnd(m) {
  const [y, n] = m.split("-").map(Number);
  return m + "-" + new Date(y, n, 0).getDate();
}
function shell() {
  const names = {
    today: "Aujourd’hui",
    calendar: "Calendrier",
    stats: "Statistiques",
    reflection: "Recul TCC",
    profile: "Mon profil",
  };
  $("#app").innerHTML =
    `<div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-icon">a</span>ancrage</div><div class="brand-sub">TON CARNET PERSONNEL</div><nav aria-label="Navigation principale">${Object.entries(
      names,
    )
      .map(
        ([k, v]) =>
          `<button type="button" data-nav="${k}" class="${tab === k ? "active" : ""}" ${tab === k ? 'aria-current="page"' : ""}>${icon(k)}<span>${v}</span></button>`,
      )
      .join(
        "",
      )}</nav><div class="sidebar-foot"><p>Un jour à la fois.<br>À ton rythme.</p><div class="privacy">${icon("lock")} ${context.repository.mode === "cloud" ? "Carnet privé synchronisé" : "Carnet sur cet appareil"}</div></div></aside><main class="main" id="main-content"><div class="topline"><div class="brand mobile-brand"><span class="brand-icon">a</span>ancrage</div><span class="desktop-label">MON ESPACE PERSONNEL / ${names[tab].toLocaleUpperCase("fr")}</span><button type="button" class="avatar" data-nav="profile" aria-label="Mon profil">${data.profile.photo ? `<img src="${esc(data.profile.photo)}" alt="">` : esc(data.profile.symbol)}</button></div><div class="content">${storageError ? '<div class="notice">Le stockage précédent ne peut pas être lu. Il n’a pas été remplacé. Tu peux le récupérer dans ton profil avant de continuer.</div>' : ""}${tab === "today" ? todayView() : tab === "calendar" ? calendarView() : tab === "stats" ? statsView() : tab === "reflection" ? reflection.view() : profileView()}<p class="footer-note">Quelques traces aujourd’hui, un peu de recul demain.</p></div></main></div>`;
  bind();
}
function todayView() {
  return `<header class="intro"><div class="eyebrow">Un moment pour toi</div><h1 tabindex="-1">Bonsoir ${esc(data.profile.displayName)}<span style="color:#8eaa67">.</span></h1><p>${esc(data.profile.welcomeText)}</p></header>${journal()}<button type="button" class="subtle journal-reflection" id="reflect-day">Prendre du recul sur cette journée</button>${calendarCard()}${chartCard()}${monthlySummary()}`;
}
const face = (score, small = false) =>
  `<span class="mood-art ${small ? "small" : ""}" style="--face:${5 - score}" aria-hidden="true"></span>`;
const categoryLabel = (c) => (c === "activity" ? "Activités" : "Ressentis");
function tagOptions(value, includeMood = false) {
  return `${includeMood ? `<option value="mood" ${value === "mood" ? "selected" : ""}>Humeur globale</option>` : ""}${[
    "feeling",
    "activity",
  ]
    .map(
      (c) =>
        `<optgroup label="${categoryLabel(c)}">${data.tags
          .filter((t) => categoryOf(t) === c)
          .map(
            (t) =>
              `<option value="${esc(t.id)}" ${value === t.id ? "selected" : ""}>${esc(t.name)}${t.hidden ? " (masqué)" : ""}</option>`,
          )
          .join("")}</optgroup>`,
    )
    .join("")}`;
}
function tagGroup(category) {
  const tags = [...data.tags]
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite))
    .filter(
      (t) =>
        categoryOf(t) === category && (!t.hidden || draft.tags.includes(t.id)),
    );
  return `<div class="tag-group ${category}"><span class="field-label">${category === "activity" ? "Mes activités du jour" : "Ce que j’ai ressenti aujourd’hui"}</span><div class="tags">${tags.map((t) => `<button type="button" class="tag ${category} ${draft.tags.includes(t.id) ? "selected" : ""}" data-tag="${esc(t.id)}" aria-pressed="${draft.tags.includes(t.id)}">${draft.tags.includes(t.id) ? "✓ " : ""}${esc(t.name)}</button>`).join("")}<button type="button" class="tag add ${category}" data-add-tag="${category}">＋ Ajouter</button></div></div>`;
}
function journal() {
  return `<form class="card journal" id="journal-form" aria-labelledby="journal-title"><div class="section-head"><h2 id="journal-title">Ma journée</h2><label class="date-wrap"><input id="entry-date" type="date" aria-label="Date de la journée" value="${selected}" max="${today()}" required></label></div><div class="moods" role="group" aria-label="Humeur de la journée">${MOODS.map((m) => `<button type="button" class="mood ${draft.score === m.score ? "selected" : ""}" style="--mood:${m.color}" data-mood="${m.score}" aria-pressed="${draft.score === m.score}">${face(m.score)}<small>${m.label}</small></button>`).join("")}</div>${tagGroup("feeling")}${tagGroup("activity")}<label class="field-label" for="daily-note">Une note ? <span class="optional">facultatif</span></label><textarea maxlength="50000" id="daily-note" placeholder="Un détail, un déclencheur, quelque chose que tu veux retenir…">${esc(draft.note)}</textarea><button type="submit" class="primary save" id="save-day">${icon("leaf")}${data.entries.some((e) => e.date === selected) ? "Mettre à jour ma journée" : "Enregistrer ma journée"}</button>${data.entries.some((e) => e.date === selected) ? '<button type="button" class="plain danger" id="delete-day">Supprimer cette journée</button>' : ""}</form>`;
}
function calendarCard() {
  const [y, m] = month.split("-").map(Number),
    count = new Date(y, m, 0).getDate(),
    offset = (new Date(y, m - 1, 1).getDay() + 6) % 7,
    entries = monthEntries();
  return `<section class="card" id="calendar-card"><div class="section-head"><h2>${fmt(month + "-01", { month: "long", year: "numeric" })}</h2><div class="arrows"><button type="button" class="square" data-month="-1" aria-label="Mois précédent">‹</button><button type="button" class="square" data-month="1" aria-label="Mois suivant">›</button></div></div><div class="calendar">${["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"].map((d) => `<div class="weekday">${d}</div>`).join("")}${"<span></span>".repeat(offset)}${Array.from(
    { length: count },
    (_, i) => {
      const date = month + "-" + String(i + 1).padStart(2, "0"),
        e = entries.find((e) => e.date === date),
        mo = e ? mood(e.score) : null;
      return `<button type="button" data-day="${date}" class="day ${date === today() ? "today" : ""} ${date === selected ? "chosen" : ""}" ${date > today() ? "disabled" : ""} ${mo ? `style="background:${mo.color}88"` : ""} aria-label="${fmt(date)} : ${mo ? mo.label : "non renseigné"}"><span>${i + 1}</span>${mo ? `${face(mo.score, true)}` : ""}</button>`;
    },
  ).join(
    "",
  )}</div><div class="legend">${MOODS.map((m) => `<span><i class="dot" style="background:${m.color}"></i>${m.label}</span>`).join("")}</div><p class="muted" style="margin:16px 0 0">${entries.length ? `${entries.length} journée${entries.length > 1 ? "s" : ""} renseignée${entries.length > 1 ? "s" : ""}` : "Ton mois se dessinera au fil des jours."} · Touche une date pour la renseigner.</p></section>`;
}
function graph(entries, start, end, annual = false) {
  const w = 640,
    h = 220,
    l = 52,
    r = 15,
    t = 20,
    b = 37,
    steps = annual ? 12 : Number(end.slice(-2)),
    x = (i) => l + ((i - 1) * (w - l - r)) / Math.max(steps - 1, 1),
    y = (n) => t + ((5 - n) * (h - t - b)) / 4;
  let pts = annual
    ? Array.from({ length: 12 }, (_, i) => {
        const a = entries.filter((e) => Number(e.date.slice(5, 7)) === i + 1);
        return { i: i + 1, score: summary(a, []).average };
      })
    : Array.from({ length: steps }, (_, i) => ({
        i: i + 1,
        ...entries.find((e) => Number(e.date.slice(-2)) === i + 1),
      }));
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Courbe d’humeur, de 1 Horrible à 5 Super. Les périodes manquantes restent vides.">${[1, 2, 3, 4, 5].map((n) => `<line x1="${l}" x2="${w - r}" y1="${y(n)}" y2="${y(n)}" stroke="#e8ebdf" stroke-dasharray="3 5"/><text x="${l - 15}" y="${y(n) + 4}" text-anchor="end">${n}/5</text>`).join("")}${pts
    .map((p, i) => {
      const prev = pts[i - 1];
      return p.score && prev?.score
        ? `<line x1="${x(prev.i)}" y1="${y(prev.score)}" x2="${x(p.i)}" y2="${y(p.score)}" stroke="#819c5b" stroke-width="2.5"/>`
        : "";
    })
    .join(
      "",
    )}${pts.map((p) => (p.score ? `<circle cx="${x(p.i)}" cy="${y(p.score)}" r="5" fill="${mood(Math.round(p.score)).color}" stroke="#658148" stroke-width="2" ${p.date ? `tabindex="0" role="button" data-point="${p.date}" aria-label="${fmt(p.date)}, ${mood(p.score).label}"` : ""}><title>${annual ? fmt(`${year}-${String(p.i).padStart(2, "0")}-01`, { month: "long" }) : fmt(p.date)} : ${number(p.score, 1)}/5</title></circle>` : "")).join("")}${pts
    .filter((p) => annual || p.i === 1 || p.i === steps || p.i % 5 === 0)
    .map(
      (p) =>
        `<text x="${x(p.i)}" y="${h - 10}" text-anchor="middle">${annual ? ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"][p.i - 1] : p.i}</text>`,
    )
    .join("")}</svg>`;
}
function chartCard() {
  return trendCard(monthEntries(), false);
}
function trendCard(entries, annual) {
  const isMood = chartTag === "mood",
    tag = data.tags.find((t) => t.id === chartTag),
    activity = tag && categoryOf(tag) === "activity";
  const points = isMood
    ? []
    : tagSeries(entries, chartTag, annual ? String(year) : month, annual);
  const n = entries.length,
    count = isMood
      ? 0
      : entries.filter((e) => e.tags.includes(chartTag)).length;
  return `<section class="card trend ${activity ? "activity" : ""}"><div class="section-head trend-head"><div><h2>${isMood ? (annual ? "Mon humeur au fil des mois" : "Ma courbe d’humeur") : esc(tag?.name || "Mon tag")}</h2><p class="muted" style="margin:5px 0 0">${annual ? year : fmt(month + "-01", { month: "long", year: "numeric" })}</p></div></div><label class="chart-picker">Observer<select data-chart-select aria-label="Choisir l’humeur ou un tag à isoler">${tagOptions(chartTag, true)}</select></label>${!isMood ? `<p class="tag-total"><strong>${count}</strong> jour${count > 1 ? "s" : ""} sur ${n} renseigné${n > 1 ? "s" : ""} <span>· ${n ? number((count / n) * 100) : 0} %</span></p>` : ""}${n ? (isMood ? graph(entries, month + "-01", monthEnd(month), annual) : tagGraph(points, annual, activity)) : '<div class="empty"><strong>Le premier point, c’est toi.</strong>Renseigne une journée de cette période pour commencer la courbe.</div>'}<p class="muted" style="margin:12px 0 0">${isMood ? (annual ? "Chaque point est la moyenne des journées renseignées du mois." : "1 = Horrible · 5 = Super") : annual ? "Chaque point indique le pourcentage de journées renseignées où ce tag est coché. Touche un point pour le détail." : "Coché ou non coché pour chaque journée renseignée. Touche un point pour retrouver la journée."}<br>Les jours et les mois non renseignés restent inconnus.</p></section>`;
}
function tagGraph(points, annual, activity) {
  const w = 640,
    h = 220,
    l = 76,
    r = 18,
    t = 24,
    b = 38,
    max = annual ? 100 : 1,
    color = activity ? "#b67e48" : "#69844c",
    x = (i) => l + ((i - 1) * (w - l - r)) / (points.length - 1),
    y = (v) => t + ((max - v) / max) * (h - t - b),
    levels = annual ? [0, 25, 50, 75, 100] : [0, 1];
  return `<svg class="chart tag-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${annual ? "Fréquence mensuelle du tag en pourcentage" : "Présence quotidienne du tag : coché ou non coché"}. Les données manquantes restent vides.">${levels.map((n) => `<line x1="${l}" x2="${w - r}" y1="${y(n)}" y2="${y(n)}" stroke="#e8ebdf" stroke-dasharray="3 5"/><text x="${l - 10}" y="${y(n) + 4}" text-anchor="end">${annual ? n + " %" : n ? "Coché" : "Non coché"}</text>`).join("")}${points
    .map((p, i) => {
      const prev = points[i - 1];
      return p.value !== null && prev?.value !== null && prev
        ? `<line x1="${x(prev.i)}" y1="${y(prev.value)}" x2="${x(p.i)}" y2="${y(p.value)}" stroke="${color}" stroke-width="2"/>`
        : "";
    })
    .join("")}${points
    .filter((p) => p.value !== null)
    .map(
      (p) =>
        `<circle cx="${x(p.i)}" cy="${y(p.value)}" r="5.5" fill="${p.value ? color : "#fffef8"}" stroke="${color}" stroke-width="2" tabindex="0" role="button" ${annual ? `data-tag-month="${p.key}"` : `data-point="${p.key}"`} aria-label="${annual ? p.key + ": " + p.count + " jours sur " + p.n + " renseignés, " + number(p.value) + " %" : fmt(p.key) + ": " + (p.count ? "coché" : "non coché")}"><title>${annual ? p.count + " jours sur " + p.n + " renseignés (" + number(p.value) + " %)" : fmt(p.key) + ": " + (p.count ? "coché" : "non coché")}</title></circle>`,
    )
    .join("")}${points
    .filter(
      (p) => annual || p.i === 1 || p.i === points.length || p.i % 5 === 0,
    )
    .map(
      (p) =>
        `<text x="${x(p.i)}" y="${h - 10}" text-anchor="middle">${annual ? ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"][p.i - 1] : p.i}</text>`,
    )
    .join("")}</svg>`;
}
function bars(s) {
  return (
    ["feeling", "activity"]
      .map((c) => {
        const list = s.tags.filter((t) => categoryOf(t) === c);
        return list.length
          ? `<div class="stats-category ${c}"><h4>${categoryLabel(c)}</h4>${list.map((t) => `<div class="bar-row"><div class="bar-label"><button type="button" class="tag-link" data-isolate="${esc(t.id)}">${esc(t.name)}</button><span>${number(t.percent)} %</span></div><div class="track"><div class="fill" style="width:${t.percent}%"></div></div><div class="bar-meta" style="margin-top:6px">${t.count} jour${t.count > 1 ? "s" : ""} sur ${s.n} renseigné${s.n > 1 ? "s" : ""}</div></div>`).join("")}</div>`
          : "";
      })
      .join("") ||
    '<p class="muted">Ajoute un tag à suivre depuis ton profil.</p>'
  );
}
function metrics(s) {
  return `<div class="metrics"><div class="metric"><strong>${s.n}</strong><span>journée${s.n > 1 ? "s" : ""} renseignée${s.n > 1 ? "s" : ""}</span></div><div class="metric"><strong>${s.n ? number(s.average, 1) : "···"} <span>/ 5</span></strong><span>humeur moyenne</span></div></div>`;
}
function distribution(s) {
  return s.moods
    .map(
      (m) =>
        `<div class="bar-row"><div class="bar-label"><span class="mood-label">${face(m.score, true)} ${m.label}</span><span>${m.count} j <span class="bar-meta">· ${s.n ? number((m.count / s.n) * 100) : 0} %</span></span></div><div class="track"><div style="height:100%;background:${m.color};width:${s.n ? (m.count / s.n) * 100 : 0}%"></div></div></div>`,
    )
    .join("");
}
function monthlySummary() {
  const s = summary(monthEntries(), data.tags);
  return `<section class="card"><div class="section-head"><h2>Mon mois en quelques mots</h2><button type="button" class="plain" data-nav="stats">Tout voir</button></div>${metrics(s)}${s.n ? bars(s) : '<p class="muted">Tes ressentis et leurs fréquences apparaîtront ici. Aucun jour manquant ne sera compté comme un jour sans symptôme.</p>'}</section>`;
}
function calendarView() {
  return `<header class="intro"><div class="eyebrow">Au fil des jours</div><h1 tabindex="-1">Mon calendrier</h1><p>Une trace de chaque journée, à retrouver quand tu veux.</p></header>${calendarCard()}${chartCard()}`;
}
function statsView() {
  const annual = statsMode === "year",
    entries = annual
      ? data.entries.filter((e) => e.date.startsWith(String(year)))
      : monthEntries(),
    s = summary(entries, data.tags);
  return `<header class="intro"><div class="eyebrow">Prendre un peu de recul</div><h1 tabindex="-1">Mon évolution</h1><p>Des repères pour mieux observer ce que tu traverses.</p></header><div class="section-head"><div class="tabs" role="group" aria-label="Période"><button type="button" data-mode="month" class="${!annual ? "active" : ""}">Mois</button><button type="button" data-mode="year" class="${annual ? "active" : ""}">Année</button></div><div class="arrows"><button type="button" class="square" ${annual ? "data-year" : "data-month"}="-1" aria-label="Période précédente">‹</button><button type="button" class="square" ${annual ? "data-year" : "data-month"}="1" aria-label="Période suivante">›</button></div></div><p class="period">${annual ? year : fmt(month + "-01", { month: "long", year: "numeric" })}</p>${metrics(s)}${trendCard(entries, annual)}<div class="split"><section class="card"><h3>Mes humeurs</h3>${distribution(s)}</section><section class="card"><h3>Mes tags</h3>${s.n ? bars(s) : '<p class="muted">Les fréquences apparaîtront après ta première journée.</p>'}</section></div>${exportPanel()}`;
}
function exportPanel() {
  return `<section class="card"><h2>Emporter mes repères</h2><p class="muted">Un rapport pour toi, ou pour préparer une consultation.</p><div class="export-controls"><label>Période<select id="export-period"><option value="month">Mois affiché</option><option value="three">Trois derniers mois</option><option value="year">Année affichée</option><option value="custom">Dates personnalisées</option></select></label><label>Du<input id="export-start" type="date" value="${month}-01"></label><label>Au<input id="export-end" type="date" value="${monthEnd(month)}"></label></div><label class="check"><input type="checkbox" id="include-notes"> Inclure mes notes dans le PDF</label><div class="button-row"><button type="button" class="primary" id="export-pdf">↓ Exporter en PDF</button><button type="button" class="subtle" id="export-csv">↓ Exporter en CSV</button></div><p class="muted" style="margin:15px 0 0">Les pourcentages portent uniquement sur les journées renseignées.</p></section>`;
}
function profileView() {
  return `<header class="intro"><div class="eyebrow">Un carnet à ton image</div><h1 tabindex="-1">Mon profil</h1><p>Les petits détails qui font que tu te sens chez toi.</p></header>${accountPanel()}<section class="card"><h2>Mon accueil</h2><p class="muted">${context.repository.mode === "cloud" ? "Ton profil est enregistré dans ton compte avec ton carnet." : "Ton profil est conservé dans ce navigateur."}</p><div class="profile-photo-row"><div class="profile-photo">${data.profile.photo ? `<img src="${esc(data.profile.photo)}" alt="Ma photo de profil">` : esc(data.profile.symbol)}</div><div><label class="subtle photo-picker">Choisir une photo<input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp" class="photo-file-input"></label>${data.profile.photo ? '<button type="button" class="plain" id="remove-profile-photo">Retirer la photo</button>' : ""}<p class="muted">JPG, PNG ou WebP · 10 Mo maximum</p></div></div><form id="profile-form"><div class="profile-grid"><label>Prénom ou pseudonyme<input id="profile-name" value="${esc(data.profile.displayName)}" required maxlength="50"></label><label>Mon symbole<select id="profile-symbol">${["🎋", "🍃", "🪷", "🌙", "🐉", "🐼", "🕊️", "🌿"].map((s) => `<option ${data.profile.symbol === s ? "selected" : ""}>${s}</option>`).join("")}</select></label><label class="wide">Phrase d’accueil<input id="profile-welcome" value="${esc(data.profile.welcomeText)}" maxlength="200" required></label></div><button type="submit" class="primary" style="margin-top:20px">Enregistrer mon profil</button></form></section><section class="card"><div class="section-head"><h2>Mes tags</h2><button type="button" class="subtle" data-add-tag="feeling">＋ Ajouter</button></div><p class="muted">Choisis la catégorie, renomme ou masque tes tags. Masquer conserve ton historique.</p>${data.tags.map((t, i) => `<div class="tag-admin"><button type="button" data-fav="${esc(t.id)}" aria-label="${t.favorite ? "Retirer des favoris" : "Ajouter aux favoris"} : ${esc(t.name)}" aria-pressed="${!!t.favorite}">${t.favorite ? "★" : "☆"}</button><span class="tag-name ${t.hidden ? "hidden-name" : ""}">${esc(t.name)}${t.hidden ? " (masqué)" : ""}<small class="category-badge ${categoryOf(t)}">${categoryLabel(categoryOf(t))}</small></span><button type="button" data-up="${esc(t.id)}" ${i === 0 ? "disabled" : ""} aria-label="Monter ${esc(t.name)}">↑</button><button type="button" data-rename="${esc(t.id)}" aria-label="Renommer ${esc(t.name)}">✎</button><button type="button" data-hide="${esc(t.id)}" aria-label="${t.hidden ? "Afficher" : "Masquer"} ${esc(t.name)}">${t.hidden ? "＋" : "−"}</button><button type="button" data-remove-tag="${esc(t.id)}" aria-label="Supprimer ${esc(t.name)}">×</button></div>`).join("")}</section><section class="card"><h2>Mes données, avec moi</h2><p class="muted">${context.repository.mode === "cloud" ? "Ton carnet est envoyé à ton compte lorsque la connexion le permet. Attends la confirmation de synchronisation avant de fermer la page." : "Ce carnet reste dans ce navigateur. Effacer les données du navigateur peut l’effacer : garde une sauvegarde."}</p><div class="button-row"><button type="button" class="primary" id="backup">↓ Sauvegarder tout</button><button type="button" class="subtle" id="restore">↑ Restaurer une sauvegarde</button><input hidden type="file" id="import-file" accept="application/json,.json"></div>${storageError ? '<button type="button" class="subtle" id="recover-raw">Récupérer les données illisibles</button>' : ""}<p class="muted" style="margin-top:17px">La sauvegarde JSON contient ton profil et sa photo, tes tags, tes journées, tes fiches TCC, tes inquiétudes et tes repères. Les fichiers exportés ne sont pas chiffrés : conserve-les dans un endroit privé.</p><button type="button" class="plain danger" id="erase">Effacer toutes mes données</button></section>${exportPanel()}<section class="card"><h2>À propos d’Ancrage</h2><p class="muted">Un journal personnel pour enregistrer, observer et comparer. Il ne pose aucun diagnostic et ne propose aucun traitement.</p><p class="muted" style="margin-bottom:0">Version 2 · Carnet local ou synchronisation sur un compte personnel.</p></section>`;
}
function openDialog(html) {
  const d = $("#dialog");
  d.innerHTML = html;
  const heading = d.querySelector("h2");
  if (heading) {
    heading.id = "dialog-title";
    d.setAttribute("aria-labelledby", "dialog-title");
  }
  d.showModal();
  d.querySelectorAll("[data-close]").forEach(
    (b) => (b.onclick = () => d.close()),
  );
}
function confirmAction(title, text, action, label = "Confirmer") {
  openDialog(
    `<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><div class="button-row"><button type="button" class="subtle" data-close>Annuler</button><button type="button" class="primary" id="confirm-action">${esc(label)}</button></div>`,
  );
  $("#confirm-action").onclick = () => {
    $("#dialog").close();
    action();
  };
}
function leaveDraft(action) {
  if (dirty)
    confirmAction(
      "Quitter cette journée ?",
      "Les modifications en cours ne sont pas enregistrées.",
      () => {
        loadDraft();
        action();
      },
      "Quitter sans enregistrer",
    );
  else action();
}
function editDay(date) {
  leaveDraft(() => {
    selected = date;
    month = date.slice(0, 7);
    tab = "today";
    loadDraft();
    shell();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
function tagDialog(id, category = "feeling") {
  const t = data.tags.find((t) => t.id === id);
  category = t ? categoryOf(t) : category;
  openDialog(
    `<h2>${t ? "Modifier ce tag" : "Un nouveau tag"}</h2><form id="tag-form"><label class="field-label" for="tag-name">Nom du tag</label><input id="tag-name" required maxlength="70" value="${esc(t?.name || "")}" placeholder="Ex. Promenade, fatigue, création…"><label class="field-label" for="tag-category">Catégorie</label><select id="tag-category"><option value="feeling" ${category === "feeling" ? "selected" : ""}>Ressentis · vert</option><option value="activity" ${category === "activity" ? "selected" : ""}>Activités · ocre</option></select><div class="button-row"><button type="button" class="subtle" data-close>Annuler</button><button type="submit" class="primary">${t ? "Enregistrer" : "Ajouter"}</button></div></form>`,
  );
  $("#tag-name").focus();
  $("#tag-form").onsubmit = (e) => {
    e.preventDefault();
    const name = $("#tag-name").value.trim(),
      category = $("#tag-category").value;
    if (!name) return;
    if (
      data.tags.some(
        (x) =>
          x.id !== id &&
          x.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"),
      )
    ) {
      toast("Ce tag existe déjà.");
      return;
    }
    if (
      update((d) => {
        if (t)
          Object.assign(
            d.tags.find((x) => x.id === id),
            { name, category },
          );
        else
          d.tags.push({
            id: crypto.randomUUID(),
            name,
            category,
            hidden: false,
            favorite: false,
          });
      })
    ) {
      $("#dialog").close();
      shell();
      notifyChange(t ? "Tag mis à jour" : "Tag ajouté");
    }
  };
}
const download = downloadFile;
function exportData() {
  const start = $("#export-start").value,
    end = $("#export-end").value;
  if (!start || !end || start > end) {
    toast("Choisis une période valide.");
    return null;
  }
  return { start, end, entries: rangeEntries(start, end) };
}
function bindTrends() {
  document.querySelectorAll("[data-chart-select]").forEach(
    (el) =>
      (el.onchange = () => {
        chartTag = el.value;
        shell();
      }),
  );
  document.querySelectorAll("[data-isolate]").forEach(
    (el) =>
      (el.onclick = () => {
        chartTag = el.dataset.isolate;
        if (tab !== "stats") statsMode = "month";
        shell();
        $(".trend")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }),
  );
  document.querySelectorAll("[data-tag-month]").forEach((el) => {
    const show = () => {
      const key = el.dataset.tagMonth,
        rows = data.entries.filter((e) => e.date.startsWith(key)),
        count = rows.filter((e) => e.tags.includes(chartTag)).length;
      openDialog(
        `<h2>${fmt(key + "-01", { month: "long", year: "numeric" })}</h2><p>${esc(data.tags.find((t) => t.id === chartTag)?.name)}<br>${count} jours sur ${rows.length} renseignés · ${number((count / rows.length) * 100)} %</p><div class="button-row"><button type="button" class="subtle" data-close>Fermer</button><button type="button" class="primary" id="open-tag-month">Voir ce mois</button></div>`,
      );
      $("#open-tag-month").onclick = () => {
        $("#dialog").close();
        month = key;
        statsMode = "month";
        shell();
        $(".trend")?.scrollIntoView({ behavior: "smooth" });
      };
    };
    el.onclick = show;
    el.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        show();
      }
    };
  });
}
function bind() {
  bindAccountControls({ toast, openDialog, importLocal: importLocalNotebook });
  reflection.bind();
  bindPhoto();
  document.querySelectorAll("[data-nav]").forEach(
    (b) =>
      (b.onclick = () =>
        leaveDraft(() => {
          tab = b.dataset.nav;
          shell();
          document.querySelector("h1")?.focus({ preventScroll: true });
          window.scrollTo(0, 0);
        })),
  );
  document.querySelectorAll("[data-mood]").forEach(
    (b) =>
      (b.onclick = () => {
        draft.score = Number(b.dataset.mood);
        dirty = true;
        document.querySelectorAll("[data-mood]").forEach((c) => {
          c.classList.toggle("selected", c === b);
          c.setAttribute("aria-pressed", String(c === b));
        });
      }),
  );
  document.querySelectorAll("[data-tag]").forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.tag;
        draft.tags = draft.tags.includes(id)
          ? draft.tags.filter((t) => t !== id)
          : [...draft.tags, id];
        dirty = true;
        b.classList.toggle("selected", draft.tags.includes(id));
        b.setAttribute("aria-pressed", String(draft.tags.includes(id)));
        b.textContent =
          (draft.tags.includes(id) ? "✓ " : "") +
          data.tags.find((t) => t.id === id).name;
      }),
  );
  if ($("#daily-note"))
    $("#daily-note").oninput = (e) => {
      draft.note = e.target.value;
      dirty = true;
    };
  if ($("#entry-date"))
    $("#entry-date").onchange = (e) => {
      const v = e.target.value;
      if (v && v <= today()) editDay(v);
      else e.target.value = selected;
    };
  if ($("#journal-form"))
    $("#journal-form").onsubmit = (event) => {
      event.preventDefault();
      if (!draft.score) {
        toast("Choisis l’humeur de ta journée.");
        return;
      }
      if (storageError) {
        toast("Récupère d’abord les données précédentes dans ton profil.");
        return;
      }
      const old = data.entries.find((e) => e.date === selected),
        now = new Date().toISOString();
      if (
        update((d) => {
          d.entries = d.entries.filter((e) => e.date !== selected);
          d.entries.push({
            date: selected,
            ...structuredClone(draft),
            createdAt: old?.createdAt || now,
            updatedAt: now,
          });
        })
      ) {
        dirty = false;
        shell();
        notifyChange("🌿 Journée enregistrée");
      }
    };
  if ($("#delete-day"))
    $("#delete-day").onclick = () =>
      confirmAction(
        "Supprimer cette journée ?",
        "Son humeur, ses tags et sa note seront supprimés.",
        () => {
          if (
            update(
              (d) => (d.entries = d.entries.filter((e) => e.date !== selected)),
            )
          ) {
            loadDraft();
            shell();
            notifyChange("Journée supprimée");
          }
        },
        "Supprimer",
      );
  document
    .querySelectorAll("[data-day]")
    .forEach((b) => (b.onclick = () => editDay(b.dataset.day)));
  document.querySelectorAll("[data-month]").forEach(
    (b) =>
      (b.onclick = () => {
        const [y, m] = month.split("-").map(Number),
          d = new Date(y, m - 1 + Number(b.dataset.month), 1);
        month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        shell();
      }),
  );
  document.querySelectorAll("[data-year]").forEach(
    (b) =>
      (b.onclick = () => {
        year += Number(b.dataset.year);
        shell();
      }),
  );
  document.querySelectorAll("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        statsMode = b.dataset.mode;
        shell();
      }),
  );
  document.querySelectorAll("[data-point]").forEach((b) => {
    const show = () => {
      const e = data.entries.find((e) => e.date === b.dataset.point),
        m = mood(e.score);
      openDialog(
        `<h2>${fmt(e.date)}</h2><p class="mood-label">${face(m.score)} ${m.label}</p><div class="tags">${e.tags.map((id) => `<span class="tag ${categoryOf(data.tags.find((t) => t.id === id) || {})}">${esc(data.tags.find((t) => t.id === id)?.name)}</span>`).join("")}</div>${e.note ? `<p style="margin-top:20px">${esc(e.note)}</p>` : ""}<div class="button-row"><button type="button" class="subtle" data-close>Fermer</button><button type="button" class="primary" id="edit-point">Modifier</button></div>`,
      );
      $("#edit-point").onclick = () => {
        $("#dialog").close();
        editDay(e.date);
      };
    };
    b.onclick = show;
    b.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        show();
      }
    };
  });
  document
    .querySelectorAll("[data-add-tag]")
    .forEach((b) => (b.onclick = () => tagDialog(undefined, b.dataset.addTag)));
  bindTrends();
  if ($("#profile-form"))
    $("#profile-form").onsubmit = (e) => {
      e.preventDefault();
      const name = $("#profile-name").value.trim(),
        welcome = $("#profile-welcome").value.trim();
      if (!name || !welcome) return;
      if (
        update(
          (d) =>
            (d.profile = {
              ...d.profile,
              displayName: name,
              symbol: $("#profile-symbol").value,
              welcomeText: welcome,
            }),
        )
      ) {
        shell();
        notifyChange("Profil enregistré");
      }
    };
  for (const [attr, fn] of [
    [
      "fav",
      (d, id) => {
        const t = d.tags.find((t) => t.id === id);
        t.favorite = !t.favorite;
      },
    ],
    [
      "hide",
      (d, id) => {
        const t = d.tags.find((t) => t.id === id);
        t.hidden = !t.hidden;
      },
    ],
    [
      "up",
      (d, id) => {
        const i = d.tags.findIndex((t) => t.id === id);
        if (i > 0) [d.tags[i - 1], d.tags[i]] = [d.tags[i], d.tags[i - 1]];
      },
    ],
  ])
    document.querySelectorAll("[data-" + attr + "]").forEach(
      (b) =>
        (b.onclick = () => {
          if (update((d) => fn(d, b.dataset[attr]))) shell();
        }),
    );
  document
    .querySelectorAll("[data-rename]")
    .forEach((b) => (b.onclick = () => tagDialog(b.dataset.rename)));
  document.querySelectorAll("[data-remove-tag]").forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.removeTag,
          t = data.tags.find((t) => t.id === id);
        confirmAction(
          "Supprimer « " + t.name + " » ?",
          "Ce tag sera aussi retiré de toutes les journées passées. Pour conserver les statistiques, masque-le plutôt.",
          () => {
            if (
              update((d) => {
                d.tags = d.tags.filter((t) => t.id !== id);
                d.entries.forEach(
                  (e) => (e.tags = e.tags.filter((x) => x !== id)),
                );
              })
            ) {
              draft.tags = draft.tags.filter((x) => x !== id);
              if (chartTag === id) chartTag = "mood";
              shell();
            }
          },
          "Supprimer partout",
        );
      }),
  );
  if ($("#backup"))
    $("#backup").onclick = () =>
      download(
        JSON.stringify(data, null, 2),
        "ancrage-sauvegarde-" + today() + ".json",
        "application/json",
      );
  if ($("#recover-raw"))
    $("#recover-raw").onclick = () => {
      try {
        download(
          localStorage.getItem(KEY) || "",
          "ancrage-recuperation.json",
          "application/json",
        );
      } catch {
        toast("Le stockage est inaccessible.");
      }
    };
  if ($("#restore")) $("#restore").onclick = () => $("#import-file").click();
  if ($("#import-file"))
    $("#import-file").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        if (f.size > MAX_NOTEBOOK_BYTES)
          throw Error("Le fichier dépasse 4 Mo.");
        const restored = migrateData(
          validateBackup(JSON.parse(await f.text())),
        );
        confirmAction(
          "Restaurer cette sauvegarde ?",
          `${restored.entries.length} journées et ${restored.tags.length} tags. Cette restauration remplacera le carnet actuel. Sauvegarde-le d’abord si tu veux le conserver.`,
          () => {
            if (persist(restored)) {
              storageError = false;
              reflection.reset();
              chartTag = "mood";
              loadDraft();
              shell();
              notifyChange("Sauvegarde restaurée");
            }
          },
          "Remplacer et restaurer",
        );
      } catch (err) {
        toast(err.message || "Fichier illisible.");
      }
      e.target.value = "";
    };
  if ($("#erase"))
    $("#erase").onclick = () =>
      confirmAction(
        "Effacer mon carnet ?",
        "Toutes les journées, les fiches TCC, les inquiétudes, les repères, les tags et le profil de ce carnet seront effacés. Cette action est irréversible sans sauvegarde.",
        () => {
          if (persist(migrateData(initial()))) {
            storageError = false;
            reflection.reset();
            chartTag = "mood";
            selected = today();
            loadDraft();
            shell();
            notifyChange("Carnet effacé");
          }
        },
        "Tout effacer",
      );
  if ($("#export-period"))
    $("#export-period").onchange = (e) => {
      let start = month + "-01",
        end = monthEnd(month);
      if (e.target.value === "three") {
        const d = new Date(today() + "T12:00:00");
        d.setDate(1);
        d.setMonth(d.getMonth() - 2);
        start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        end = today();
      }
      if (e.target.value === "year") {
        start = year + "-01-01";
        end = year + "-12-31";
      }
      if (e.target.value !== "custom") {
        $("#export-start").value = start;
        $("#export-end").value = end;
      }
    };
  for (const id of ["export-start", "export-end"])
    if ($("#" + id))
      $("#" + id).onchange = () => ($("#export-period").value = "custom");
  if ($("#export-csv"))
    $("#export-csv").onclick = () => {
      const r = exportData();
      if (r)
        download(
          csv(r.entries, data.tags),
          `ancrage-${r.start}-${r.end}.csv`,
          "text/csv;charset=utf-8",
        );
    };
  if ($("#export-pdf"))
    $("#export-pdf").onclick = async () => {
      const r = exportData();
      if (!r) return;
      const b = $("#export-pdf");
      b.disabled = true;
      b.textContent = "Préparation…";
      try {
        await makePDF(r, $("#include-notes").checked);
        toast("Rapport PDF prêt");
      } catch {
        toast("Le PDF n’a pas pu être créé. Réessaie ou exporte en CSV.");
      } finally {
        b.disabled = false;
        b.textContent = "↓ Exporter en PDF";
      }
    };
}
const makePDF = createPdfExporter({
  getData: () => data,
  fmt,
  number,
  summary,
  MOODS,
  mood,
  categoryLabel,
  categoryOf,
  download,
});
const reflection = createReflection({
  notifyChange,
  getData: () => data,
  update,
  esc,
  today,
  fmt,
  toast,
  shell,
  confirmAction,
  openDialog,
  download,
  editDay,
});
context.hasDraft = () => dirty;
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
shell();

function bindPhoto() {
  if ($("#reflect-day"))
    $("#reflect-day").onclick = () =>
      leaveDraft(() => {
        tab = "reflection";
        reflection.startRecord(selected);
      });
  if ($("#remove-profile-photo"))
    $("#remove-profile-photo").onclick = () => {
      if (update((d) => delete d.profile.photo)) {
        shell();
        notifyChange("Photo retirée");
      }
    };
  if ($("#profile-photo-file"))
    $("#profile-photo-file").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      ) {
        toast("Choisis un JPG, PNG ou WebP de moins de 10 Mo.");
        e.target.value = "";
        return;
      }
      let url;
      try {
        url = URL.createObjectURL(file);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
        if (!img.naturalWidth) throw Error();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 384;
        const ctx = canvas.getContext("2d"),
          side = Math.min(img.naturalWidth, img.naturalHeight);
        ctx.fillStyle = "#fffef8";
        ctx.fillRect(0, 0, 384, 384);
        ctx.drawImage(
          img,
          (img.naturalWidth - side) / 2,
          (img.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          384,
          384,
        );
        const photo = canvas.toDataURL("image/jpeg", 0.85);
        const name = $("#profile-name").value.trim(),
          welcome = $("#profile-welcome").value.trim(),
          symbol = $("#profile-symbol").value;
        if (
          update((d) => {
            d.profile.photo = photo;
            if (name) d.profile.displayName = name;
            if (welcome) d.profile.welcomeText = welcome;
            d.profile.symbol = symbol;
          })
        ) {
          shell();
          notifyChange("Photo de profil enregistrée");
        }
      } catch {
        toast("Cette photo ne peut pas être lue. Essaie une autre image.");
      } finally {
        if (url) URL.revokeObjectURL(url);
        e.target.value = "";
      }
    };
}

function importLocalNotebook() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) {
      toast("Aucun ancien carnet n’a été trouvé dans ce navigateur.");
      return;
    }
    const restored = migrateData(validateBackup(JSON.parse(raw)));
    confirmAction(
      "Importer mon carnet de cet appareil ?",
      `${restored.entries.length} journées seront transférées. Ce carnet doit être le tien. Il remplacera le carnet de ce compte ; exporte la version actuelle si tu veux la conserver.`,
      () => {
        if (persist(restored)) {
          storageError = false;
          reflection.reset();
          chartTag = "mood";
          loadDraft();
          shell();
          notifyChange("Import ajouté à la synchronisation.");
        }
      },
      "Importer et remplacer",
    );
  } catch (error) {
    toast(error.message || "L’ancien carnet ne peut pas être lu.");
  }
}
