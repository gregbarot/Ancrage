import { migrateData, validateBackup } from "../core.mjs";
import { request } from "./api.mjs";

export const LOCAL_KEY = "ancrage-v1";
export const MAX_NOTEBOOK_BYTES = 4 * 1024 * 1024;

/**
 * Deux stockages explicites. En mode compte, aucun carnet n’est écrit dans localStorage.
 * Les envois sont sérialisés et utilisent une révision, pour empêcher les écrasements.
 */
export class NotebookRepository {
  constructor({
    mode,
    notebook,
    revision = 0,
    send = request,
    storage = null,
    delay = 400,
  }) {
    this.mode = mode;
    this.snapshot = migrateData(validateBackup(notebook));
    this.revision = revision;
    this.send = send;
    this.storage = storage;
    this.delay = delay;
    this.generation = 0;
    this.savedGeneration = 0;
    this.inFlight = null;
    this.timer = null;
    this.status = mode === "cloud" ? "saved" : "local";
    this.error = null;
    this.onStatus = () => {};
  }

  get hasPending() {
    return this.mode === "cloud" && this.generation !== this.savedGeneration;
  }
  get blocked() {
    return (
      this.error?.status === 409 ||
      this.error?.status === 401 ||
      this.error?.status === 403
    );
  }

  notify(status, error = null) {
    this.status = status;
    this.error = error;
    this.onStatus({ status, error, pending: this.hasPending });
  }

  save(notebook) {
    const next = migrateData(validateBackup(notebook));
    const serialized = JSON.stringify(next);
    if (new TextEncoder().encode(serialized).byteLength > MAX_NOTEBOOK_BYTES) {
      throw new Error(
        "Le carnet dépasse 4 Mo. Exporte-le avant de retirer des données ou une photo.",
      );
    }
    if (this.mode === "local") {
      this.storage.setItem(LOCAL_KEY, serialized);
      this.snapshot = next;
      this.notify("local");
      return;
    }
    this.snapshot = next;
    this.generation += 1;
    if (this.blocked) {
      this.onStatus({ status: this.status, error: this.error, pending: true });
      return;
    }
    this.notify("pending");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.delay);
  }

  async flush() {
    clearTimeout(this.timer);
    if (this.mode !== "cloud" || !this.hasPending || this.blocked) return;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.drain();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  async drain() {
    while (this.hasPending && !this.blocked) {
      const generation = this.generation;
      const snapshot = structuredClone(this.snapshot);
      this.notify("sending");
      try {
        const result = await this.send("notebook", {
          method: "PUT",
          body: { notebook: snapshot, revision: this.revision },
        });
        if (
          !Number.isInteger(result.revision) ||
          result.revision !== this.revision + 1
        ) {
          throw new Error(
            "La confirmation du serveur est invalide. Exporte ta copie avant de recharger.",
          );
        }
        this.revision = result.revision;
        this.savedGeneration = generation;
      } catch (error) {
        this.notify("error", error);
        return;
      }
    }
    this.notify("saved");
  }

  async retry() {
    if (this.blocked) return;
    this.notify("pending");
    await this.flush();
  }
}
