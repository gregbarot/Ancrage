import {
  HABITS,
  STEPS,
  EXTRA,
  OUTCOMES,
  newRecord,
} from "./reflection-core.mjs";
export function createReflection({
  getData,
  update,
  esc,
  today,
  fmt,
  toast,
  notifyChange = toast,
  shell,
  confirmAction,
  openDialog,
  download,
  editDay,
}) {
  let section = "situations",
    recordId = null,
    worryId = null,
    anchorId = null,
    filter = "all",
    deadline = 0,
    remaining = 600,
    interval;
  const $ = (s) => document.querySelector(s),
    all = (s) => document.querySelectorAll(s),
    state = () => getData().reflection;
  const sections = {
    situations: "Situations",
    worries: "Inquiétudes",
    habits: "Pensées",
    anchors: "Mes repères",
  };
  const record = () => state().records.find((r) => r.id === recordId);
  const mutate = (fn) => update((d) => fn(d.reflection));
  const textField = (key, label, value = "", type = "textarea") =>
    `<label class="reflection-field">${esc(label)}${type === "textarea" ? `<textarea data-field="${key}" maxlength="50000" placeholder="Quelques mots suffisent. Tu peux aussi laisser cette question de côté.">${esc(value)}</textarea>` : `<input data-field="${key}" type="${type}" ${type === "text" ? 'maxlength="50000"' : ""} value="${esc(value)}">`}</label>`;
  function field([key, label, type], r) {
    if (type === "intensity" || type === "probability") {
      const max = type === "intensity" ? 10 : 100;
      return `<label class="reflection-field">${esc(label)}<select data-field="${key}"><option value="">Je ne sais pas encore</option>${Array.from({ length: max + 1 }, (_, i) => `<option value="${i}" ${String(r[key]) === String(i) ? "selected" : ""}>${i}${max === 100 ? " %" : " / 10"}</option>`).join("")}</select></label>`;
    }
    return textField(key, label, r[key], type);
  }
  function view() {
    return `<header class="intro"><div class="eyebrow">À ton rythme</div><h1>Prendre du recul</h1><p>Un espace facultatif pour poser ce qui te travaille.</p></header><div class="reflection-tabs" role="tablist" aria-label="Outils pour prendre du recul">${Object.entries(
      sections,
    )
      .map(
        ([k, v]) =>
          `<button type="button" role="tab" id="tab-${k}" aria-controls="reflection-panel" aria-selected="${section === k}" tabindex="${section === k ? 0 : -1}" data-ref-section="${k}">${v}</button>`,
      )
      .join(
        "",
      )}</div><div id="reflection-panel" role="tabpanel" aria-labelledby="tab-${section}">${section === "situations" ? situations() : section === "worries" ? worries() : section === "habits" ? habits() : anchors()}</div><details class="reflection-sources"><summary>À propos de ces outils</summary><p>Ces exercices s’inspirent des TCC. Tu choisis les questions qui te sont utiles. Ils ne posent pas de diagnostic et ne remplacent pas un accompagnement professionnel. Une émotion qui ne diminue pas n’est pas un échec.</p><p>Sources : <a href="https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/thought-record/" target="_blank" rel="noopener noreferrer">Fiche de pensées du NHS</a> · <a href="https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/tackling-your-worries/" target="_blank" rel="noopener noreferrer">Boîte à inquiétudes du NHS</a> (en anglais).</p></details>`;
  }
  function situations() {
    const r = record();
    if (r) return editor(r);
    const list = state().records.filter(
      (r) =>
        filter === "all" || (filter === "draft" ? !r.completed : r.completed),
    );
    return `<section class="card reflection-lead"><h2>Comprendre une situation</h2><p>Une question après l’autre, sans avoir à tout résoudre.</p><button type="button" class="primary" data-new-record>＋ Nouvelle fiche</button></section><div class="section-head"><h2>Mes fiches</h2><select id="record-filter" aria-label="Filtrer les fiches">${[
      ["all", "Toutes"],
      ["draft", "En cours"],
      ["done", "Terminées"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${filter === v ? "selected" : ""}>${l}</option>`,
      )
      .join("")}</select></div>${
      list.length
        ? list
            .slice()
            .reverse()
            .map(
              (r) =>
                `<article class="card saved-record"><div class="eyebrow">${fmt(r.date)} · ${r.completed ? "Terminée" : "En cours"}</div><h3>${esc(r.situation || "Une situation à explorer")}</h3>${r.theme ? `<span class="tag">${esc(r.theme)}</span>` : ""}<p class="muted">${r.emotion ? esc(r.emotion) + " · " : ""}Étape ${r.step + 1} sur 6</p><button type="button" class="subtle" data-open-record="${esc(r.id)}">${r.completed ? "Relire ou compléter" : "Reprendre"}</button></article>`,
            )
            .join("")
        : '<div class="empty"><strong>De la place pour tes mots.</strong>Tes fiches apparaîtront ici, même inachevées.</div>'
    }`;
  }
  function editor(r) {
    return `<button type="button" class="plain" data-record-back>‹ Mes fiches</button><section class="card reflection-editor"><div class="section-head"><h2>${STEPS[r.step].title}</h2><span class="muted">${r.step + 1} / 6</span></div><div class="step-track" aria-label="Étape ${r.step + 1} sur 6">${STEPS.map((s, i) => `<button type="button" data-step="${i}" class="${i === r.step ? "active" : ""}" aria-label="Étape ${i + 1} : ${s.title}" ${i === r.step ? 'aria-current="step"' : ""}>${i + 1}</button>`).join("")}</div>${r.step === 0 ? textField("date", "Date de la situation", r.date, "date") : ""}${STEPS[r.step].fields.map((f) => field(f, r)).join("")}${r.step === 5 ? '<p class="muted">Tu peux laisser l’intensité inconnue ou indiquer la même valeur qu’au départ. Il n’y a pas de résultat à atteindre.</p>' : ""}${r.step === 3 ? `<details><summary>Habitudes de pensée à explorer</summary><p class="muted">Choisis celles qui te parlent, sans obligation.</p>${habitChoices(r)}</details>` : ""}<details class="deeper"><summary>Approfondir, si j’en ai envie</summary>${EXTRA.map((f) => field(f, r)).join("")}</details>${
      r.step === 5
        ? `<details class="deeper" ${r.completed ? "open" : ""}><summary>Prédiction et expérience</summary><p class="muted">À compléter plus tard, quand tu sais ce qui s’est passé.</p>${textField("reality", "Ce qui s’est réellement passé", r.reality)}<label class="reflection-field">Ce que je redoutais est-il arrivé ?<select data-field="outcome">${Object.entries(
            OUTCOMES,
          )
            .map(
              ([v, l]) =>
                `<option value="${v}" ${r.outcome === v ? "selected" : ""}>${l}</option>`,
            )
            .join(
              "",
            )}</select></label>${textField("coping", "Comment ai-je fait face ? Qu’est-ce qui m’a aidé ?", r.coping)}</details>`
        : ""
    }<p class="muted save-state" id="reflection-save-state" role="status">Tes réponses sont prises en compte au fil de l’écriture. Consulte l’état d’enregistrement en haut de page.</p><div class="button-row">${r.step > 0 ? '<button type="button" class="subtle" data-prev-step>Précédent</button>' : ""}${r.step < 5 ? '<button type="button" class="primary" data-next-step>Continuer</button>' : '<button type="button" class="primary" data-finish-record>Terminer ma fiche</button>'}<button type="button" class="plain" data-record-back>Reprendre plus tard</button></div></section><section class="card"><h3>Garder ce qui m’aide</h3><div class="button-row"><button type="button" class="subtle" data-record-anchor>Créer un repère avec ma réponse</button><button type="button" class="subtle" data-record-pdf>↓ Exporter cette fiche en PDF</button><button type="button" class="plain" data-record-day>Voir cette journée</button><button type="button" class="plain danger" data-delete-record>Supprimer la fiche</button></div></section>`;
  }
  function habitChoices(r) {
    return HABITS.map(
      (h) =>
        `<label class="habit-choice"><input type="checkbox" data-habit="${h.id}" ${r.habits.includes(h.id) ? "checked" : ""}><span><strong>${h.name}</strong><small>${h.question}</small></span></label>`,
    ).join("");
  }
  function habits() {
    return `<section class="card"><h2>Reconnaître mes habitudes de pensée</h2><p class="muted">Des pistes à explorer, pas des étiquettes. Dans une fiche, tu peux choisir toi-même ce qui ressemble à ta pensée.</p></section><div class="habit-grid">${HABITS.map((h) => `<article class="card habit-card"><h3>${h.name}</h3><p class="example">${h.example}</p><p>${h.question}</p><button type="button" class="subtle" data-start-habit="${h.id}">Explorer dans une fiche</button></article>`).join("")}</div>`;
  }
  function worries() {
    const w = state().worries.find((w) => w.id === worryId);
    return `<section class="card reflection-lead"><h2>Déposer une inquiétude</h2><p>Quelques mots pour ne pas devoir tout garder en tête.</p><button type="button" class="primary" data-new-worry>＋ Déposer une inquiétude</button></section>${
      w
        ? `<section class="card"><h3>Mon inquiétude</h3>${textField("text", "Ce qui tourne dans ma tête", w.text)}<label class="reflection-field">Aujourd’hui, pour cette inquiétude…<select data-field="kind">${[
            ["unknown", "Je ne sais pas encore"],
            ["action", "Une action est possible"],
            ["anticipation", "C’est surtout une anticipation"],
          ]
            .map(
              ([v, l]) =>
                `<option value="${v}" ${w.kind === v ? "selected" : ""}>${l}</option>`,
            )
            .join(
              "",
            )}</select></label>${w.kind === "action" ? textField("action", "Un petit pas concret que je peux faire", w.action) : '<p class="muted">J’ai la pensée que… Je peux laisser cette question ouverte pour le moment.</p>'}${textField("reviewDate", "Une date pour y revenir, si je le souhaite", w.reviewDate, "date")}${textField("redirect", "Vers quelle activité ai-je envie de me tourner ?", w.redirect)}<details class="deeper"><summary>Est-ce une nouvelle information ?</summary><p>Qu’est-ce qui a changé depuis la dernière fois ? Si rien de nouveau n’apparaît, tu peux choisir une pause et revenir à une activité qui compte pour toi.</p></details><p id="reflection-save-state" class="muted" role="status">Enregistrement au fil de l’écriture.</p><button type="button" class="primary" data-close-worry>Garder et revenir à ma liste</button></section>`
        : ""
    }<section class="card"><h3>Un temps pour prendre du recul</h3><label class="reflection-field">Mon créneau facultatif<input id="worry-time" type="time" value="${esc(state().worryTime)}"></label><p class="muted">Un repère personnel, sans notification. Tu peux t’arrêter avant la fin.</p><div class="timer-row"><select id="timer-duration" aria-label="Durée du temps de recul" ${deadline ? "disabled" : ""}><option value="600" ${remaining === 600 ? "selected" : ""}>10 minutes</option><option value="900" ${remaining === 900 ? "selected" : ""}>15 minutes</option></select><span id="timer-clock" role="timer">${clock()}</span><button type="button" class="subtle" id="timer-toggle">${deadline ? "Mettre en pause" : "Démarrer"}</button><button type="button" class="plain" id="timer-reset">Réinitialiser</button></div></section><h2>Ma boîte à inquiétudes</h2>${
      state().worries.filter((w) => !w.archived).length
        ? state()
            .worries.filter((w) => !w.archived)
            .slice()
            .reverse()
            .map((w) => worryCard(w))
            .join("")
        : '<div class="empty">Aucune inquiétude en attente.</div>'
    }<details class="deeper"><summary>Mes inquiétudes archivées (${state().worries.filter((w) => w.archived).length})</summary>${state()
      .worries.filter((w) => w.archived)
      .slice()
      .reverse()
      .map((w) => worryCard(w))
      .join("")}</details>`;
  }
  function worryCard(w) {
    return `<article class="card saved-record"><div class="eyebrow">${fmt(w.date)}</div><h3>${esc(w.text || "Une inquiétude à déposer")}</h3>${w.action ? `<p>${esc(w.action)}</p>` : ""}${w.reviewDate ? `<p class="muted">Y revenir le ${fmt(w.reviewDate)}</p>` : ""}<div class="button-row"><button type="button" class="subtle" data-open-worry="${esc(w.id)}">Relire ou compléter</button><button type="button" class="plain" data-archive-worry="${esc(w.id)}">${w.archived ? "Remettre dans ma boîte" : "Archiver"}</button><button type="button" class="plain danger" data-delete-worry="${esc(w.id)}">Supprimer</button></div></article>`;
  }
  function anchors() {
    const a = state().anchors.find((a) => a.id === anchorId);
    return `<section class="card reflection-lead"><h2>Mes repères personnels</h2><p>Des mots écrits par toi, à retrouver quand ils peuvent t’être utiles.</p><button type="button" class="primary" data-new-anchor>＋ Écrire un repère</button></section>${a ? `<section class="card">${textField("text", "Ce que je veux me rappeler", a.text)}<p id="reflection-save-state" class="muted" role="status">Enregistrement au fil de l’écriture.</p><button type="button" class="primary" data-close-anchor>Garder ce repère</button></section>` : ""}${
      state().anchors.length
        ? state()
            .anchors.slice()
            .reverse()
            .map(
              (a) =>
                `<article class="card anchor-card"><p>${esc(a.text || "Un repère à écrire")}</p><div class="button-row"><button type="button" class="plain" data-open-anchor="${esc(a.id)}">Modifier</button><button type="button" class="plain danger" data-delete-anchor="${esc(a.id)}">Supprimer</button></div></article>`,
            )
            .join("")
        : '<div class="empty"><strong>Tes propres mots ont leur place ici.</strong>Tu peux aussi garder une réponse écrite dans une fiche.</div>'
    }`;
  }
  function startRecord(date = today(), habit) {
    const r = newRecord(date);
    if (habit) r.habits = [habit];
    if (mutate((s) => s.records.push(r))) {
      section = "situations";
      recordId = r.id;
      shell();
    }
  }
  function addAnchor(text = "", sourceId = "") {
    const a = { id: crypto.randomUUID(), date: today(), text, sourceId };
    if (mutate((s) => s.anchors.push(a))) {
      section = "anchors";
      anchorId = a.id;
      shell();
    }
  }
  function clock() {
    const s = deadline
      ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      : remaining;
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function tick() {
    if ($("#timer-clock")) $("#timer-clock").textContent = clock();
    if (deadline && Date.now() >= deadline) {
      deadline = 0;
      remaining = 0;
      clearInterval(interval);
      toast("Ce temps est terminé. Tu peux revenir à ton activité.");
      if ($("#timer-toggle")) $("#timer-toggle").textContent = "Démarrer";
      if ($("#timer-duration")) $("#timer-duration").disabled = false;
    }
  }
  function bind() {
    all("[data-ref-section]").forEach((b) => {
      b.onclick = () => {
        section = b.dataset.refSection;
        shell();
      };
      b.onkeydown = (e) => {
        const keys = Object.keys(sections),
          i = keys.indexOf(section);
        let next;
        if (e.key === "ArrowRight") next = keys[(i + 1) % 4];
        if (e.key === "ArrowLeft") next = keys[(i + 3) % 4];
        if (e.key === "Home") next = keys[0];
        if (e.key === "End") next = keys[3];
        if (next) {
          e.preventDefault();
          section = next;
          shell();
          $("#tab-" + next).focus();
        }
      };
    });
    all("[data-new-record]").forEach((b) => (b.onclick = () => startRecord()));
    all("[data-open-record]").forEach(
      (b) =>
        (b.onclick = () => {
          recordId = b.dataset.openRecord;
          shell();
        }),
    );
    if ($("#record-filter"))
      $("#record-filter").onchange = (e) => {
        filter = e.target.value;
        shell();
      };
    all("[data-record-back]").forEach(
      (b) =>
        (b.onclick = () => {
          recordId = null;
          shell();
        }),
    );
    const r = record();
    all("[data-field]").forEach(
      (el) =>
        (el.oninput = () => {
          const k = el.dataset.field,
            v = el.value;
          if (k === "date" && (!v || v > today())) {
            toast("Choisis une date passée ou celle du jour.");
            return;
          }
          if (k === "reviewDate" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
          const ok = mutate((s) => {
            const o =
              section === "situations"
                ? s.records.find((x) => x.id === recordId)
                : section === "worries"
                  ? s.worries.find((x) => x.id === worryId)
                  : s.anchors.find((x) => x.id === anchorId);
            if (o) {
              o[k] = v;
              o.updatedAt = new Date().toISOString();
            }
          });
          if ($("#reflection-save-state"))
            $("#reflection-save-state").textContent = ok
              ? "Modification prise en compte."
              : "Échec de l’enregistrement. Garde une copie de ton texte avant de quitter.";
          if (ok && k === "kind") shell();
        }),
    );
    if ($('[data-field="date"]')) $('[data-field="date"]').max = today();
    const go = (step) => {
      if (
        mutate((s) => {
          s.records.find((x) => x.id === recordId).step = step;
        })
      ) {
        shell();
        $(".reflection-editor").scrollIntoView({ block: "start" });
      }
    };
    all("[data-step]").forEach(
      (b) => (b.onclick = () => go(Number(b.dataset.step))),
    );
    if ($("[data-next-step]"))
      $("[data-next-step]").onclick = () => go(r.step + 1);
    if ($("[data-prev-step]"))
      $("[data-prev-step]").onclick = () => go(r.step - 1);
    if ($("[data-finish-record]"))
      $("[data-finish-record]").onclick = () => {
        if (
          mutate((s) => {
            s.records.find((x) => x.id === recordId).completed = true;
          })
        ) {
          recordId = null;
          shell();
          notifyChange("Fiche conservée. Tu peux la compléter plus tard.");
        }
      };
    all("[data-habit]").forEach(
      (b) =>
        (b.onchange = () => {
          if (
            !mutate((s) => {
              const r = s.records.find((x) => x.id === recordId);
              r.habits = b.checked
                ? [...new Set([...r.habits, b.dataset.habit])]
                : r.habits.filter((h) => h !== b.dataset.habit);
            })
          )
            b.checked = !b.checked;
        }),
    );
    all("[data-start-habit]").forEach(
      (b) => (b.onclick = () => startRecord(today(), b.dataset.startHabit)),
    );
    if ($("[data-delete-record]"))
      $("[data-delete-record]").onclick = () =>
        confirmAction(
          "Supprimer cette fiche ?",
          "La fiche sera supprimée. Les repères déjà créés seront conservés.",
          () => {
            if (
              mutate(
                (s) => (s.records = s.records.filter((x) => x.id !== recordId)),
              )
            ) {
              recordId = null;
              shell();
            }
          },
          "Supprimer",
        );
    if ($("[data-record-day]"))
      $("[data-record-day]").onclick = () => editDay(r.date);
    if ($("[data-record-anchor]"))
      $("[data-record-anchor]").onclick = () =>
        addAnchor(r.balanced || r.learned || "", r.id);
    if ($("[data-record-pdf]"))
      $("[data-record-pdf]").onclick = async () => {
        try {
          await recordPDF(r);
          toast("Fiche PDF prête");
        } catch {
          toast(
            "La fiche PDF n’a pas pu être créée. La sauvegarde complète reste disponible dans le profil.",
          );
        }
      };
    if ($("[data-new-worry]"))
      $("[data-new-worry]").onclick = () => {
        const w = {
          id: crypto.randomUUID(),
          date: today(),
          text: "",
          kind: "unknown",
          action: "",
          redirect: "",
          reviewDate: "",
          archived: false,
        };
        if (mutate((s) => s.worries.push(w))) {
          worryId = w.id;
          shell();
          $('[data-field="text"]').focus();
        }
      };
    if ($("[data-close-worry]"))
      $("[data-close-worry]").onclick = () => {
        worryId = null;
        shell();
      };
    all("[data-open-worry]").forEach(
      (b) =>
        (b.onclick = () => {
          worryId = b.dataset.openWorry;
          shell();
        }),
    );
    all("[data-archive-worry]").forEach(
      (b) =>
        (b.onclick = () => {
          if (
            mutate((s) => {
              const w = s.worries.find((x) => x.id === b.dataset.archiveWorry);
              w.archived = !w.archived;
            })
          ) {
            worryId = null;
            shell();
          }
        }),
    );
    all("[data-delete-worry]").forEach(
      (b) =>
        (b.onclick = () =>
          confirmAction(
            "Supprimer cette inquiétude ?",
            "Cette note sera supprimée de la boîte et des archives.",
            () => {
              if (
                mutate(
                  (s) =>
                    (s.worries = s.worries.filter(
                      (w) => w.id !== b.dataset.deleteWorry,
                    )),
                )
              ) {
                worryId = null;
                shell();
              }
            },
            "Supprimer",
          )),
    );
    if ($("#worry-time"))
      $("#worry-time").onchange = (e) =>
        mutate((s) => (s.worryTime = e.target.value));
    if ($("#timer-duration"))
      $("#timer-duration").onchange = (e) => {
        remaining = Number(e.target.value);
        $("#timer-clock").textContent = clock();
      };
    if ($("#timer-toggle"))
      $("#timer-toggle").onclick = () => {
        if (deadline) {
          remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
          deadline = 0;
          clearInterval(interval);
        } else {
          if (remaining === 0) remaining = Number($("#timer-duration").value);
          deadline = Date.now() + remaining * 1000;
          interval = setInterval(tick, 1000);
        }
        shell();
      };
    if ($("#timer-reset"))
      $("#timer-reset").onclick = () => {
        clearInterval(interval);
        deadline = 0;
        remaining = Number($("#timer-duration").value);
        shell();
      };
    if ($("[data-new-anchor]"))
      $("[data-new-anchor]").onclick = () => addAnchor();
    if ($("[data-close-anchor]"))
      $("[data-close-anchor]").onclick = () => {
        anchorId = null;
        shell();
      };
    all("[data-open-anchor]").forEach(
      (b) =>
        (b.onclick = () => {
          anchorId = b.dataset.openAnchor;
          shell();
        }),
    );
    all("[data-delete-anchor]").forEach(
      (b) =>
        (b.onclick = () =>
          confirmAction(
            "Supprimer ce repère ?",
            "Le texte de ce repère sera supprimé.",
            () => {
              if (
                mutate(
                  (s) =>
                    (s.anchors = s.anchors.filter(
                      (a) => a.id !== b.dataset.deleteAnchor,
                    )),
                )
              ) {
                anchorId = null;
                shell();
              }
            },
            "Supprimer",
          )),
    );
  }
  async function recordPDF(r) {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib,
      doc = await PDFDocument.create(),
      font = await doc.embedFont(StandardFonts.Helvetica),
      bold = await doc.embedFont(StandardFonts.HelveticaBold);
    let page, y;
    const clean = (s) =>
      String(s ?? "")
        .replace(/[‘’]/g, "'")
        .replace(/[–—]/g, "-")
        .replace(/…/g, "...")
        .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "");
    function next() {
      page = doc.addPage([595, 842]);
      y = 780;
      page.drawRectangle({
        x: 0,
        y: 819,
        width: 595,
        height: 23,
        color: rgb(0.14, 0.3, 0.23),
      });
    }
    function line(s, size = 11, f = font) {
      for (const paragraph of clean(s).split("\n")) {
        let row = "";
        for (const char of paragraph) {
          if (f.widthOfTextAtSize(row + char, size) > 505) {
            draw(row);
            row = "";
          }
          row += char;
        }
        draw(row);
      }
      function draw(row) {
        if (y < 55) next();
        page.drawText(row, {
          x: 45,
          y,
          size,
          font: f,
          color: rgb(0.14, 0.25, 0.19),
        });
        y -= size + 8;
      }
    }
    next();
    line("ANCRAGE / MA FICHE DE SITUATION", 18, bold);
    line(fmt(r.date));
    line(getData().profile.displayName);
    line(r.completed ? "Fiche terminée" : "Fiche en cours");
    for (const s of STEPS) {
      line("");
      line(s.title, 15, bold);
      for (const [k, l] of s.fields) {
        line(l, 11, bold);
        line(r[k] || "Non renseigné");
      }
    }
    line("");
    line("Approfondir", 15, bold);
    for (const [k, l] of EXTRA) {
      line(l, 11, bold);
      line(r[k] || "Non renseigné");
    }
    line("Habitudes choisies", 13, bold);
    line(
      r.habits.map((id) => HABITS.find((h) => h.id === id)?.name).join(", ") ||
        "Aucune",
    );
    line("Prédiction et expérience", 15, bold);
    line(OUTCOMES[r.outcome]);
    line("Ce qui s’est passé : " + (r.reality || "Non renseigné"));
    line("Ce qui m’a aidé : " + (r.coping || "Non renseigné"));
    doc
      .getPages()
      .forEach((p, i) =>
        p.drawText(
          `Ancrage - Document personnel - ${i + 1}/${doc.getPageCount()}`,
          { x: 45, y: 25, size: 9, font },
        ),
      );
    download(
      await doc.save(),
      `ancrage-fiche-${r.date}.pdf`,
      "application/pdf",
    );
  }
  return {
    view,
    bind,
    startRecord,
    reset() {
      recordId = worryId = anchorId = null;
      clearInterval(interval);
      deadline = 0;
      remaining = 600;
    },
  };
}
