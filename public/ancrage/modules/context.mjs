// Contexte explicite partagé par le contrôleur de l’interface et ses services.
export const context = {
  repository: null,
  session: null,
  policy: null,
  hasDraft: () => false,
};
