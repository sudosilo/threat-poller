Threat Poller

Threat Poller is a backend service that keeps an eye on a list of GitHub repos. It is for the owner of the Threat Dash page.

It checks each watched repo on a schedule and sorts them into categories such as critical, high, dormant, and activity. When something worth flagging shows up, it saves an alert to a Postgres database. A small read API returns the latest hundred alerts so a dashboard can show them.

This app is checked every morning by Control Troll.

Latest change. Created the threat intel poller with three category rules for watched repos. Alerts now save to Postgres so they persist between runs. Added a read API that returns the latest alerts for the dashboard.

See CHANGELOG.md for the full history.
