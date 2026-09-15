/** Réservé aux valeurs interpolées dans les gabarits HTML. */
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

export function downloadFile(content, filename, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function showRecoveryCode(code, onClose) {
  const dialog = document.querySelector("#dialog");
  dialog.innerHTML = `<h2 id="dialog-title">Garde ton code de récupération</h2>
    <p>Ce code permet de récupérer ton compte si tu oublies ton mot de passe. Il remplace tout ancien code et ne sera plus affiché.</p>
    <p>Conserve-le dans ton gestionnaire de mots de passe ou un endroit privé.</p>
    <label for="recovery-code">Ton code personnel</label>
    <input id="recovery-code" class="recovery-code" readonly>
    <div class="button-row"><button type="button" class="subtle" id="download-recovery">Télécharger le code</button>
    <button type="button" class="primary" id="close-recovery">J’ai conservé mon code</button></div>`;
  dialog.setAttribute("aria-labelledby", "dialog-title");
  dialog.querySelector("#recovery-code").value = code;
  dialog.querySelector("#download-recovery").onclick = () =>
    downloadFile(code + "\n", "ancrage-code-recuperation.txt", "text/plain");
  dialog.querySelector("#close-recovery").onclick = () => dialog.close();
  dialog.addEventListener(
    "close",
    () => {
      dialog.replaceChildren();
      onClose?.();
    },
    { once: true },
  );
  dialog.showModal();
}
