"""Tests HTTP de l'API, sur une base SQLite jetable, sans navigateur ni données réelles.
Usage : ANCRAGE_PHP_BIN=php python3 tests/backend_test.py
"""
from pathlib import Path
from http.cookiejar import CookieJar
from urllib.request import build_opener, HTTPCookieProcessor, Request
from urllib.error import HTTPError, URLError
import base64, json, os, secrets, shutil, socket, sqlite3, subprocess, tempfile, time

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get('ANCRAGE_PHP_BIN', 'php')
PASSPHRASE = 'Une phrase longue de test 2026!'
checks = []

def check(condition, message):
    assert condition, message
    checks.append(message)

class Client:
    def __init__(self, base):
        self.base = base
        self.opener = build_opener(HTTPCookieProcessor(CookieJar()))
        self.csrf = ''
    def call(self, action, method='GET', body=None, origin=None, csrf=None):
        headers = {'Origin': origin or self.base, 'Accept': 'application/json'}
        if method != 'GET':
            headers.update({'Content-Type': 'application/json', 'X-CSRF-Token': self.csrf if csrf is None else csrf})
        req = Request(self.base + '/ancrage/api/index.php?action=' + action, data=json.dumps(body).encode() if body is not None else None, method=method, headers=headers)
        try:
            response = self.opener.open(req, timeout=10)
        except HTTPError as error:
            response = error
        data = json.loads(response.read())
        if 'csrf' in data:
            self.csrf = data['csrf']
        return response.code, data, response.headers

with tempfile.TemporaryDirectory(prefix='ancrage-tests-') as temporary:
    temp = Path(temporary)
    private = temp / 'private'
    shutil.copytree(ROOT / 'ancrage-private', private)
    database = temp / 'test.sqlite'
    db = sqlite3.connect(database)
    db.executescript((ROOT / 'database/schema.test.sql').read_text())
    key = base64.b64encode(secrets.token_bytes(32)).decode()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    config = {'dsn': f'sqlite:{database}', 'db_user': '', 'db_password': '', 'encryption_key': key, 'origin': base, 'base_path': '/ancrage', 'owner_name': 'Tests', 'privacy_contact': 'tests@example.test', 'inactive_days': 730, 'backup_retention_days': 30, 'session_idle_seconds': 1800, 'session_max_seconds': 43200, 'allow_local_http': True, 'timezone': 'Europe/Paris'}
    encoded = base64.b64encode(json.dumps(config).encode()).decode()
    (private / 'config.php').write_text(f"<?php return json_decode(base64_decode('{encoded}'), true);")
    environment = dict(os.environ, ANCRAGE_PRIVATE_DIR=str(private))
    with open(temp / 'server.log', 'w') as log:
        server = subprocess.Popen([PHP, '-d', 'session.save_path=' + str(temp), '-S', f'127.0.0.1:{port}', '-t', str(ROOT / 'public')], env=environment, stdout=log, stderr=log)
        try:
            a, b, other_device = Client(base), Client(base), Client(base)
            for attempt in range(50):
                try:
                    status, session, headers = a.call('session')
                    break
                except URLError:
                    time.sleep(.05)
            else:
                raise AssertionError('Serveur de test indisponible')

            check(status == 200 and session['user'] is None, 'session anonyme et jeton CSRF disponibles')
            cookie = headers.get('Set-Cookie', '')
            check('HttpOnly' in cookie and 'SameSite=Strict' in cookie, 'cookie HttpOnly et SameSite Strict')
            check(headers['Cache-Control'] == 'no-store, private', 'les réponses privées ne sont pas mises en cache')
            check(a.call('notebook')[0] == 401, 'le carnet exige une authentification')

            body = {'email': 'Alice@Example.Test', 'password': PASSPHRASE, 'consent': True, 'adult': True, 'policyVersion': session['policy']['version']}
            check(a.call('register', 'POST', body, origin='https://evil.example')[0] == 403, 'refus des requêtes provenant d’un autre site')
            check(a.call('register', 'POST', body, csrf='invalid')[0] == 403, 'refus des jetons CSRF invalides')
            check(a.call('register', 'POST', {**body, 'email': 'pas-un-email'})[0] == 422, 'adresse e-mail invalide refusée')
            check(a.call('register', 'POST', {**body, 'consent': False})[0] == 422, 'consentement explicite requis')

            status, alice, _ = a.call('register', 'POST', body)
            check(status == 200 and alice['user']['email'] == 'alice@example.test', 'création du compte par e-mail avec normalisation')
            alice_id = alice['user']['id']
            notebook = alice['notebook']

            b.call('session')
            check(b.call('register', 'POST', {**body, 'email': 'alice@example.test'})[0] == 409, 'une adresse e-mail ne peut avoir qu’un compte')
            body_b = {**body, 'email': 'bob@example.test'}
            status, bob, _ = b.call('register', 'POST', body_b)
            check(status == 200, 'second compte indépendant créé')

            notebook['entries'].append({'date': '2026-08-01', 'score': 4, 'tags': ['tag-0'], 'note': 'Une note privée de test'})
            status, saved, _ = a.call('notebook', 'PUT', {'notebook': notebook, 'revision': 0})
            check(status == 200 and saved['revision'] == 1, 'enregistrement du carnet et progression de révision')
            payload = db.execute('SELECT payload FROM notebooks WHERE user_id=?', (alice_id,)).fetchone()[0]
            check('Une note privée' not in payload, 'le contenu de la base est chiffré')
            check(a.call('notebook', 'PUT', {'notebook': notebook, 'revision': 0})[0] == 409, 'une ancienne révision ne peut pas écraser le carnet')

            other_device.call('session')
            status, second_login, _ = other_device.call('login', 'POST', {'email': 'alice@example.test', 'password': PASSPHRASE})
            check(status == 200 and second_login['notebook']['entries'][0]['note'] == 'Une note privée de test', 'connexion sur un autre appareil et récupération du carnet')

            invalid = json.loads(json.dumps(notebook)); invalid['profile']['photo'] = 'data:image/svg+xml;base64,PHN2Zz4='
            check(a.call('notebook', 'PUT', {'notebook': invalid, 'revision': 1})[0] == 422, 'rejet des données non conformes au schéma')
            invalid = json.loads(json.dumps(notebook)); invalid['__proto__'] = {'polluted': True}
            check(a.call('notebook', 'PUT', {'notebook': invalid, 'revision': 1})[0] == 422, 'rejet des propriétés inattendues')
            check(b.call('notebook')[1]['notebook']['entries'] == [], 'les écritures d’Alice ne modifient pas Bob')

            bob_id = bob['user']['id']
            bob_payload = db.execute('SELECT payload FROM notebooks WHERE user_id=?', (bob_id,)).fetchone()[0]
            db.execute('UPDATE notebooks SET payload=? WHERE user_id=?', (payload, bob_id)); db.commit()
            check(b.call('notebook')[0] == 503, 'le chiffrement lie chaque carnet à son compte')
            db.execute('UPDATE notebooks SET payload=? WHERE user_id=?', (bob_payload, bob_id)); db.commit()

            status, exported, _ = a.call('export')
            check(status == 200 and exported['account']['email'] == 'alice@example.test' and 'password_hash' not in exported['account'], 'export des données du compte sans secrets d’authentification')

            new_password = PASSPHRASE + ' autre'
            status, changed, _ = a.call('password', 'POST', {'currentPassword': PASSPHRASE, 'newPassword': new_password})
            check(status == 200 and 'recoveryCode' not in changed, 'changement du mot de passe sans code de récupération')
            check(other_device.call('notebook')[0] == 401, 'les autres sessions sont invalidées après changement du mot de passe')

            fresh = Client(base); fresh.call('session')
            check(fresh.call('login', 'POST', {'email': 'alice@example.test', 'password': PASSPHRASE})[0] == 401, 'ancien mot de passe refusé')
            status, fresh_login, _ = fresh.call('login', 'POST', {'email': 'alice@example.test', 'password': new_password})
            check(status == 200 and fresh_login['notebook']['entries'][0]['score'] == 4, 'nouveau mot de passe accepté sans perdre le carnet')

            check(fresh.call('account', 'DELETE', {'password': new_password, 'confirm': True})[0] == 200, 'suppression explicite du compte')
            check(db.execute('SELECT COUNT(*) FROM notebooks WHERE user_id=?', (alice_id,)).fetchone()[0] == 0, 'le carnet est supprimé avec le compte')
            check(fresh.call('notebook')[0] == 401, 'aucun accès après suppression')

            for i in range(11):
                limited, _, _ = other_device.call('login', 'POST', {'email': 'inexistant@example.test', 'password': PASSPHRASE})
            check(limited == 429, 'limitation des tentatives de connexion')

            config['allow_local_http'] = False
            encoded = base64.b64encode(json.dumps(config).encode()).decode()
            (private / 'config.php').write_text(f"<?php return json_decode(base64_decode('{encoded}'), true);")
            check(b.call('session')[0] == 426, 'le service refuse HTTP hors du mode de test explicite')

            print(json.dumps({'passed': len(checks), 'checks': checks}, ensure_ascii=False, indent=2))
        except Exception:
            log.flush()
            print((temp / 'server.log').read_text())
            raise
        finally:
            server.terminate()
            server.wait(timeout=5)
