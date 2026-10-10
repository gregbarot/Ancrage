import { request } from "./modules/api.mjs";
import { context } from "./modules/context.mjs";
import { NotebookRepository, LOCAL_KEY } from "./modules/repository.mjs";
import { escapeHtml as esc, downloadFile } from "./modules/dom.mjs";
import { privacyNotice } from "./modules/privacy.mjs";
import { createInitialNotebook, migrateData, validateBackup } from "./core.mjs";

const app = document.querySelector("#app");
const AUTH_SCREEN_KEY = "ancrage-auth-screen";
let serviceError = "";
let authNotice = "";

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

  let account = document.querySelector("#sync-account");
  if (!account) {
    account = document.createElement("button");
    account.type = "button";
    account.id = "sync-account";
    account.textContent = "Sauvegarder en ligne";
    banner.append(account);
  }

  account.onclick = () => {
    sessionStorage.setItem(AUTH_SCREEN_KEY, "1");
    sessionStorage.removeItem("ancrage-mode");
    location.reload();
  };

  const render = ({ status, error, pending }) => {
    const messages = {
      local:
        "Suivi enregistré dans ce navigateur. Crée un compte pour le sauvegarder en ligne et le retrouver sur tes autres appareils.",
      saved: "Carnet synchronisé",
      pending: "Modifications en attente d’envoi…",
      sending: "Enregistrement dans ton compte…",
    };
    message.textContent = error?.message || messages[status];
    banner.dataset.status = status;
    retry.hidden = status !== "error" || context.repository.blocked;
    exporting.hidden = !pending;
    reload.hidden = !context.repository.blocked;
    account.hidden = context.repository.mode !== "local";
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

function authScreen(mode = "login", resetToken = "") {
  const registration = mode === "register";
  const forgotten = mode === "forgot";
  const resetting = mode === "reset";
  const ready = !!context.policy;

  const title = registration
    ? "Créer mon compte"
    : forgotten
      ? "Mot de passe oublié"
      : resetting
        ? "Choisir un nouveau mot de passe"
        : "Ouvrir mon carnet";

  const intro = forgotten
    ? "Indique l’adresse e-mail de ton compte. Si elle correspond à un compte Ancrage, tu recevras un lien de réinitialisation."
    : resetting
      ? "Choisis une nouvelle phrase de passe pour ton compte."
      : "Un carnet personnel, à retrouver sur tes appareils.";

  let formHtml = "";

  if (forgotten) {
    formHtml = `<form id="auth-form" class="account-form">
      <label for="auth-email">Adresse e-mail
        <input id="auth-email" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" required>
      </label>
      <p id="auth-error" role="alert"></p>
      <button type="submit" class="primary" ${!ready ? "disabled" : ""}>Envoyer le lien</button>
    </form>`;
  } else if (resetting) {
    formHtml = `<form id="auth-form" class="account-form">
      <label for="auth-password">Nouveau mot de passe
        <input id="auth-password" name="password" type="password" autocomplete="new-password" minlength="15" maxlength="72" required>
      </label>
      <p class="muted">Utilise une phrase de passe d’au moins 15 caractères.</p>
      <label for="auth-confirmation">Confirmer le mot de passe
        <input id="auth-confirmation" type="password" name="confirmation" autocomplete="new-password" required>
      </label>
      <p id="auth-error" role="alert"></p>
      <button type="submit" class="primary" ${!ready ? "disabled" : ""}>Réinitialiser mon mot de passe</button>
    </form>`;
  } else {
    formHtml = `<form id="auth-form" class="account-form">
      <label for="auth-email">Adresse e-mail
        <input id="auth-email" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" required>
      </label>
      <label for="auth-password">Mot de passe
        <input id="auth-password" name="password" type="password" autocomplete="${registration ? "new-password" : "current-password"}" ${registration ? 'minlength="15" maxlength="72"' : 'maxlength="72"'} required>
      </label>
      ${registration ? '<p class="muted" id="password-help">Utilise une phrase de passe d’au moins 15 caractères.</p><label for="auth-confirmation">Confirmer le mot de passe<input id="auth-confirmation" type="password" name="confirmation" autocomplete="new-password" required></label>' : ""}
      ${
        registration
          ? `<details><summary>Lire les informations sur mes données</summary>${privacyNotice(context.policy)}</details>
      <label class="check"><input name="adult" type="checkbox" required> J’ai 18 ans ou plus.</label>
      <label class="check"><input name="consent" type="checkbox" required> J’accepte explicitement l’enregistrement de mon carnet et des informations pouvant concerner ma santé pour les retrouver sur mes appareils. Je peux retirer cet accord en supprimant mon compte.</label>`
          : ""
      }
      <label class="check"><input name="remember" type="checkbox"> Se souvenir de moi sur cet appareil pendant 30 jours.</label>
      ${!registration ? '<button type="button" class="plain" id="forgot-password">Mot de passe oublié ?</button>' : ""}
      <p id="auth-error" role="alert"></p>
      <button type="submit" class="primary" ${!ready ? "disabled" : ""}>${registration ? "Créer mon compte" : "Me connecter"}</button>
    </form>`;
  }

  app.innerHTML = `<main id="main-content" class="auth-shell"><header><div class="brand"><span class="brand-icon" aria-hidden="true">a</span>ancrage</div>
    <h1>${title}</h1>
    <p>${intro}</p></header>
    <nav class="auth-nav" aria-label="Accès au compte">${[
      ["login", "Connexion"],
      ["register", "Créer un compte"],
    ]
      .map(
        ([key, label]) =>
          `<button type="button" class="plain" data-auth-mode="${key}" ${mode === key ? 'aria-current="page"' : ""}>${label}</button>`,
      )
      .join("")}</nav>
    ${authNotice ? `<p class="notice" role="status">${esc(authNotice)}</p>` : ""}
    ${serviceError ? `<p class="notice" role="alert">${esc(serviceError)} Tu peux continuer à utiliser ton carnet dans ce navigateur.</p>` : ""}
    ${formHtml}
    <div class="local-option"><h2>Continuer sans compte</h2><p>Ton suivi restera enregistré automatiquement dans ce navigateur. Crée un compte plus tard si tu veux le sauvegarder en ligne et le retrouver sur d’autres appareils.</p><button type="button" class="subtle" id="use-local">Continuer sans compte</button></div>
    <p class="muted">Ton adresse e-mail sert à identifier ton compte. Ton mot de passe n’est jamais enregistré en clair.</p></main>`;

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.onclick = () => {
      authNotice = "";
      history.replaceState({}, "", location.pathname);
      authScreen(button.dataset.authMode);
    };
  });

  document.querySelector("#use-local").onclick = () => {
    authNotice = "";
    history.replaceState({}, "", location.pathname);
    sessionStorage.removeItem(AUTH_SCREEN_KEY);
    void start("local");
  };

  const forgotButton = document.querySelector("#forgot-password");
  if (forgotButton) {
    forgotButton.onclick = () => {
      authNotice = "";
      authScreen("forgot");
    };
  }

  const form = document.querySelector("#auth-form");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const errorBox = document.querySelector("#auth-error");
    const button = form.querySelector("[type=submit]");

    if ((registration || resetting) && values.confirmation !== values.password) {
      errorBox.textContent = "Les deux mots de passe ne correspondent pas.";
      return;
    }

    button.disabled = true;
    errorBox.textContent = "";

    try {
      if (forgotten) {
        const result = await request("password-request", {
          method: "POST",
          body: { email: values.email },
        });
        authNotice =
          result.message ||
          "Si un compte correspond à cette adresse, un e-mail de réinitialisation a été envoyé.";
        authScreen("login");
        return;
      }

      if (resetting) {
        const result = await request("password-reset", {
          method: "POST",
          body: {
            token: resetToken,
            newPassword: values.password,
          },
        });
        if (result.reset) {
          history.replaceState({}, "", location.pathname);
          authNotice =
            "Ton mot de passe a été modifié. Tu peux maintenant te connecter.";
          authScreen("login");
          return;
        }
      }

      const body = {
        ...values,
        adult: values.adult === "on",
        consent: values.consent === "on",
        remember: values.remember === "on",
        policyVersion: context.policy?.version,
      };
      delete body.confirmation;

      if (registration) {
        try {
          const raw = localStorage.getItem(LOCAL_KEY);
          if (raw) {
            body.notebook = migrateData(validateBackup(JSON.parse(raw)));
          }
        } catch {
          // Le compte peut quand même être créé si le stockage local est illisible.
        }
      }

      const result = await request(mode, { method: "POST", body });
      context.session = result;
      context.policy = result.policy;
      authNotice = "";
      sessionStorage.removeItem(AUTH_SCREEN_KEY);
      await start("cloud", result);
    } catch (error) {
      errorBox.textContent = error.message;
      button.disabled = false;
    }
  };
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const resetToken = params.get("reset");

  try {
    const session = await request("session");
    context.session = session;
    context.policy = session.policy;

    if (resetToken) {
      sessionStorage.setItem(AUTH_SCREEN_KEY, "1");
      authScreen("reset", resetToken);
      return;
    }

    if (session.user) {
      sessionStorage.removeItem(AUTH_SCREEN_KEY);
      await start("cloud", { ...session, ...(await request("notebook")) });
      return;
    }
  } catch (error) {
    serviceError = error.message;
  }

  if (resetToken) {
    sessionStorage.setItem(AUTH_SCREEN_KEY, "1");
    authScreen("reset", resetToken);
    return;
  }

  if (sessionStorage.getItem(AUTH_SCREEN_KEY) === "1") {
    authScreen();
    return;
  }

  await start("local");
}

void boot();
