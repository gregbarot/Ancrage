export function createPdfExporter({
  getData,
  fmt,
  number,
  summary,
  MOODS,
  mood,
  categoryLabel,
  categoryOf,
  download,
}) {
  return async function makePDF({ start, end, entries }, notes) {
    const data = getData();
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib,
      doc = await PDFDocument.create(),
      font = await doc.embedFont(StandardFonts.Helvetica),
      bold = await doc.embedFont(StandardFonts.HelveticaBold),
      serif = await doc.embedFont(StandardFonts.TimesRoman),
      green = rgb(0.14, 0.3, 0.23),
      gray = rgb(0.43, 0.48, 0.4);
    let page, y;
    const clean = (s) =>
      String(s)
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/…/g, "...")
        .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "");
    function newPage() {
      page = doc.addPage([595, 842]);
      y = 778;
      page.drawRectangle({
        x: 0,
        y: 821,
        width: 595,
        height: 21,
        color: green,
      });
      page.drawText("ANCRAGE  /  RAPPORT PERSONNEL", {
        x: 42,
        y: 803,
        size: 9,
        font,
        color: gray,
      });
    }
    function ensure(h) {
      if (y - h < 52) newPage();
    }
    function line(text, size = 11, f = font, color = green) {
      const value = clean(text),
        words = value.split(/\s+/);
      let row = "";
      for (const word of words) {
        if (f.widthOfTextAtSize(row + " " + word, size) > 510 && row) {
          ensure(size + 9);
          page.drawText(row, { x: 42, y, size, font: f, color });
          y -= size + 9;
          row = "";
        }
        if (f.widthOfTextAtSize(word, size) > 510) {
          for (const c of word) {
            if (f.widthOfTextAtSize(row + c, size) > 510) {
              ensure(size + 9);
              page.drawText(row, { x: 42, y, size, font: f, color });
              y -= size + 9;
              row = "";
            }
            row += c;
          }
        } else row += (row ? " " : "") + word;
      }
      ensure(size + 9);
      page.drawText(row, { x: 42, y, size, font: f, color });
      y -= size + 9;
    }
    function space(n = 15) {
      y -= n;
    }
    newPage();
    line("Mon carnet, avec du recul.", 29, serif);
    line(data.profile.displayName, 13);
    line(`${fmt(start)} au ${fmt(end)}`, 11, font, gray);
    space();
    const s = summary(entries, data.tags),
      days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
    line(`${s.n} / ${days} journées renseignées`, 17, bold);
    line(
      `Humeur moyenne : ${s.n ? number(s.average, 1) + " / 5" : "aucune donnée"}`,
      15,
    );
    line(
      "Les jours non renseignés sont inconnus et exclus des calculs.",
      10,
      font,
      gray,
    );
    space();
    line("Répartition des humeurs", 19, serif);
    for (const m of s.moods)
      line(
        `${m.label} : ${m.count} jours (${s.n ? number((m.count / s.n) * 100) : 0} %)`,
      );
    space();
    line("Courbe d’humeur", 19, serif);
    ensure(185);
    const top = y,
      xx = (d) =>
        50 +
        ((Date.parse(d) - Date.parse(start)) /
          86400000 /
          Math.max(1, days - 1)) *
          480,
      yy = (score) => top - 125 + (score - 1) * 29;
    for (let n = 1; n <= 5; n++) {
      page.drawLine({
        start: { x: 50, y: yy(n) },
        end: { x: 530, y: yy(n) },
        thickness: 0.5,
        color: rgb(0.85, 0.88, 0.82),
      });
      page.drawText(String(n), {
        x: 35,
        y: yy(n) - 3,
        size: 9,
        font,
        color: gray,
      });
    }
    entries.forEach((e, i) => {
      const p = entries[i - 1];
      if (p && Date.parse(e.date) - Date.parse(p.date) === 86400000)
        page.drawLine({
          start: { x: xx(p.date), y: yy(p.score) },
          end: { x: xx(e.date), y: yy(e.score) },
          thickness: 1.5,
          color: green,
        });
      page.drawCircle({
        x: xx(e.date),
        y: yy(e.score),
        size: 2.5,
        color: green,
      });
    });
    page.drawText(clean(fmt(start)), {
      x: 50,
      y: top - 144,
      size: 9,
      font,
      color: gray,
    });
    page.drawText(clean(fmt(end)), {
      x: 425,
      y: top - 144,
      size: 9,
      font,
      color: gray,
    });
    y = top - 169;
    line(
      "1 = Horrible ; 5 = Super. Les interruptions indiquent des jours inconnus.",
      9,
      font,
      gray,
    );
    space();
    line("Fréquence des ressentis et activités", 19, serif);
    for (const t of s.tags) {
      ensure(40);
      line(
        `${t.name} (${categoryLabel(categoryOf(t))}) : ${t.count} jours sur ${s.n} renseignés (${number(t.percent)} %)`,
      );
      page.drawRectangle({
        x: 42,
        y: y + 1,
        width: 510,
        height: 4,
        color: rgb(0.92, 0.94, 0.88),
      });
      if (t.percent)
        page.drawRectangle({
          x: 42,
          y: y + 1,
          width: (510 * t.percent) / 100,
          height: 4,
          color: rgb(0.56, 0.67, 0.42),
        });
      space(14);
    }
    if (notes) {
      space();
      line("Notes quotidiennes", 19, serif);
      const withNotes = entries.filter((e) => e.note.trim());
      if (!withNotes.length)
        line("Aucune note pour cette période.", 11, font, gray);
      for (const e of withNotes) {
        ensure(65);
        line(`${fmt(e.date)} · ${mood(e.score).label}`, 12, bold);
        e.note.split("\n").forEach((p) => line(p, 11));
        space();
      }
    }
    doc
      .getPages()
      .forEach((p, i) =>
        p.drawText(
          `Ancrage - Document personnel - ${i + 1} / ${doc.getPageCount()}`,
          { x: 42, y: 25, size: 8, font, color: gray },
        ),
      );
    download(
      await doc.save(),
      `ancrage-${start}-${end}.pdf`,
      "application/pdf",
    );
  };
}
