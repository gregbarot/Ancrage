import {
  emptyReflection,
  validateReflection,
  photoValid,
} from "./reflection-core.mjs";
export const MOODS = [
  { score: 5, label: "Super", emoji: "🤩", color: "#b6d982" },
  { score: 4, label: "Bien", emoji: "🙂", color: "#cbdcba" },
  { score: 3, label: "Moyen", emoji: "😐", color: "#edd18c" },
  { score: 2, label: "Mauvais", emoji: "😟", color: "#e7ac89" },
  { score: 1, label: "Horrible", emoji: "😣", color: "#d89998" },
];
export function createInitialNotebook(displayName = "Mon carnet") {
  return migrateData({
    version: 1,
    profile: {
      displayName,
      symbol: "🌿",
      welcomeText: "Comment s’est passée ta journée ?",
    },
    tags: [
      "Migraine",
      "Douleur dos",
      "Insomnie",
      "Fond anxieux",
      "Crise d’angoisse",
      "Déréalisation",
    ].map((name, index) => ({
      id: `tag-${index}`,
      name,
      category: "feeling",
      hidden: false,
      favorite: false,
    })),
    entries: [],
  });
}
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const validDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;
export function summary(entries, tags) {
  const n = entries.length;
  return {
    n,
    average: n ? entries.reduce((a, e) => a + e.score, 0) / n : null,
    moods: MOODS.map((m) => ({
      ...m,
      count: entries.filter((e) => e.score === m.score).length,
    })),
    tags: tags.map((t) => {
      const count = entries.filter((e) => e.tags.includes(t.id)).length;
      return { ...t, count, percent: n ? (count / n) * 100 : 0 };
    }),
  };
}
export function validateBackup(x) {
  if (!validateReflection(x?.reflection) || !photoValid(x?.profile?.photo))
    throw Error(
      "Les fiches ou la photo de cette sauvegarde ne sont pas valides.",
    );
  if (
    !x ||
    x.version !== 1 ||
    !Array.isArray(x.tags) ||
    !Array.isArray(x.entries) ||
    !x.profile ||
    typeof x.profile.displayName !== "string" ||
    typeof x.profile.symbol !== "string" ||
    typeof x.profile.welcomeText !== "string"
  )
    throw Error("Cette sauvegarde Ancrage n’est pas valide.");
  const ids = new Set();
  for (const t of x.tags) {
    if (
      !t ||
      typeof t.id !== "string" ||
      typeof t.name !== "string" ||
      !t.name.trim() ||
      ids.has(t.id) ||
      (t.category !== undefined &&
        !["feeling", "activity"].includes(t.category))
    )
      throw Error("Les tags de la sauvegarde ne sont pas valides.");
    ids.add(t.id);
  }
  const dates = new Set();
  for (const e of x.entries) {
    if (
      !validDate(e.date) ||
      e.date > today() ||
      dates.has(e.date) ||
      !Number.isInteger(e.score) ||
      e.score < 1 ||
      e.score > 5 ||
      !Array.isArray(e.tags) ||
      e.tags.some((t) => !ids.has(t)) ||
      new Set(e.tags).size !== e.tags.length ||
      typeof e.note !== "string"
    )
      throw Error("Les journées de la sauvegarde ne sont pas valides.");
    dates.add(e.date);
  }
  return x;
}
export function csv(entries, tags) {
  const cell = (x) =>
    '"' +
    String(x ?? "")
      .replace(/"/g, '""')
      .replace(/^[=+@\-\t\r]/, "'$&") +
    '"';
  return (
    "\uFEFF" +
    [
      ["Date", "Humeur", "Score humeur", ...tags.map((t) => t.name), "Note"],
      ...entries.map((e) => [
        e.date,
        MOODS.find((m) => m.score === e.score).label,
        e.score,
        ...tags.map((t) => (e.tags.includes(t.id) ? 1 : 0)),
        e.note,
      ]),
    ]
      .map((r) => r.map(cell).join(";"))
      .join("\r\n")
  );
}

export const categoryOf = (t) =>
  t.category === "activity" ? "activity" : "feeling";
export function migrateData(source) {
  const x = structuredClone(source);
  x.reflection = x.reflection || emptyReflection();
  x.tags = x.tags.map((t) => ({ ...t, category: categoryOf(t) }));
  if (!x.activityTagsInitialized) {
    const names = ["Sport", "Méditation", "Promenade", "Création"];
    names.forEach((name, i) => {
      if (
        !x.tags.some(
          (t) =>
            t.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"),
        )
      ) {
        let id = "activity-" + i;
        while (x.tags.some((t) => t.id === id)) id += "-";
        x.tags.push({
          id,
          name,
          category: "activity",
          hidden: false,
          favorite: false,
        });
      }
    });
    x.activityTagsInitialized = true;
  }
  return x;
}
export function tagSeries(entries, tagId, period, annual = false) {
  const steps = annual
    ? 12
    : new Date(
        Number(period.slice(0, 4)),
        Number(period.slice(5, 7)),
        0,
      ).getDate();
  return Array.from({ length: steps }, (_, index) => {
    const key = annual
      ? `${period}-${String(index + 1).padStart(2, "0")}`
      : `${period}-${String(index + 1).padStart(2, "0")}`;
    const rows = entries.filter((e) =>
      annual ? e.date.startsWith(key) : e.date === key,
    );
    const count = rows.filter((e) => e.tags.includes(tagId)).length,
      n = rows.length;
    return {
      i: index + 1,
      key,
      n,
      count,
      value: n ? (annual ? (count / n) * 100 : count) : null,
    };
  });
}
