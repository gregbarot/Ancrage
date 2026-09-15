import { escapeHtml as esc } from "./dom.mjs";

export function privacyNotice(policy) {
  if (!policy)
    return "<p>Les informations sur le service seront disponibles après sa configuration.</p>";
  return `<div class="privacy-notice">
    <p><strong>Responsable :</strong> ${esc(policy.owner)}. Contact : <a href="mailto:${esc(policy.contact)}">${esc(policy.contact)}</a>.</p>
    <p>Ton identifiant, les informations de ton profil, tes humeurs, tags, notes, fiches, inquiétudes et repères servent uniquement à gérer ton carnet privé et à le retrouver sur tes appareils. Les notes peuvent contenir des informations sur ta santé.</p>
    <p>La gestion du compte repose sur la fourniture du service demandé. La synchronisation des données sensibles repose sur ton consentement explicite. Tu peux utiliser le mode sur cet appareil sans créer de compte.</p>
    <p>Le carnet est chiffré dans la base. Le serveur le déchiffre pour te l’afficher : ce n’est pas un chiffrement de bout en bout. Le responsable et les intervenants techniques habilités peuvent avoir un accès technique. Aucun accès aux carnets des autres utilisateurs n’est proposé dans l’application.</p>
    <p>Les comptes et carnets sont conservés jusqu’à leur suppression, ou pendant ${esc(policy.inactiveDays)} jours sans utilisation. Les sauvegardes techniques suivent une durée de ${esc(policy.backupDays)} jours. Le responsable doit empêcher la remise en service des comptes supprimés lors d’une restauration.</p>
    <p>Dans Mon profil, tu peux exporter, rectifier ou supprimer tes données et retirer ton consentement en supprimant ton compte. Les mêmes demandes peuvent être adressées au contact ci-dessus. Tu peux aussi adresser une réclamation à la CNIL.</p>
    <p>Les cookies de session servent à la connexion et à la protection des formulaires. Aucun outil de publicité ni mesure d’audience n’est ajouté. En mode local, le carnet reste dans le navigateur ; en mode compte, les modifications non envoyées restent temporairement dans la page ouverte.</p>
    <p>Cette version est destinée à un cercle privé de personnes majeures. Elle ne propose ni diagnostic ni suivi par un professionnel.</p>
    <p class="muted">Information et consentement : ${esc(policy.version)}.</p>
  </div>`;
}
