Threat Poller

Threat Poller is a backend service that keeps an eye on a list of GitHub repos. It is for the owner of the Threat Dash page.

It checks each watched repo on a schedule and sorts them into categories such as critical, high, dormant, and activity. When something worth flagging shows up, it saves an alert to a Postgres database. A small read API returns the latest hundred alerts so a dashboard can show them.

This app is checked every morning by Control Troll.

Latest change. 2026-11-04, v2026.11.04. Added routes for the watchlist, the catalog and site checks, with a schema file for the new tables.

See CHANGELOG.md for the full history.
