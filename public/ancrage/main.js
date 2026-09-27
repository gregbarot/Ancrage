import { request } from "./modules/api.mjs";
import { context } from "./modules/context.mjs";
import { NotebookRepository, LOCAL_KEY } from "./modules/repository.mjs";
import { escapeHtml as esc, downloadFile } from "./modules/dom.mjs";
import { privacyNotice } from "./modules/privacy.mjs";
import { createInitialNotebook, migrateData, validateBackup } from "./core.mjs";

const app = document.querySelector("#app");
let serviceError = "";

async function start(mode, result = null) {
  let notebook = result?.notebook;
  let localError = false;
  if (mode === "local") {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      notebook = raw
        ? migrateData(validateBackup(JSON.parse(raw)))
        : createInitialNotebook();
    } catch {
      localError = true;
      notebook = createInitialNotebook();
    }
  }
  context.repository = new NotebookRepository({
    mode,
    notebook,
    revision: result?.revision || 0,
    storage: mode === "local" ? localStorage : null,
  });
  context.localError = localError;
  if (result?.user) context.session = result;
  if (result?.policy) context.policy = result.policy;
  sessionStorage.setItem("ancrage-mode", mode);
  setupStatus();
  try {
    await import("./app.js");
  } catch (error) {
    app.innerHTML =
      '<main id="main-content" class="auth-shell"><h1>Le carnet ne peut pas s’ouvrir</h1><p>Vérifie que tous les fichiers ont été transférés et que les modules JavaScript sont correctement servis.</p><button type="button" id="reload-app">Réessayer</button></main>';
    document.querySelector("#reload-app").onclick = () => location.reload();
    console.error("Ancrage : ouverture impossible.", error.name);
  }
}

function setupStatus() {
  const banner = document.querySelector("#sync-banner");
  banner.hidden = false;
  const message = document.querySelector("#sync-status");
  const retry = document.querySelector("#sync-retry");
  const exporting = document.querySelector("#sync-export");
  const reload = document.querySelector("#sync-reload");
  const render = ({ status, error, pending }) => {
    const messages = {
      local: "Carnet conservé sur cet appareil",
      saved: "Carnet synchronisé",
      pending: "Modifications en attente d’envoi…",
      sending: "Enregistrement dans ton compte…",
    };
    message.textContent = error?.message || messages[status];
    banner.dataset.status = status;
    retry.hidden = status !== "error" || context.repository.blocked;
    exporting.hidden = !pending;
    reload.hidden = !context.repository.blocked;
  };
  context.repository.onStatus = render;
  render({ status: context.repository.status, pending: false });
  retry.onclick = () => {
    void context.repository.retry();
  };
  exporting.onclick = () =>
    downloadFile(
      JSON.stringify(context.repository.snapshot, null, 2),
      "ancrage-copie-en-attente.json",
    );
  reload.onclick = () => {
    location.reload();
  };
  window.addEventListener("online", () => {
    if (context.repository.hasPending && !context.repository.blocked)
      void context.repository.retry();
  });
  window.addEventListener("beforeunload", (event) => {
    if (context.repository.hasPending) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}

function authScreen(mode = "login") {
  const registration = mode === "register";
  const ready = !!context.policy;

  app.innerHTML = `<main id="main-content" class="auth-shell"><header><div class="brand"><span class="brand-icon" aria-hidden="true">a</span>ancrage</div>
    <h1>${registration ? "Créer mon compte" : "Ouvrir mon carnet"}</h1>
    <p>Un carnet personnel, à retrouver sur tes appareils.</p></header>
    <nav class="auth-nav" aria-label="Accès au compte">${[
      ["login", "Connexion"],
      ["register", "Créer un compte"],
    ]
      .map(
        ([key, label]) =>
          `<button type="button" class="plain" data-auth-mode="${key}" ${mode === key ? 'aria-current="page"' : ""}>${label}</button>`,
      )
      .join("")}</nav>
    ${serviceError ? `<p class="notice" role="alert">${esc(serviceError)} Tu peux ouvrir ton carnet sur cet appareil.</p>` : ""}
    <form id="auth-form" class="account-form">
      <label for="auth-email">Adresse e-mail
        <input id="auth-email" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" required>
      </label>
      <label for="auth-password">Mot de passe
        <input id="auth-password" name="password" type="password" autocomplete="${registration ? "new-password" : "current-password"}" ${registration ? 'minlength="15" maxlength="72"' : 'maxlength="72"'} required>
      </label>
      ${registration ? '<p class="muted" id="password-help">Utilise une phrase de passe d’au moins 15 caractères.</p><label for="auth-confirmation">Confirmer le mot de passe<input id="auth-confirmation" type="password" name="confirmation" autocomplete="new-password" required></label>' : ""}
      ${registration
        ? `<details><summary>Lire les informations sur mes données</summary>${privacyNotice(context.policy)}</details>
      <label class="check"><input name="adult" type="checkbox" required> J’ai 18 ans ou plus.</label>
      <label class="check"><input name="consent" type="checkbox" required> J’accepte explicitement l’enregistrement de mon carnet et des informations pouvant concerner ma santé pour les retrouver sur mes appareils. Je peux retirer cet accord en supprimant mon compte.</label>`
        : ""}
      <p id="auth-error" role="alert"></p>
      <button type="submit" class="primary" ${!ready ? "disabled" : ""}>${registration ? "Créer mon compte" : "Me connecter"}</button>
    </form>
    <div class="local-option"><h2>Sur cet appareil</h2><p>Tu peux aussi conserver ton carnet dans ce navigateur, sans synchronisation.</p><button type="button" class="subtle" id="use-local">Ouvrir le carnet de cet appareil</button></div>
    <p class="muted">Ton adresse e-mail sert à identifier ton compte. Ton mot de passe n’est jamais enregistré en clair.</p></main>`;

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.onclick = () => authScreen(button.dataset.authMode);
  });

  document.querySelector("#use-local").onclick = () => {
    void start("local");
  };

  const form = document.querySelector("#auth-form");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const errorBox = document.querySelector("#auth-error");

    if (registration && values.confirmation !== values.password) {
      errorBox.textContent = "Les deux mots de passe ne correspondent pas.";
      return;
    }

    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    errorBox.textContent = "";

    try {
      const body = {
        ...values,
        adult: values.adult === "on",
        consent: values.consent === "on",
        policyVersion: context.policy?.version,
      };
      delete body.confirmation;

      const result = await request(mode, { method: "POST", body });
      context.session = result;
      context.policy = result.policy;
      await start("cloud", result);
    } catch (error) {
      errorBox.textContent = error.message;
      button.disabled = false;
    }
  };
}

async function boot() {
  try {
    const session = await request("session");
    context.session = session;
    context.policy = session.policy;
    if (sessionStorage.getItem("ancrage-mode") === "local") {
      await start("local");
      return;
    }
    if (session.user) {
      await start("cloud", { ...session, ...(await request("notebook")) });
      return;
    }
  } catch (error) {
    serviceError = error.message;
  }
  authScreen();
}

void boot();
