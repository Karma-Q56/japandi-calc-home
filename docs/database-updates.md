# Updating the preview and live databases

The app expects the database to have every file in `db/migrations`. The "Update database"
button on GitHub applies the missing ones. It only runs when a person starts it.

## One time setup

The button appears after this work is merged into main.

1. In Neon, open the project, press Connect, choose the branch and the role `neondb_owner`,
   and copy the connection string.
   - Preview: the branch `preview/claude/fix-regressions`.
   - Live: the branch `production`.
2. In GitHub, open the repository, then Settings, Secrets and variables, Actions,
   New repository secret.
   - Name `PREVIEW_DATABASE_URL`, value: the preview connection string.
   - Name `PRODUCTION_DATABASE_URL`, value: the live connection string.

Paste these only into GitHub. Never put them in a chat, an email or a file.

## Every update

1. GitHub, Actions tab, "Update database", Run workflow.
2. Start with target `preview` and action `check`. It lists what is missing and changes nothing.
3. Run it again with action `apply`.
4. When preview works, do the same for `production`. For `apply`, type `PRODUCTION` in the
   confirm box.

Each change is made completely or not at all. If one fails, the earlier ones stay, the log
names what was applied, and running it again carries on from there. Neon keeps only a short
history, so ask for a check of the log before trying anything else after a failure.

The button refuses to run if a secret points at a different database from the one chosen.
If a preview database is replaced in Neon, update its name in `scripts/update-database.mjs`.
