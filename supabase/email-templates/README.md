# Gabarits courriel d'authentification — PorteàPorte (français québécois)

Ces gabarits remplacent les modèles par défaut (en anglais) de Supabase Auth.

## Où les coller

Supabase → **Authentication** → **Emails** → onglet de chaque type :

| Fichier | Type Supabase | Objet (Subject) |
|---|---|---|
| `confirm-signup.html` | Confirm signup | Confirme ton inscription à PorteàPorte |
| `reset-password.html` | Reset password | Réinitialisation de ton mot de passe |
| `magic-link.html` | Magic Link | Ton lien de connexion PorteàPorte |
| `change-email.html` | Change Email Address | Confirme ta nouvelle adresse courriel |
| `invite.html` | Invite user | Tu es invité à PorteàPorte |
| `reauthentication.html` | Reauthentication | Ton code de vérification PorteàPorte |

Pour chaque type : copier le HTML dans **Message body**, et l'objet dans **Subject**.

## Variables Supabase (ne pas modifier)
- `{{ .ConfirmationURL }}` : lien d'action sécurisé
- `{{ .Token }}` : code OTP (réauthentification)
- `{{ .SiteURL }}` : URL du site
- `{{ .Email }}` : adresse du destinataire

## Notes
- Français québécois, ton chaleureux et clair.
- Aucune promesse non prouvée, aucune mention « assurance ».
- Expéditeur : `noreply@porteaporte.site` (Resend).
