# Règles métier — Sauvegarde et restauration de la base de données

## Contexte

Cette feature permet à l'utilisateur d'exporter la base de données locale vers un fichier
compressé, et de restaurer une base depuis un fichier exporté précédemment. Elle répond à un
besoin de sécurité (sauvegarde avant une opération risquée), de migration (changement de
machine), et de récupération après incident.

La base de données est SQLite, stockée dans le répertoire local de l'application. La
compression utilise le format gzip (`.db.gz`).

---

## Règles frontend

**R1 — Page dédiée** : La feature est accessible depuis une entrée « Maintenance » dans le
tiroir de navigation, séparée du reste de la navigation par un diviseur.

**R2 — Export : sélection du fichier de destination** : L'utilisateur déclenche l'export via
un bouton dédié. Un dialog natif de sélection de fichier s'ouvre (type `save`), pré-filtré
sur les fichiers `.db.gz`, avec un nom par défaut au format `backup_YYYYMMDD_HHMMSS.db.gz`
(ex. `backup_20260323_143022.db.gz`). Ce nom est modifiable par l'utilisateur avant
confirmation. L'export ne démarre qu'après confirmation de la destination.

**R3 — Export : feedback utilisateur** : Pendant l'export, le bouton est en état de
chargement. En cas de succès, un toast de succès est affiché. En cas d'erreur, un toast
d'erreur est affiché avec le message retourné par le backend.

**R4 — Import : sélection du fichier source** : L'utilisateur déclenche l'import via un
bouton dédié. Un dialog natif de sélection de fichier s'ouvre (type `open`), pré-filtré
sur les fichiers `.db.gz`.

**R5 — Import : confirmation obligatoire** : Avant tout import, une boîte de dialogue de
confirmation explicite est affichée, indiquant que les données actuelles seront
**définitivement remplacées** par celles du fichier sélectionné, et que l'application va
redémarrer. L'import ne procède qu'après confirmation explicite de l'utilisateur.

**R6 — Import : relaunch automatique** : Après un import réussi, l'application redémarre
automatiquement. Un toast de succès est affiché brièvement avant le redémarrage.

---

## Règles backend

**R7 — Format du fichier de sauvegarde** : Le fichier exporté est une base de données
SQLite compressée en gzip. Extension attendue : `.db.gz`.

**R8 — Export : copie cohérente** : L'export produit une copie propre et cohérente de la
base de données en cours d'utilisation, sans interrompre les connexions actives.

**R9 — Import : validation** : À l'import, le fichier est décompressé et sa validité est
vérifiée avant toute modification de la base active. Si la vérification échoue, l'import
est annulé et une erreur est retournée.

**R10 — Import : remplacement différé** : Le fichier importé n'écrase pas directement la
base active — il est mis en attente. Le remplacement effectif a lieu au prochain démarrage
de l'application, avant l'ouverture de la base de données.

**R11 — Nettoyage des fichiers temporaires** : Tout fichier temporaire créé pendant un
export ou un import est systématiquement supprimé à la fin de l'opération, qu'elle
réussisse ou échoue.

**R12 — Pas d'historisation automatique** : La feature n'implémente pas de rotation
automatique des sauvegardes. Chaque export produit un fichier unique à l'emplacement
choisi par l'utilisateur. La gestion de l'historique est à la charge de l'utilisateur.

---

## Contraintes et limitations

- **Compatibilité des versions** : Un fichier de sauvegarde peut être importé sur une
  version différente de l'application. Si la sauvegarde est d'une version antérieure, les
  migrations manquantes sont appliquées automatiquement au démarrage. Une sauvegarde d'une
  version **plus récente** importée sur une version plus ancienne peut provoquer des erreurs
  — ce cas n'est pas géré.

- **Pas de chiffrement** : Le fichier `.db.gz` n'est pas chiffré. Il contient toutes les
  données en clair. L'utilisateur est responsable de la sécurité du fichier exporté.

- **Redémarrage requis après import** : L'application doit redémarrer pour que le fichier
  importé soit pris en compte. Ce comportement est documenté dans l'interface utilisateur.
