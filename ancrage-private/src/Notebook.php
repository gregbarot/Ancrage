<?php
declare(strict_types=1);

namespace Ancrage;

use InvalidArgumentException;

/** Validation indépendante du navigateur, avant chaque écriture. */
final class Notebook
{
    public const MAX_BYTES = 4 * 1024 * 1024;

    public static function initial(string $name): array
    {
        $tags = [];
        foreach (['Migraine', 'Douleur dos', 'Insomnie', 'Fond anxieux', 'Crise d’angoisse', 'Déréalisation'] as $i => $nameTag) {
            $tags[] = ['id' => 'tag-' . $i, 'name' => $nameTag, 'category' => 'feeling', 'hidden' => false, 'favorite' => false];
        }
        foreach (['Sport', 'Méditation', 'Promenade', 'Création'] as $i => $nameTag) {
            $tags[] = ['id' => 'activity-' . $i, 'name' => $nameTag, 'category' => 'activity', 'hidden' => false, 'favorite' => false];
        }
        return [
            'version' => 1,
            'profile' => ['displayName' => $name, 'symbol' => '🌿', 'welcomeText' => 'Comment s’est passée ta journée ?'],
            'tags' => $tags, 'entries' => [], 'activityTagsInitialized' => true,
            'reflection' => ['records' => [], 'worries' => [], 'anchors' => [], 'worryTime' => ''],
        ];
    }

    private static function fail(): never
    {
        throw new InvalidArgumentException('Le carnet contient des données invalides ou trop volumineuses.');
    }

    private static function text(mixed $value, int $max, bool $required = false): void
    {
        if (!is_string($value) || mb_strlen($value) > $max || ($required && trim($value) === '')) {
            self::fail();
        }
    }

    private static function date(mixed $value): void
    {
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) {
            self::fail();
        }
        [$year, $month, $day] = array_map('intval', explode('-', $value));
        if ($year < 1900 || !checkdate($month, $day, $year)) {
            self::fail();
        }
    }

    private static function id(mixed $value): void
    {
        if (!is_string($value) || !preg_match('/^[a-zA-Z0-9_-]{1,80}$/D', $value)) {
            self::fail();
        }
    }

    private static function keys(array $object, array $allowed): void
    {
        if (array_diff(array_keys($object), $allowed)) {
            self::fail();
        }
    }

    private static function list(mixed $value, int $max): void
    {
        if (!is_array($value) || !array_is_list($value) || count($value) > $max) {
            self::fail();
        }
    }

    public static function validate(mixed $data): array
    {
        if (!is_array($data) || ($data['version'] ?? null) !== 1) {
            self::fail();
        }
        self::keys($data, ['version', 'profile', 'tags', 'entries', 'activityTagsInitialized', 'reflection']);
        if (isset($data['activityTagsInitialized']) && !is_bool($data['activityTagsInitialized'])) {
            self::fail();
        }
        $profile = $data['profile'] ?? null;
        if (!is_array($profile)) {
            self::fail();
        }
        self::keys($profile, ['displayName', 'symbol', 'welcomeText', 'photo']);
        self::text($profile['displayName'] ?? null, 50, true);
        self::text($profile['symbol'] ?? null, 16, true);
        self::text($profile['welcomeText'] ?? null, 200, true);
        if (isset($profile['photo'])) {
            $photo = $profile['photo'];
            if (!is_string($photo) || strlen($photo) > 600000 || ($photo !== '' && !preg_match('~^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$~D', $photo))) {
                self::fail();
            }
        }
        self::list($data['tags'] ?? null, 1000);
        $tagIds = [];
        foreach ($data['tags'] as $tag) {
            if (!is_array($tag)) { self::fail(); }
            self::keys($tag, ['id', 'name', 'category', 'hidden', 'favorite']);
            self::id($tag['id'] ?? null);
            self::text($tag['name'] ?? null, 70, true);
            if (isset($tagIds[$tag['id']]) || !in_array($tag['category'] ?? 'feeling', ['feeling', 'activity'], true)) { self::fail(); }
            foreach (['hidden', 'favorite'] as $key) {
                if (isset($tag[$key]) && !is_bool($tag[$key])) { self::fail(); }
            }
            $tagIds[$tag['id']] = true;
        }
        self::list($data['entries'] ?? null, 50000);
        $dates = [];
        foreach ($data['entries'] as $entry) {
            if (!is_array($entry)) { self::fail(); }
            self::keys($entry, ['date', 'score', 'tags', 'note', 'createdAt', 'updatedAt']);
            self::date($entry['date'] ?? null);
            if (isset($dates[$entry['date']]) || !is_int($entry['score'] ?? null) || $entry['score'] < 1 || $entry['score'] > 5) { self::fail(); }
            $dates[$entry['date']] = true;
            self::text($entry['note'] ?? null, 50000);
            self::list($entry['tags'] ?? null, 1000);
            $used = [];
            foreach ($entry['tags'] as $id) {
                self::id($id);
                if (!isset($tagIds[$id]) || isset($used[$id])) { self::fail(); }
                $used[$id] = true;
            }
            foreach (['createdAt', 'updatedAt'] as $key) {
                if (isset($entry[$key])) { self::text($entry[$key], 40); }
            }
        }
        $reflection = $data['reflection'] ?? ['records' => [], 'worries' => [], 'anchors' => [], 'worryTime' => ''];
        if (!is_array($reflection)) { self::fail(); }
        self::keys($reflection, ['records', 'worries', 'anchors', 'worryTime']);
        $time = $reflection['worryTime'] ?? null;
        if (!is_string($time) || ($time !== '' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/D', $time))) { self::fail(); }
        $ids = [];
        $recordFields = ['situation', 'theme', 'thought', 'emotion', 'body', 'behavior', 'support', 'against', 'alternative', 'balanced', 'action', 'learned', 'fear', 'control', 'outside', 'friend', 'reality', 'coping'];
        foreach (['records', 'worries', 'anchors'] as $kind) {
            self::list($reflection[$kind] ?? null, 50000);
            foreach ($reflection[$kind] as $item) {
                if (!is_array($item)) { self::fail(); }
                self::id($item['id'] ?? null);
                self::date($item['date'] ?? null);
                if (isset($ids[$item['id']])) { self::fail(); }
                $ids[$item['id']] = true;
                foreach (['createdAt', 'updatedAt'] as $key) {
                    if (isset($item[$key])) { self::text($item[$key], 40); }
                }
                $common = ['id', 'date', 'createdAt', 'updatedAt'];
                if ($kind === 'records') {
                    self::keys($item, array_merge($common, $recordFields, ['step', 'completed', 'habits', 'outcome', 'before', 'after', 'probability']));
                    if (!is_int($item['step'] ?? null) || $item['step'] < 0 || $item['step'] > 5 || !is_bool($item['completed'] ?? null) || !in_array($item['outcome'] ?? null, ['unknown', 'no', 'partial', 'yes'], true)) { self::fail(); }
                    self::list($item['habits'] ?? null, 6);
                    foreach ($item['habits'] as $habit) {
                        if (!in_array($habit, ['worst', 'binary', 'mind', 'always', 'emotion', 'certainty'], true)) { self::fail(); }
                    }
                    foreach ($recordFields as $key) { if (isset($item[$key])) { self::text($item[$key], 50000); } }
                    foreach (['before' => 10, 'after' => 10, 'probability' => 100] as $key => $max) {
                        if (isset($item[$key]) && (!is_string($item[$key]) || ($item[$key] !== '' && (!ctype_digit($item[$key]) || (int) $item[$key] > $max)))) { self::fail(); }
                    }
                } elseif ($kind === 'worries') {
                    self::keys($item, array_merge($common, ['text', 'kind', 'action', 'redirect', 'reviewDate', 'archived']));
                    self::text($item['text'] ?? null, 50000);
                    if (!in_array($item['kind'] ?? null, ['unknown', 'action', 'anticipation'], true) || !is_bool($item['archived'] ?? null)) { self::fail(); }
                    foreach (['action', 'redirect'] as $key) { if (isset($item[$key])) { self::text($item[$key], 50000); } }
                    if (($item['reviewDate'] ?? '') !== '') { self::date($item['reviewDate']); }
                } else {
                    self::keys($item, array_merge($common, ['text', 'sourceId']));
                    self::text($item['text'] ?? null, 50000);
                    if (isset($item['sourceId'])) { self::text($item['sourceId'], 80); }
                }
            }
        }
        $data['reflection'] = $reflection;
        if (strlen(json_encode($data, JSON_THROW_ON_ERROR)) > self::MAX_BYTES) { self::fail(); }
        return $data;
    }
}
