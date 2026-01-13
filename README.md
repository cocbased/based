# Clash of Clans Web App

## Data Branch Deployment Checklist (Raspberry Pi)

After merging to `main`:

1. Pull latest site code:
   ```bash
   git pull origin main
   ```
2. Ensure the data push script is executable:
   ```bash
   chmod +x scripts/push_data_updates.sh
   ```
3. Update your cron/systemd job to run in order:
   1) your JSON generation step
   2) `scripts/push_data_updates.sh`
4. Verify raw data URLs are live (example):
   ```bash
   curl -I https://raw.githubusercontent.com/cocbased/based/data/war.json
   ```
5. Verify the site is fetching from the data branch:
   - In the browser Network tab, confirm requests go to `raw.githubusercontent.com/.../data/...`.
6. Verify GitHub Pages does **not** redeploy on JSON updates:
   - Confirm Pages/Actions only run on `main` changes.
