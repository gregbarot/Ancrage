export const HABITS = [
  {
    id: "worst",
    name: "Imaginer le pire",
    example: "« Si cela se passe mal, tout sera perdu. »",
    question: "Quels autres scénarios restent possibles ?",
  },
  {
    id: "binary",
    name: "Tout ou rien",
    example: "« Si ce n’est pas parfait, c’est un échec. »",
    question: "Quelle nuance existe entre ces deux extrêmes ?",
  },
  {
    id: "mind",
    name: "Deviner la pensée de l’autre",
    example: "« Il ne répond pas, il doit m’en vouloir. »",
    question: "Qu’a-t-il réellement dit ou fait ? Qu’est-ce que je suppose ?",
  },
  {
    id: "always",
    name: "Généraliser",
    example: "« Cela s’est mal passé, ce sera toujours comme ça. »",
    question: "Est-ce toujours vrai, ou vrai dans cette situation ?",
  },
  {
    id: "emotion",
    name: "Prendre l’émotion pour une preuve",
    example: "« Je le ressens très fort, donc c’est forcément vrai. »",
    question:
      "Qu’est-ce que je ressens, et quels faits est-ce que je connais ?",
  },
  {
    id: "certainty",
    name: "Exiger la certitude",
    example: "« Je dois être absolument sûr avant d’avancer. »",
    question: "Quel petit pas puis-je faire sans avoir toutes les réponses ?",
  },
];
export const STEPS = [
  {
    title: "La situation",
    fields: [
      ["situation", "Que s’est-il passé, concrètement ?"],
      ["theme", "Un thème pour retrouver cette fiche", "text"],
    ],
  },
  {
    title: "Ma réaction",
    fields: [
      ["thought", "Quelle pensée m’est venue ?"],
      ["emotion", "Quelle émotion ai-je ressentie ?", "text"],
      ["before", "Son intensité, de 0 à 10", "intensity"],
    ],
  },
  {
    title: "Mon corps et mes gestes",
    fields: [
      ["body", "Qu’ai-je ressenti dans mon corps ?"],
      ["behavior", "Qu’ai-je fait ou évité ?"],
    ],
  },
  {
    title: "Prendre du recul",
    fields: [
      ["support", "Quels faits soutiennent ma pensée ?"],
      ["against", "Quels faits la nuancent ou la contredisent ?"],
    ],
  },
  {
    title: "Une autre réponse",
    fields: [
      ["alternative", "Quelles autres interprétations sont possibles ?"],
      ["balanced", "Quelle réponse plus équilibrée me semble crédible ?"],
    ],
  },
  {
    title: "La suite",
    fields: [
      ["action", "Quel petit pas utile puis-je faire ?"],
      ["after", "Mon intensité émotionnelle maintenant", "intensity"],
      ["learned", "Qu’est-ce que je souhaite retenir ?"],
    ],
  },
];
export const EXTRA = [
  ["fear", "Quelle catastrophe est-ce que je redoute ?"],
  [
    "probability",
    "Probabilité estimée, si je souhaite la noter",
    "probability",
  ],
  ["control", "Ce qui dépend de moi"],
  ["outside", "Ce qui ne dépend pas de moi"],
  ["friend", "Que dirais-je à un proche ?"],
];
export const OUTCOMES = {
  unknown: "Encore inconnu",
  no: "Non arrivé",
  partial: "Partiellement arrivé",
  yes: "Arrivé",
};
export function emptyReflection() {
  return { records: [], worries: [], anchors: [], worryTime: "" };
}
export function newRecord(date) {
  return {
    id: crypto.randomUUID(),
    date,
    step: 0,
    completed: false,
    habits: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    outcome: "unknown",
  };
}
export const photoValid = (x) =>
  x === undefined ||
  x === "" ||
  (typeof x === "string" &&
    x.length <= 600000 &&
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(x));
export function validateReflection(x) {
  if (x === undefined) return true;
  if (
    !x ||
    !["records", "worries", "anchors"].every((k) => Array.isArray(x[k]))
  )
    return false;
  const date = (s) =>
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;
  const strings = (o, keys) =>
    keys.every(
      (k) =>
        o[k] === undefined ||
        (typeof o[k] === "string" && o[k].length <= 50000),
    );
  const ids = new Set();
  for (const list of [x.records, x.worries, x.anchors])
    for (const o of list) {
      if (!o || typeof o.id !== "string" || ids.has(o.id) || !date(o.date))
        return false;
      ids.add(o.id);
    }
  for (const r of x.records) {
    if (
      !Number.isInteger(r.step) ||
      r.step < 0 ||
      r.step > 5 ||
      typeof r.completed !== "boolean" ||
      !Array.isArray(r.habits) ||
      r.habits.some((h) => !HABITS.some((k) => k.id === h)) ||
      !Object.hasOwn(OUTCOMES, r.outcome) ||
      !strings(r, [
        ...STEPS.flatMap((s) => s.fields.map((f) => f[0])),
        ...EXTRA.map((f) => f[0]),
        "reality",
        "coping",
      ])
    )
      return false;
    for (const [k, max] of [
      ["before", 10],
      ["after", 10],
      ["probability", 100],
    ])
      if (
        r[k] !== undefined &&
        r[k] !== "" &&
        (!/^\d+$/.test(r[k]) || Number(r[k]) > max)
      )
        return false;
  }
  for (const w of x.worries)
    if (
      !strings(w, ["text", "action", "redirect", "reviewDate"]) ||
      typeof w.text !== "string" ||
      !["action", "anticipation", "unknown"].includes(w.kind) ||
      typeof w.archived !== "boolean" ||
      (w.reviewDate && !date(w.reviewDate))
    )
      return false;
  for (const a of x.anchors)
    if (typeof a.text !== "string" || !strings(a, ["text", "sourceId"]))
      return false;
  return (
    typeof x.worryTime === "string" &&
    (x.worryTime === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(x.worryTime))
  );
}
