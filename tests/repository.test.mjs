import test from "node:test";
import assert from "node:assert/strict";
import {
  NotebookRepository,
  LOCAL_KEY,
} from "../public/ancrage/modules/repository.mjs";
import { migrateData, validateBackup } from "../public/ancrage/core.mjs";
import { ApiError } from "../public/ancrage/modules/api.mjs";
import { escapeHtml } from "../public/ancrage/modules/dom.mjs";

const initial = () =>
  migrateData({
    version: 1,
    profile: { displayName: "Test", symbol: "🌿", welcomeText: "Bonjour" },
    tags: [],
    entries: [],
  });
const changed = (name) => ({
  ...initial(),
  profile: { ...initial().profile, displayName: name },
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, ko) => {
    resolve = ok;
    reject = ko;
  });
  return { promise, resolve, reject };
};

test("le mode local conserve la clé historique et n’appelle pas le serveur", () => {
  const saved = new Map();
  const repo = new NotebookRepository({
    mode: "local",
    notebook: initial(),
    storage: { setItem: (key, value) => saved.set(key, value) },
    send: () => assert.fail("appel réseau interdit"),
  });
  repo.save(changed("Local"));
  assert.equal(JSON.parse(saved.get(LOCAL_KEY)).profile.displayName, "Local");
  assert.equal(repo.hasPending, false);
});

test("les changements pendant un envoi sont sérialisés avec la nouvelle révision", async () => {
  const first = deferred();
  const calls = [];
  const repo = new NotebookRepository({
    mode: "cloud",
    notebook: initial(),
    delay: 60000,
    revision: 8,
    send: async (action, request) => {
      calls.push(structuredClone(request.body));
      if (calls.length === 1) return first.promise;
      return { revision: request.body.revision + 1 };
    },
  });
  repo.save(changed("Premier"));
  const saving = repo.flush();
  repo.save(changed("Deuxième"));
  first.resolve({ revision: 9 });
  await saving;
  clearTimeout(repo.timer);
  assert.deepEqual(
    calls.map((call) => [call.revision, call.notebook.profile.displayName]),
    [
      [8, "Premier"],
      [9, "Deuxième"],
    ],
  );
  assert.equal(repo.revision, 10);
  assert.equal(repo.hasPending, false);
});

test("une panne garde la copie en attente et permet une reprise", async () => {
  let failed = true;
  const repo = new NotebookRepository({
    mode: "cloud",
    notebook: initial(),
    delay: 60000,
    send: async () => {
      if (failed) throw new ApiError("Réseau indisponible");
      return { revision: 1 };
    },
  });
  repo.save(changed("À conserver"));
  await repo.flush();
  assert.equal(repo.hasPending, true);
  assert.equal(repo.status, "error");
  assert.equal(repo.snapshot.profile.displayName, "À conserver");
  failed = false;
  await repo.retry();
  assert.equal(repo.hasPending, false);
});

for (const status of [409, 401, 403]) {
  test(`l’erreur ${status} bloque les nouvelles écritures automatiques`, async () => {
    let calls = 0;
    const repo = new NotebookRepository({
      mode: "cloud",
      notebook: initial(),
      delay: 60000,
      send: async () => {
        calls++;
        throw new ApiError("Conflit ou session expirée", status);
      },
    });
    repo.save(changed("Copie A"));
    await repo.flush();
    repo.save(changed("Copie B"));
    await repo.retry();
    assert.equal(calls, 1);
    assert.equal(repo.hasPending, true);
    assert.equal(repo.snapshot.profile.displayName, "Copie B");
  });
}

test("un carnet trop gros ne remplace pas la copie en mémoire", () => {
  const repo = new NotebookRepository({
    mode: "cloud",
    notebook: initial(),
    delay: 60000,
  });
  const oversized = initial();
  oversized.profile.welcomeText = "x".repeat(5 * 1024 * 1024);
  assert.throws(() => repo.save(oversized));
  assert.equal(repo.hasPending, false);
  assert.equal(repo.snapshot.profile.welcomeText, "Bonjour");
});

test("une confirmation incohérente ne marque pas les modifications comme enregistrées", async () => {
  const repo = new NotebookRepository({
    mode: "cloud",
    notebook: initial(),
    delay: 60000,
    send: async () => ({ revision: 99 }),
  });
  repo.save(changed("À conserver"));
  await repo.flush();
  assert.equal(repo.hasPending, true);
  assert.equal(repo.revision, 0);
});

test("un ancien export reste importable et n’est pas modifié par la migration", () => {
  const old = {
    version: 1,
    profile: { displayName: "Ancien", symbol: "🌿", welcomeText: "Bonjour" },
    tags: [{ id: "tag-0", name: "Repos", hidden: false, favorite: false }],
    entries: [
      { date: "2026-08-01", score: 4, tags: ["tag-0"], note: "Une journée" },
    ],
  };
  const copy = structuredClone(old);
  const migrated = migrateData(validateBackup(old));
  assert.equal(migrated.entries[0].note, "Une journée");
  assert.ok(migrated.reflection);
  assert.deepEqual(old, copy);
});

test("les données interpolées dans le HTML sont échappées", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});
