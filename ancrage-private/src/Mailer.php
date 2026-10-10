<?php
declare(strict_types=1);

namespace Ancrage;

final class Mailer
{
    public static function sendPasswordReset(
        array $config,
        string $recipient,
        string $resetUrl,
        int $expiresAt
    ): bool {
        $from = $config['mail_from'] ?? $config['privacy_contact'] ?? '';
        if (!is_string($from) || filter_var($from, FILTER_VALIDATE_EMAIL) === false) {
            throw new \RuntimeException('Adresse d’expédition non configurée.');
        }

        $replyTo = $config['privacy_contact'] ?? $from;
        if (!is_string($replyTo) || filter_var($replyTo, FILTER_VALIDATE_EMAIL) === false) {
            $replyTo = $from;
        }

        $name = $config['mail_from_name'] ?? 'Ancrage';
        if (!is_string($name) || $name === '') {
            $name = 'Ancrage';
        }
        $name = preg_replace('/[\r\n]+/', ' ', $name) ?: 'Ancrage';

        $minutes = max(1, (int) ceil(($expiresAt - time()) / 60));

        $subject = 'Ancrage - reinitialisation du mot de passe';
        $body = implode("\r\n", [
            'Bonjour,',
            '',
            'Une demande de réinitialisation du mot de passe de ton compte Ancrage a été effectuée.',
            '',
            'Pour choisir un nouveau mot de passe, ouvre ce lien :',
            $resetUrl,
            '',
            'Ce lien est valable environ ' . $minutes . ' minutes et ne peut être utilisé qu’une seule fois.',
            '',
            'Si tu n’es pas à l’origine de cette demande, tu peux ignorer cet e-mail. Ton mot de passe actuel reste inchangé.',
            '',
            'Ancrage',
        ]);

        $headers = implode("\r\n", [
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'From: ' . $name . ' <' . $from . '>',
            'Reply-To: ' . $replyTo,
            'Auto-Submitted: auto-generated',
            'X-Auto-Response-Suppress: All',
        ]);

        return mail($recipient, $subject, $body, $headers);
    }
}
