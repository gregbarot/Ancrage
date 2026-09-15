export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let csrf = "";
const endpoint = new URL("../api/index.php", import.meta.url);

export async function request(action, { method = "GET", body, signal } = {}) {
  if (
    typeof location !== "undefined" &&
    location.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
  ) {
    throw new ApiError("Ouvre Ancrage en HTTPS pour accéder à ton compte.");
  }
  const url = new URL(endpoint);
  url.searchParams.set("action", action);
  let response;
  try {
    response = await fetch(url, {
      method,
      signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(method !== "GET"
          ? { "Content-Type": "application/json", "X-CSRF-Token": csrf }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(
      "Connexion interrompue. Tes modifications en attente restent dans cette page.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      "Le serveur ne répond pas au format attendu. Vérifie la configuration PHP.",
      response.status,
    );
  }
  if (!response.ok)
    throw new ApiError(
      result.error || "Cette action n’a pas abouti.",
      response.status,
    );
  if (typeof result.csrf === "string") csrf = result.csrf;
  return result;
}
