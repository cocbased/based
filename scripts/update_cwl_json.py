#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone
import requests

# =========================
# CONFIG
# =========================
COC_API_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiIsImtpZCI6IjI4YTMxOGY3LTAwMDAtYTFlYi03ZmExLTJjNzQzM2M2Y2NhNSJ9.eyJpc3MiOiJzdXBlcmNlbGwiLCJhdWQiOiJzdXBlcmNlbGw6Z2FtZWFwaSIsImp0aSI6ImI1MzNjOWYxLTk3ZGUtNDA5Zi04ZWZjLWE2YTM4NTkwODRkNSIsImlhdCI6MTc2NTAzMjgzOSwic3ViIjoiZGV2ZWxvcGVyLzhjMTExZjU5LTIwZGYtNTM1Zi0wNzQxLTNlZTYyMWU0ZWFkZCIsInNjb3BlcyI6WyJjbGFzaCJdLCJsaW1pdHMiOlt7InRpZXIiOiJkZXZlbG9wZXIvc2lsdmVyIiwidHlwZSI6InRocm90dGxpbmcifSx7ImNpZHJzIjpbIjEwMC4xNC4yOC4xMjIiXSwidHlwZSI6ImNsaWVudCJ9XX0.6KVUkp7Nmb3BQ55TnbxwqmVlxszNxTX9PouyykRzx77k4FOWa5krGVGqj84b5BOKSg-Vtdb-pQm-Ltech6mBCg"
CLAN_TAG = "#2QQYJC08Y"
COC_API_BASE = "https://api.clashofclans.com/v1"

REPO_DIR = "/home/admin/based"
OUT_CURRENT = os.path.join(REPO_DIR, "cwl_current.json")
OUT_INDEX   = os.path.join(REPO_DIR, "cwl_index.json")
HISTORY_DIR = os.path.join(REPO_DIR, "cwl_history")
TABLES_DIR  = os.path.join(REPO_DIR, "cwl_tables")

# =========================
# HTTP helper
# =========================
def coc_get(path: str, params=None):
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {COC_API_TOKEN}",
    }
    url = COC_API_BASE + path.replace("#", "%23")
    r = requests.get(url, headers=headers, params=params, timeout=25)
    r.raise_for_status()
    return r.json()

def utc_now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

def safe_int(x, default=0):
    try:
        return int(x)
    except Exception:
        return default

def safe_float(x, default=0.0):
    try:
        return float(x)
    except Exception:
        return default

def ensure_dirs():
    os.makedirs(REPO_DIR, exist_ok=True)
    os.makedirs(HISTORY_DIR, exist_ok=True)
    os.makedirs(TABLES_DIR, exist_ok=True)

def save_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
    os.replace(tmp, path)

def save_json_pretty(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

def load_json(path, default):
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return default

def ensure_index_file_exists():
    if not os.path.exists(OUT_INDEX):
        save_json(OUT_INDEX, {"schemaVersion": 1, "seasons": [], "updatedAt": utc_now_iso()})

def month_name(mm: int) -> str:
    names = ["January","February","March","April","May","June","July","August","September","October","November","December"]
    return names[mm-1] if 1 <= mm <= 12 else "Unknown"

def season_to_key_and_title(season: str):
    if isinstance(season, str) and len(season) >= 7 and season[4] == "-":
        y = season[:4]
        m = safe_int(season[5:7], 0)
        key = season[:7]
        title = f"{y} {month_name(m)} CWL"
        return key, title
    now = datetime.now(timezone.utc)
    key = f"{now.year}-{str(now.month).zfill(2)}"
    title = f"{now.year} {month_name(now.month)} CWL"
    return key, title

def norm_tag(t: str) -> str:
    return (t or "").strip().upper()

def norm_name(n: str) -> str:
    return (n or "").strip()

# =========================
# CWL API
# =========================
def get_league_group():
    """Returns leaguegroup JSON, or None if not in CWL (404)."""
    try:
        return coc_get(f"/clans/{CLAN_TAG}/currentwar/leaguegroup")
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            return None
        raise

def get_league_name():
    try:
        clan = coc_get(f"/clans/{CLAN_TAG}")
        return ((clan.get("warLeague") or {}).get("name")) or "—"
    except Exception:
        return "—"

# =========================
# Correct war selection:
# one war per round that involves OUR clan
# =========================
def pick_our_war_for_round(round_obj):
    for wt in (round_obj.get("warTags") or []):
        if not wt or wt == "#0":
            continue
        w = coc_get(f"/clanwarleagues/wars/{wt}")
        ctag = (w.get("clan") or {}).get("tag")
        otag = (w.get("opponent") or {}).get("tag")
        if ctag == CLAN_TAG or otag == CLAN_TAG:
            return wt, w
    return None, None

def compute_winner(clan_stars, clan_destr, opp_stars, opp_destr):
    if clan_stars > opp_stars:
        return "clan"
    if opp_stars > clan_stars:
        return "opponent"
    if clan_destr > opp_destr:
        return "clan"
    if opp_destr > clan_destr:
        return "opponent"
    return "tie"

def is_real_cwl_attack(a: dict) -> bool:
    """
    CWL: 1 attack per player per war day.
    Count as "done" only if we have outcome fields.
    """
    if not a or not isinstance(a, dict):
        return False
    return (a.get("stars") is not None) or (a.get("destructionPercentage") is not None)

# =========================
# ClashNinja method:
# sort members by mapPosition, then use list index (1-based) as the REAL slot
# =========================
def build_actual_pos_and_member_by_tag(members_list):
    """
    Returns:
      actual_pos_by_tag: {TAG -> 1..N} (index in sorted list)
      member_by_tag:     {TAG -> member_obj}
    """
    rows = []
    for mm in (members_list or []):
        t = norm_tag(mm.get("tag"))
        if not t:
            continue
        mp = safe_int(mm.get("mapPosition"), 10**9)  # if missing, push to end
        nm = norm_name(mm.get("name")).lower()
        rows.append((mp, nm, t, mm))

    rows.sort(key=lambda x: (x[0], x[1]))  # mapPosition, then name

    actual_pos_by_tag = {}
    member_by_tag = {}
    for idx, (_, __, t, mm) in enumerate(rows, start=1):
        actual_pos_by_tag[t] = idx
        member_by_tag[t] = mm

    return actual_pos_by_tag, member_by_tag

# =========================
# Build payload
# =========================
def build_cwl_payload(group):
    season = group.get("season") or ""
    season_key, title = season_to_key_and_title(season)

    rounds = group.get("rounds") or []

    wars_by_round = []
    is_final = True

    # Optional metadata for UI
    wars_meta = []

    def get_sides(war_json):
        clan = war_json.get("clan") or {}
        opp  = war_json.get("opponent") or {}
        if clan.get("tag") == CLAN_TAG:
            return clan, opp
        return opp, clan

    season_team_size = 0

    for idx, r in enumerate(rounds, start=1):
        wt, w = pick_our_war_for_round(r)
        if not w:
            wars_by_round.append((idx, None, None))
            is_final = False
            continue

        wars_by_round.append((idx, wt, w))

        our_side, opp_side = get_sides(w)
        team_size = safe_int(w.get("teamSize"), 0) or 0
        season_team_size = max(season_team_size, team_size)

        wars_meta.append({
            "war": idx,
            "warTag": wt,
            "opponentClan": (opp_side.get("name") or "—"),
            "opponentTag": opp_side.get("tag"),
            "teamSize": team_size or None,
            "state": w.get("state") or None,
        })

        if (w.get("state") or "") != "warEnded":
            is_final = False

    league_name = ((group.get("warLeague") or {}).get("name")) or get_league_name()

    # warsCompleted: number of rounds actually ended (used by frontend to exclude active war from denominators)
    wars_completed = 0
    for war_num, wt, w in wars_by_round:
        if not w:
            continue
        if (w.get("state") or "") == "warEnded":
            wars_completed += 1

    # activeWarDay: best-effort current war day (1..7)
    # If not final: active is wars_completed + 1 (clamped)
    if is_final:
        active_war_day = 7
    else:
        active_war_day = max(1, min(7, wars_completed + 1))

    # warOpponents: array of opponent clan names for OUR wars (length 7)
    war_opponents = [""] * 7
    for m in wars_meta:
        wn = safe_int(m.get("war"), 0)
        if 1 <= wn <= 7:
            war_opponents[wn - 1] = (m.get("opponentClan") or "").strip()

    # -------------------------
    # League Overview
    # -------------------------
    standings = {}
    seen_war_tags = set()

    def ensure_team(tag, name):
        if not tag:
            return
        standings.setdefault(tag, {
            "tag": tag,
            "name": name or tag,
            "starsTotal": 0,            # raw stars (no bonus)
            "starsAgainstTotal": 0,     # opponent stars scored against this clan
            "destructionTotal": 0.0,    # sum of destruction % across wars included
            "wins": 0,                  # wins (ONLY wars ended)
        })

    for r in rounds:
        for wt in (r.get("warTags") or []):
            if not wt or wt == "#0" or wt in seen_war_tags:
                continue
            seen_war_tags.add(wt)

            w = coc_get(f"/clanwarleagues/wars/{wt}")
            state = (w.get("state") or "")

            # We include totals (stars/destr/defense) for ended and active wars,
            # but only count wins for warEnded.
            if state not in ("warEnded", "inWar"):
                continue

            c = w.get("clan") or {}
            o = w.get("opponent") or {}

            c_tag, o_tag = c.get("tag"), o.get("tag")
            ensure_team(c_tag, c.get("name"))
            ensure_team(o_tag, o.get("name"))

            c_stars = safe_int(c.get("stars"), 0)
            o_stars = safe_int(o.get("stars"), 0)
            c_destr = safe_float(c.get("destructionPercentage"), 0.0)
            o_destr = safe_float(o.get("destructionPercentage"), 0.0)

            # Totals
            standings[c_tag]["starsTotal"] += c_stars
            standings[o_tag]["starsTotal"] += o_stars

            standings[c_tag]["starsAgainstTotal"] += o_stars
            standings[o_tag]["starsAgainstTotal"] += c_stars

            standings[c_tag]["destructionTotal"] += c_destr
            standings[o_tag]["destructionTotal"] += o_destr

            # Wins ONLY on completed wars
            if state == "warEnded":
                winner = compute_winner(c_stars, c_destr, o_stars, o_destr)
                if winner == "clan":
                    standings[c_tag]["wins"] += 1
                elif winner == "opponent":
                    standings[o_tag]["wins"] += 1

    league_rows = []
    for tag, s in standings.items():
        wins = safe_int(s.get("wins", 0), 0)
        bonus = wins * 10
        stars_total = safe_int(s.get("starsTotal", 0), 0)  # no-bonus stars
        stars_against = safe_int(s.get("starsAgainstTotal", 0), 0)
        destr_total = round(safe_float(s.get("destructionTotal", 0.0), 0.0), 2)

        league_rows.append({
            "tag": tag,
            "name": s.get("name") or tag,

            # existing + UI-friendly totals
            "wins": wins,
            "bonusStars": bonus,
            "starsWithBonus": stars_total + bonus,

            # ✅ keys your UI can reliably use for AVG ⭐ and AVG 🛡️
            "starsTotal": stars_total,                 # no-bonus
            "starsNoBonusTotal": stars_total,          # explicit alias (no-bonus)
            "starsAgainstTotal": stars_against,        # defense source
            "destructionTotal": destr_total,

            # ✅ optional meta in each row if you want it later
            "warsCompleted": wars_completed,
        })

    league_rows.sort(key=lambda r: (
        -safe_int(r.get("starsWithBonus", 0), 0),
        -safe_float(r.get("destructionTotal", 0.0), 0.0),
        (r.get("name") or "").lower()
    ))
    for i, r in enumerate(league_rows, start=1):
        r["rank"] = i

    # -------------------------
    # Member Overview
    # ✅ ONLY rank logic = ClashNinja method (index-after-sort)
    # ✅ warsInLineup should NOT count future/prep wars
    # -------------------------
    members_map = {}

    for war_num, wt, w in wars_by_round:
        if not w:
            continue

        war_state = (w.get("state") or "")
        # ✅ Only count lineup denominator for wars that are active or ended.
        # This prevents "prep/future war" from inflating warsInLineup.
        counts_for_lineup = war_state in ("inWar", "warEnded")

        our_side, opp_side = get_sides(w)

        team_size = safe_int(w.get("teamSize"), 0) or None
        opp_clan_name = opp_side.get("name") or "—"

        # Build "real position" lookups for THIS war
        opp_members = opp_side.get("members") or []
        opp_actual_pos_by_tag, opp_member_by_tag = build_actual_pos_and_member_by_tag(opp_members)

        our_members = our_side.get("members") or []
        for m in our_members:
            tag = m.get("tag")
            name = m.get("name") or tag or "—"
            if not tag:
                continue

            rec = members_map.setdefault(tag, {
                "name": name,
                "tag": tag,
                "totalStars": 0,
                "totalDestruction": 0.0,
                "attacksMade": 0,
                "warsInLineup": 0,
                "rankSum": 0,
                "rankCount": 0,
                "wars": {}
            })

            # ✅ Denominator: only wars that are active/ended
            if counts_for_lineup:
                rec["warsInLineup"] += 1

            # CWL: only one attack slot; keep it explicit
            attacks = m.get("attacks") or []
            attack = attacks[0] if len(attacks) > 0 else None

            if not is_real_cwl_attack(attack):
                rec["wars"][war_num] = {
                    "war": war_num,
                    "opponentClan": opp_clan_name,
                    "teamSize": team_size,
                    "defenderPos": None,
                    "defenderName": None,
                    "stars": None,
                    "destruction": None
                }
                continue

            defender_tag = norm_tag(attack.get("defenderTag"))
            defender_pos = None
            defender_name = None

            if defender_tag and defender_tag in opp_member_by_tag:
                defender_pos = opp_actual_pos_by_tag.get(defender_tag)  # ✅ 1..15 / 1..30
                defender_name = (opp_member_by_tag[defender_tag].get("name") or None)

            stars = safe_int(attack.get("stars"), 0)
            destr = safe_float(attack.get("destructionPercentage"), 0.0)

            rec["attacksMade"] += 1
            rec["totalStars"] += stars
            rec["totalDestruction"] += destr

            if defender_pos is not None:
                rec["rankSum"] += defender_pos
                rec["rankCount"] += 1

            rec["wars"][war_num] = {
                "war": war_num,
                "opponentClan": opp_clan_name,
                "teamSize": team_size,
                "defenderPos": defender_pos,
                "defenderName": defender_name,
                "stars": stars,
                "destruction": destr
            }

    member_rows = []
    for _, rec in members_map.items():
        attacks = rec["attacksMade"]
        avgStars = round(rec["totalStars"] / attacks, 2) if attacks > 0 else 0.0
        avgDes   = round(rec["totalDestruction"] / attacks, 2) if attacks > 0 else 0.0
        avgRk    = round(rec["rankSum"] / rec["rankCount"], 2) if rec["rankCount"] > 0 else None

        wars_list = []
        for war_num in range(1, 8):
            wrow = rec["wars"].get(war_num)
            if not wrow:
                wars_list.append({
                    "war": war_num,
                    "opponentClan": None,
                    "teamSize": None,
                    "defenderPos": None,
                    "defenderName": None,
                    "stars": None,
                    "destruction": None
                })
            else:
                wars_list.append(wrow)

        member_rows.append({
            "name": rec["name"],
            "tag": rec["tag"],
            "avgRankAttacked": avgRk,
            "totalStars": rec["totalStars"],
            "totalDestruction": round(rec["totalDestruction"], 2),
            "attacksMade": rec["attacksMade"],
            "warsInLineup": rec["warsInLineup"],
            "avgStars": avgStars,
            "avgDestruction": avgDes,
            "wars": wars_list
        })

    payload = {
        "schemaVersion": 2,
        "seasonKey": season_key,
        "title": title,
        "leagueName": league_name,
        "state": "active" if group else "notInCwl",
        "generatedAt": utc_now_iso(),
        "isFinal": is_final,
        "teamSize": (season_team_size or None),

        # ✅ meta helpers for UI denominators
        "meta": {
            "activeWarDay": active_war_day,
            "warsCompleted": wars_completed,
        },

        # ✅ for your sword emoji append logic (your JS already supports this key)
        "warOpponents": war_opponents,

        "leagueOverview": league_rows,
        "memberOverview": member_rows,
        "warsMeta": wars_meta,
    }
    return payload, season_key, title, league_name, is_final

# =========================
# Index + History helpers
# =========================
def upsert_index(season_key, title):
    idx = load_json(OUT_INDEX, {"schemaVersion": 1, "seasons": [], "updatedAt": utc_now_iso()})
    seasons = idx.get("seasons") or []
    seen = { s.get("seasonKey"): s for s in seasons if isinstance(s, dict) }
    seen[season_key] = {"seasonKey": season_key, "title": title}
    idx["seasons"] = sorted(seen.values(), key=lambda s: s.get("seasonKey",""), reverse=True)
    idx["updatedAt"] = utc_now_iso()
    save_json(OUT_INDEX, idx)

def write_history_if_final(payload, season_key):
    if not payload.get("isFinal"):
        return
    path = os.path.join(HISTORY_DIR, f"{season_key}.json")
    save_json(path, payload)
    write_member_overview_table(payload, season_key)

def build_member_overview_table(payload):
    season_key = payload.get("seasonKey")
    generated_at = payload.get("generatedAt") or utc_now_iso()
    team_size = payload.get("teamSize") or 15
    meta = payload.get("meta") or {}
    wars_completed = meta.get("warsCompleted")
    active_war_day = meta.get("activeWarDay")

    columns = [
        {"key": "name", "label": "Name", "align": "left"},
        {"key": "atk_rk", "label": "🗡️RK", "fmt": "1dp", "align": "right"},
        {"key": "def_rk", "label": "🛡️RK", "fmt": "1dp", "align": "right"},
        {"key": "ttl_stars", "label": "TTL★", "align": "right"},
        {"key": "ttl_pct", "label": "TTL%", "fmt": "1dp", "align": "right"},
        {"key": "avg_stars", "label": "Avg★", "fmt": "1dp", "align": "right"},
        {"key": "avg_pct", "label": "Avg%", "fmt": "1dp", "align": "right"},
        {"key": "atk_frac", "label": "Atk", "align": "right"},
    ]

    for war_num in range(1, 8):
        columns.extend([
            {"key": f"war{war_num}_opp", "label": "⚔️", "align": "left"},
            {"key": f"war{war_num}_stars", "label": "⭐", "align": "right"},
            {"key": f"war{war_num}_pct", "label": "🎯", "fmt": "1dp", "align": "right"},
        ])

    rows = []
    members = payload.get("memberOverview") or []
    for member in members:
        attacks_made = safe_int(member.get("attacksMade"), 0)

        if wars_completed is not None:
            denom_target = safe_int(wars_completed, 7)
        else:
            denom_target = 7

        wars_in_lineup = member.get("warsInLineup")
        if wars_in_lineup is not None:
            denom = min(safe_int(wars_in_lineup, 0), denom_target)
        else:
            denom = denom_target
        denom = max(denom, attacks_made)

        row = {
            "name": member.get("name"),
            "tag": member.get("tag"),
            "atk_rk": member.get("avgRankAttacked"),
            "def_rk": member.get("avgDefRank"),
            "ttl_stars": member.get("totalStars"),
            "ttl_pct": member.get("totalDestruction"),
            "avg_stars": member.get("avgStars"),
            "avg_pct": member.get("avgDestruction"),
            "atk_frac": f"{attacks_made}/{denom}",
        }

        wars = member.get("wars") or []
        wars_by_num = {}
        for w in wars:
            war_num = safe_int(w.get("war"), 0)
            if 1 <= war_num <= 7:
                wars_by_num[war_num] = w

        for war_num in range(1, 8):
            entry = wars_by_num.get(war_num)
            if entry:
                defender_pos = entry.get("defenderPos")
                defender_name = entry.get("defenderName")
                stars = entry.get("stars")
                destruction = entry.get("destruction")
                has_outcome = (stars is not None) or (destruction is not None)
                has_target = (defender_pos is not None) and bool(defender_name)
                if has_outcome and has_target:
                    row[f"war{war_num}_opp"] = f"{defender_pos}. {defender_name}"
                    row[f"war{war_num}_stars"] = stars
                    row[f"war{war_num}_pct"] = destruction
                else:
                    row[f"war{war_num}_opp"] = "—"
                    row[f"war{war_num}_stars"] = None
                    row[f"war{war_num}_pct"] = None
            else:
                row[f"war{war_num}_opp"] = "—"
                row[f"war{war_num}_stars"] = None
                row[f"war{war_num}_pct"] = None

        rows.append(row)

    return {
        "tableId": "cwl_member_overview",
        "seasonKey": season_key,
        "generatedAt": generated_at,
        "teamSize": team_size,
        "meta": {"activeWarDay": active_war_day, "warsCompleted": wars_completed},
        "columns": columns,
        "rows": rows,
    }

def write_member_overview_table(payload, season_key):
    if not season_key:
        return
    table_payload = build_member_overview_table(payload)
    path = os.path.join(TABLES_DIR, f"{season_key}_member_overview.table.json")
    save_json_pretty(path, table_payload)

# =========================
# MAIN
# =========================
def main():
    ensure_dirs()
    ensure_index_file_exists()

    group = get_league_group()
    if not group:
        payload = {
            "schemaVersion": 2,
            "seasonKey": None,
            "title": "CWL",
            "leagueName": get_league_name(),
            "state": "notInCwl",
            "generatedAt": utc_now_iso(),
            "isFinal": False,
            "teamSize": None,
            "meta": {"activeWarDay": None, "warsCompleted": 0},
            "warOpponents": [""] * 7,
            "leagueOverview": [],
            "memberOverview": [],
            "warsMeta": [],
        }
        save_json(OUT_CURRENT, payload)
        return

    payload, season_key, title, league_name, is_final = build_cwl_payload(group)
    save_json(OUT_CURRENT, payload)

    if season_key:
        upsert_index(season_key, title)
        write_history_if_final(payload, season_key)

if __name__ == "__main__":
    main()
