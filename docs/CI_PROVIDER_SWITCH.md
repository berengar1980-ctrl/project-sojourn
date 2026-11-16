# CI-Anbieter wechseln – ohne erneute Einrichtung

Ab 16. November 2026 ist **GitHub Actions** das aktive Quality-Gate, da das
CircleCI-Monatsbudget ausgeschöpft ist. Die CircleCI-Konfiguration bleibt
vollständig erhalten. Zugangsdaten und der CircleCI-Projektanschluss werden
weder geändert noch gelöscht.

## Aktuelles Verhalten

- GitHub Actions: `.github/workflows/quality-gate.yml`, Job
  `quality-gate`, aktiv für Pull Requests und Pushes nach `main`.
- CircleCI: `.circleci/config.yml` bleibt bestehen; das
  `quality`-Workflow ist vorübergehend über den Pipeline-Parameter
  `quality_gate_enabled` mit `default: false` deaktiviert.
- Beide Anbieter prüfen Prettier, ESLint, TypeScript, Dependencies,
  Persistence, sämtliche Projekttests, die 90/180/365-Tage-Wirtschaftssimulation
  und den Produktionsbuild.

## Am 5. Dezember zurück zu CircleCI

Im Repository ausführen:

```bash
node scripts/switch-ci-provider.cjs circleci
git add .circleci/config.yml .github/workflows/quality-gate.yml
git commit -m "Switch Sojourn CI back to CircleCI"
git push
```

Der Befehl ändert nur die beiden CI-Konfigurationsdateien. GitHub Actions
bleibt als deaktivierter Workflow gespeichert; CircleCI wird wieder aktiviert.
**Keine Tokens, Webhooks oder API-Keys neu anlegen.**

Für eine erneute Umstellung auf GitHub Actions:

```bash
node scripts/switch-ci-provider.cjs github
git add .circleci/config.yml .github/workflows/quality-gate.yml
git commit -m "Switch Sojourn CI to GitHub Actions"
git push
```

Die Umschaltung ist wiederholbar und wird durch
`tests/quality/ci-provider-switch.test.cjs` geprüft. Der Nutzer kann die
Umstellung auch im Chat beauftragen.

## Branchschutz und bestehende CI-Ergebnisse

Wenn eine GitHub-Branch-Protection-Regel oder ein Ruleset bisher den Check
`ci/circleci: quality-gate` als Pflichtcheck verlangt, muss ein Repository-
Administrator diese Regel vorübergehend durch den GitHub-Actions-Check
`quality-gate` ersetzen. Der Check-Name und die GitHub-Anwendung müssen
im Einstellungsdialog passend ausgewählt werden. Das kann nicht durch
Ändern der Workflow-Dateien umgangen werden. Beim Zurückwechseln dieselbe
Regel wieder umstellen.

Alte rote CircleCI-Checks am ursprünglichen Commit werden nicht nachträglich
grün. Maßgeblich sind die Checks am neuesten Pull-Request-Commit.

**Hinweis:** CircleCI kann auch ohne ausgeführte Jobs einen minimalen
Pipeline-Eintrag registrieren. Der Quality-Job selbst verbraucht während
`default: false` keine CircleCI-Compute-Minuten.
