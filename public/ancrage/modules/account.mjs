import { context } from "./context.mjs";
import { request } from "./api.mjs";
import { escapeHtml as esc, downloadFile } from "./dom.mjs";
import { privacyNotice } from "./privacy.mjs";

export function accountPanel() {
  if (context.repository.mode === "local")
    return `<section class="card"><h2>Retrouver mon carnet sur mes appareils</h2>
    <p>Tu utilises le carnet sur cet appareil. Avec un compte, tu peux choisir de le transférer vers ton espace personnel.</p>
    <button type="button" class="primary" data-account-login>Se connecter ou créer un compte</button></section>`;

  return `<section class="card"><h2>Mon compte</h2><p>Adresse e-mail : <strong>${esc(context.session.user.email)}</strong></p>
    <div class="button-row"><button type="button" class="subtle" data-account-refresh>Actualiser depuis mon compte</button>
    <button type="button" class="subtle" data-account-password>Changer mon mot de passe</button>
    <button type="button" class="subtle" data-account-export>Exporter mes données de compte</button>
    <button type="button" class="plain" data-account-logout>Me déconnecter</button></div>
    <details><summary>Transférer mon ancien carnet</summary><p>Si ton carnet précédent est encore dans ce navigateur, tu peux le transférer volontairement vers ce compte. Tu peux aussi restaurer ton export JSON ci-dessous.</p>
    <button type="button" class="subtle" data-account-import>Importer le carnet de cet appareil</button></details>
    <details><summary>Confidentialité et droits</summary>${privacyNotice(context.policy)}</details>
    <button type="button" class="plain danger" data-account-delete>Supprimer mon compte et retirer mon consentement</button></section>`;
}

export function bindAccountControls({ toast, openDialog, importLocal }) {
  const bind = (selector, handler) =>
    document.querySelectorAll(selector).forEach((button) => {
      button.onclick = handler;
    });

  const mayLeave = () => {
    if (context.repository.hasPending || context.hasDraft()) {
      toast(
        "Enregistre ta journée et attends la synchronisation, ou exporte tes modifications avant de quitter.",
      );
      return false;
    }
    return true;
  };

  bind("[data-account-login]", () => {
    if (!mayLeave()) return;
    sessionStorage.removeItem("ancrage-mode");
    location.reload();
  });

  bind("[data-account-refresh]", () => {
    if (mayLeave()) location.reload();
  });

  bind("[data-account-import]", importLocal);

  bind("[data-account-logout]", async () => {
    if (!mayLeave()) return;
    try {
      await request("logout", { method: "POST", body: {} });
      sessionStorage.removeItem("ancrage-mode");
      location.reload();
    } catch (error) {
      toast(error.message);
    }
  });

  bind("[data-account-export]", async () => {
    try {
      const data = await request("export");
      downloadFile(
        JSON.stringify(data, null, 2),
        "ancrage-donnees-du-compte.json",
      );
    } catch (error) {
      toast(error.message);
    }
  });

  bind("[data-account-password]", () => {
    if (!mayLeave()) return;
    openDialog(`<h2>Changer mon mot de passe</h2><form id="password-form" class="account-form">
      <label>Mot de passe actuel<input name="currentPassword" type="password" autocomplete="current-password" required></label>
      <label>Nouveau mot de passe<input name="newPassword" type="password" autocomplete="new-password" minlength="15" maxlength="72" required></label>
      <label>Confirmer le nouveau mot de passe<input name="confirmation" type="password" autocomplete="new-password" required></label>
      <p>Utilise une phrase d’au moins 15 caractères. Les autres sessions seront déconnectées.</p>
      <p id="account-error" role="alert"></p><div class="button-row"><button type="button" class="subtle" data-close>Annuler</button>
      <button class="primary" type="submit">Changer le mot de passe</button></div></form>`);

    const form = document.querySelector("#password-form");
    form.onsubmit = async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const errorBox = document.querySelector("#account-error");
      if (values.newPassword !== values.confirmation) {
        errorBox.textContent = "Les deux mots de passe ne correspondent pas.";
        return;
      }

      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        const result = await request("password", {
          method: "POST",
          body: values,
        });
        context.session = result;
        document.querySelector("#dialog").close();
        toast("Mot de passe modifié.");
      } catch (error) {
        errorBox.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
  });

  bind("[data-account-delete]", () => {
    if (!mayLeave()) return;
    openDialog(`<h2>Supprimer mon compte</h2><p>Ton profil et ton carnet seront supprimés de la base active. Exporte d’abord les données que tu veux conserver.</p>
      <p>Les sauvegardes techniques expirent après ${esc(context.policy.backupDays)} jours. Cette suppression retire également ton consentement à la synchronisation.</p>
      <form id="delete-account-form" class="account-form"><label>Mon mot de passe<input type="password" name="password" autocomplete="current-password" required></label>
      <label class="check"><input type="checkbox" name="confirm" required> Je confirme la suppression de mon compte et de son carnet.</label>
      <p id="account-error" role="alert"></p><div class="button-row"><button type="button" class="subtle" data-close>Annuler</button>
      <button type="submit" class="primary danger">Supprimer définitivement</button></div></form>`);

    const form = document.querySelector("#delete-account-form");
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        await request("account", {
          method: "DELETE",
          body: { password: new FormData(form).get("password"), confirm: true },
        });
        sessionStorage.removeItem("ancrage-mode");
        location.reload();
      } catch (error) {
        document.querySelector("#account-error").textContent = error.message;
        button.disabled = false;
      }
    };
  });
}
