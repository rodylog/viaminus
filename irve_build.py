#!/usr/bin/env python3
"""Base nationale des IRVE -> fichiers JSON par departement pour ViaMinus.

Source : fichier consolide quotidien de data.gouv.fr (schema Etalab IRVE statique
v2.3.1, CSV UTF-8, une ligne par POINT DE CHARGE). Licence Ouverte Etalab 2.0.
Ces donnees sont STATIQUES : ni disponibilite en temps reel, ni prix au kWh (aucune
donnee ouverte francaise n'en publie) ; le plan de charge optimise donc le temps.

    python3 irve_build.py <csv> --sortie data/irve/

ecrit data/irve/<dep>.json (tableau de stations, cles courtes) et data/irve/index.json
(volumes et emprise par departement, pour charger les bons fichiers depuis la carte).
data/irve/ est un artefact de build servi A COTE de la page (CSP 'self'), jamais embarque
dans le HTML. Seule exception commitee : src/fixtures/irve-34.json, produit par ce script
depuis l'echantillon src/fixtures/irve-echantillon-34.csv.

Pieges du fichier reel absorbes ici (mesures le 28/10/2026) : booleens heterogenes
(True/true/TRUE/1/vide), coordonneesXY « [lon, lat] » avec ou sans espace, coordonnees
consolidees pas toujours fiables (consolidated_is_lon_lat_correct), puissances en watts,
doublons d'id_pdc_itinerance entre jeux, id_station_itinerance vide, accents casses
(« Accčs libre »), nbre_pdc declaratif (on compte les lignes).
Bibliotheque standard seule.
"""
import argparse
import csv
import json
import math
import os
import re
import sys
from datetime import date

# URL du fichier utilise pour la premiere integration (28/10/2026) ; la version courante
# se retrouve par https://www.data.gouv.fr/api/1/datasets/fichier-consolide-des-bornes-
# de-recharge-pour-vehicules-electriques/ (ressource « Consolidation de la derniere version »).
SOURCE = ("https://static.data.gouv.fr/resources/base-nationale-des-irve-data-gouv-"
          "infrastructures-de-recharge-pour-vehicules-electriques-donnees-statiques/"
          "20261028-044937/consolidation-etalab-schema-irve-statique-v-2.3.1-20261028.csv")
# France metropolitaine + Corse ; tout le reste (DOM, erreurs de saisie) est rejete.
LON_MIN, LON_MAX, LAT_MIN, LAT_MAX = -5.5, 9.9, 41.0, 51.5
VRAI = {"true", "1", "vrai"}
FAUX = {"false", "0", "faux"}
RE_XY = re.compile(r"^\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]\s*$")
RE_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")
RE_247 = re.compile(r"^(24/7|24h?/24(\s*(et|-|,)?\s*7j?/7)?|7j?/7\s*(et|-|,)?\s*24h?/24)$", re.I)


def parse_bool(txt):
    """true/1/vrai -> True ; false/0/faux -> False ; vide ou autre -> None (inconnu,
    jamais faux par defaut)."""
    t = (txt or "").strip().lower()
    if t in VRAI:
        return True
    if t in FAUX:
        return False
    return None


def parse_puissance(txt):
    """kW ; certains jeux publient en watts (> 1000 -> / 1000) ; vide, 0 ou illisible -> None."""
    t = (txt or "").strip().replace(",", ".")
    try:
        p = float(t)
    except ValueError:
        return None
    if not p > 0:
        return None
    if p > 1000:
        p = p / 1000
    p = round(p, 2)
    return int(p) if p == int(p) else p


def parse_xy(txt):
    """« [lon, lat] » (espace facultatif) -> (lon, lat) ; sinon None."""
    m = RE_XY.match(txt or "")
    return (float(m.group(1)), float(m.group(2))) if m else None


def en_france(lon, lat):
    return LON_MIN <= lon <= LON_MAX and LAT_MIN <= lat <= LAT_MAX


def coordonnees(r):
    """Coordonnees consolidees si declarees correctes, sinon coordonneesXY ; None si illisible."""
    if parse_bool(r.get("consolidated_is_lon_lat_correct")):
        try:
            return float(r["consolidated_longitude"]), float(r["consolidated_latitude"])
        except (ValueError, KeyError):
            pass
    return parse_xy(r.get("coordonneesXY"))


def texte(txt, maxi=160):
    """Chaine venue de l'exterieur : espaces normalises, caracteres de controle et
    chevrons retires (echappement a l'ingestion ; la page la rendra en texte), bornee."""
    t = re.sub(r"[\x00-\x1f\x7f<>]", "", txt or "")
    t = re.sub(r"\s+", " ", t).strip()
    return t[:maxi] or None


def horaires(txt):
    """Chaine brute normalisee : espaces reduits, variantes de « 24/7 » ramenees a 24/7 ;
    None si vide. L'interpretation (ouvert a telle heure) est faite par src/irve.js."""
    t = texte(txt, 200)
    if not t:
        return None
    if RE_247.match(t.replace(" ", "")) or RE_247.match(t):
        return "24/7"
    return t


def pmr(txt):
    t = (txt or "").strip().lower()
    if not t or "inconnu" in t:
        return None
    if t.startswith("non"):
        return False
    return True if ("accessible" in t or "pmr" in t) else None


def acces(txt):
    """condition_acces : « Accès libre » / « Accès réservé » (accents parfois casses)."""
    t = (txt or "").strip().lower()
    if "libre" in t:
        return "libre"
    if re.search(r"r.serv", t):
        return "reserve"
    return None


def date_maj(txt):
    t = (txt or "").strip()
    return t[:10] if RE_DATE.match(t) else None


RE_CP = re.compile(r"(?<!\d)(\d{5})(?!\d)")
DEPS_VALIDES = {"%02d" % i for i in range(1, 96)} - {"20"} | {"2A", "2B"}
RAYON_BBOX_KM = 150   # une station a plus de 150 km de la mediane de son departement est aberrante
VOIES = ("cp_consolide", "insee", "adresse", "emprise")


def corse(insee, lat):
    """20 -> 2A / 2B : d'apres l'INSEE si on l'a, sinon par la latitude (limite ~ 42,0)."""
    if insee.startswith("2A") or insee.startswith("2B"):
        return insee[:2]
    return "2A" if lat is not None and lat < 42.0 else "2B"


def departement(r, lat=None):
    """(departement, voie) ; (None, None) si aucune des trois premieres voies n'aboutit
    (la quatrieme, l'emprise des departements deja attribues, se joue sur les stations :
    voir attribuer_par_emprise). Mesure sur le fichier du 30/10/2026 : 69 182 lignes sans
    consolidated_code_postal ni code_insee_commune exploitable, dont 98 % portent un code
    postal a 5 chiffres dans adresse_station.
    1. consolidated_code_postal[:2] ; 2. code_insee_commune[:2] (2A/2B compris) ;
    3. dernier groupe de 5 chiffres d'adresse_station."""
    cp = (r.get("consolidated_code_postal") or "").strip()
    insee = (r.get("code_insee_commune") or "").strip().upper()
    candidats = [(cp[:2] if len(cp) >= 2 and cp[:2].isdigit() else "", "cp_consolide"),
                 (insee[:2] if len(insee) >= 2 else "", "insee")]
    cps = RE_CP.findall(r.get("adresse_station") or "")
    candidats.append((cps[-1][:2] if cps else "", "adresse"))
    for dep, voie in candidats:
        if dep == "20":
            dep = corse(insee, lat)
        if dep in DEPS_VALIDES:
            return dep, voie
    return None, None


def bbox_robuste(liste):
    """Emprise d'un departement sans ses coordonnees aberrantes (Herault : 8 PDC sur 1 357 hors
    du departement, bbox de -1,53 a 47,21 au 30/10/2026) : les stations a plus de RAYON_BBOX_KM
    de la mediane (lon, lat) sont exclues du calcul. Renvoie (bbox, nombre d'exclues)."""
    lons = sorted(s["lon"] for s in liste)
    lats = sorted(s["lat"] for s in liste)
    mlon, mlat = lons[len(lons) // 2], lats[len(lats) // 2]
    kx = 111.32 * math.cos(math.radians(mlat))
    gardees = [s for s in liste
               if math.hypot((s["lon"] - mlon) * kx, (s["lat"] - mlat) * 110.57) <= RAYON_BBOX_KM]
    return ([min(s["lon"] for s in gardees), min(s["lat"] for s in gardees),
             max(s["lon"] for s in gardees), max(s["lat"] for s in gardees)],
            len(liste) - len(gardees))


def attribuer_par_emprise(stations, rapport):
    """Voie 4 : station sans departement -> le departement (deja attribue par les voies
    1 a 3) dont l'emprise robuste contient le point ; la plus petite en cas de chevauchement.
    Le reste va dans 00.json (inattribuable)."""
    par_dep = {}
    for s in stations:
        if s["_dep"]:
            par_dep.setdefault(s["_dep"], []).append(s)
    emprises = []
    for dep, liste in par_dep.items():
        b, _ = bbox_robuste(liste)
        emprises.append((dep, b, (b[2] - b[0]) * (b[3] - b[1])))
    emprises.sort(key=lambda x: x[2])   # la plus petite d'abord
    for s in stations:
        if s["_dep"]:
            continue
        for dep, b, _ in emprises:
            if b[0] <= s["lon"] <= b[2] and b[1] <= s["lat"] <= b[3]:
                s["_dep"], s["_voie"] = dep, "emprise"
                break
        else:
            s["_dep"], s["_voie"] = "00", "inattribuable"
        rapport["voies"][s["_voie"]] += 1


def agreger_bool(valeurs):
    """Station : vrai si un PDC est vrai ; faux si tous sont connus faux ; sinon inconnu."""
    if any(v is True for v in valeurs):
        return True
    if valeurs and all(v is False for v in valeurs):
        return False
    return None


def premier(valeurs):
    for v in valeurs:
        if v is not None:
            return v
    return None


def lire_pdc(chemin, rapport):
    """Lit le CSV, dedoublonne les PDC (id_pdc_itinerance : date_maj la plus recente),
    rejette les coordonnees illisibles ou hors France."""
    pdcs = {}
    with open(chemin, encoding="utf-8-sig", newline="") as f:
        for i, r in enumerate(csv.DictReader(f)):
            rapport["lignes"] += 1
            xy = coordonnees(r)
            if xy is None or not en_france(*xy):
                rapport["rejets_hors_france"] += 1
                continue
            cle = (r.get("id_pdc_itinerance") or "").strip() or ("~" + str(i))
            maj = date_maj(r.get("date_maj")) or ""
            if cle in pdcs:
                rapport["doublons"] += 1
                if maj <= pdcs[cle][0]:
                    continue
            pdcs[cle] = (maj, r, xy)
    return [(r, xy) for (_, r, xy) in pdcs.values()]


def cle_station(r, xy):
    sid = (r.get("id_station_itinerance") or "").strip()
    if sid:
        return sid
    # id vide : regroupement par (nom, lon/lat arrondis a 4 decimales)
    return "~%s@%.4f,%.4f" % (texte(r.get("nom_station"), 60) or "", xy[0], xy[1])


def construire_stations(pdcs, rapport):
    groupes = {}
    for r, xy in pdcs:
        groupes.setdefault(cle_station(r, xy), []).append((r, xy))
    stations = []
    for sid, lignes in groupes.items():
        # PDC du plus recent au plus ancien : les champs « premier non vide » viennent du plus recent
        lignes.sort(key=lambda l: date_maj(l[0].get("date_maj")) or "", reverse=True)
        rows = [l[0] for l in lignes]
        kws = [parse_puissance(r.get("puissance_nominale")) for r in rows]
        rapport["puissances_inconnues"] += sum(1 for k in kws if k is None)
        kws_ok = [k for k in kws if k is not None]
        lon, lat = lignes[0][1]
        t2 = [parse_bool(r.get("prise_type_2")) for r in rows]
        ef = [parse_bool(r.get("prise_type_ef")) for r in rows]
        stations.append({
            "id": sid,
            "n": texte(premier(r.get("nom_station") for r in rows)),
            "op": texte(premier([r.get("nom_operateur") for r in rows] + [r.get("nom_enseigne") for r in rows]
                                + [r.get("nom_amenageur") for r in rows]), 80),
            "lon": round(lon, 6), "lat": round(lat, 6),
            "pdc": len(rows),
            "kw": max(kws_ok) if kws_ok else None,
            "kwmin": min(kws_ok) if kws_ok else None,
            "ac": agreger_bool([(True if (a is True or b is True) else (False if (a is False and b is False) else None))
                                for a, b in zip(t2, ef)]),
            "ccs": agreger_bool([parse_bool(r.get("prise_type_combo_ccs")) for r in rows]),
            "chademo": agreger_bool([parse_bool(r.get("prise_type_chademo")) for r in rows]),
            "gratuit": agreger_bool([parse_bool(r.get("gratuit")) for r in rows]),
            "cb": agreger_bool([parse_bool(r.get("paiement_cb")) for r in rows]),
            "acte": agreger_bool([parse_bool(r.get("paiement_acte")) for r in rows]),
            "h": premier(horaires(r.get("horaires")) for r in rows),
            "pmr": agreger_bool([pmr(r.get("accessibilite_pmr")) for r in rows]),
            "acces": premier(acces(r.get("condition_acces")) for r in rows),
            "maj": premier(date_maj(r.get("date_maj")) for r in rows),
        })
        # Departement : premier PDC (le plus recent) qui aboutit par les voies 1 a 3.
        dep, voie = None, None
        for r in rows:
            dep, voie = departement(r, lat)
            if dep:
                break
        stations[-1]["_dep"], stations[-1]["_voie"] = dep, voie
        if voie:
            rapport["voies"][voie] += 1
    stations.sort(key=lambda s: s["id"])
    return stations


def ecrire(stations, sortie, source):
    os.makedirs(sortie, exist_ok=True)
    par_dep = {}
    for s in stations:
        par_dep.setdefault(s.pop("_dep"), []).append(s)
    index = {"genere": date.today().isoformat(), "source": source, "departements": {}}
    total, exclues = 0, 0
    for dep in sorted(par_dep):
        liste = par_dep[dep]
        for s in liste:
            s.pop("_voie", None)
        chemin = os.path.join(sortie, dep + ".json")
        with open(chemin, "w", encoding="utf-8") as f:
            json.dump(liste, f, ensure_ascii=False, separators=(",", ":"))
            f.write("\n")
        octets = os.path.getsize(chemin)
        total += octets
        bbox, n_excl = bbox_robuste(liste)
        exclues += n_excl
        index["departements"][dep] = {
            "stations": len(liste), "pdc": sum(s["pdc"] for s in liste), "octets": octets, "bbox": bbox}
    with open(os.path.join(sortie, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    return total, len(par_dep), exclues


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", help="fichier consolide IRVE (schema Etalab v2.3.1)")
    ap.add_argument("--sortie", default="data/irve", help="dossier de sortie (defaut : data/irve)")
    ap.add_argument("--source", default=SOURCE, help="URL du CSV, ecrite dans index.json")
    a = ap.parse_args()

    rapport = {"lignes": 0, "doublons": 0, "rejets_hors_france": 0, "puissances_inconnues": 0,
               "voies": {v: 0 for v in VOIES + ("inattribuable",)}}
    pdcs = lire_pdc(a.csv, rapport)
    stations = construire_stations(pdcs, rapport)
    attribuer_par_emprise(stations, rapport)
    total, ndep, exclues = ecrire(stations, a.sortie, a.source)
    v = rapport["voies"]
    print(f"lignes lues            : {rapport['lignes']}")
    print(f"rejets hors France     : {rapport['rejets_hors_france']} (coordonnees illisibles ou hors metropole/Corse)")
    print(f"doublons de PDC retires: {rapport['doublons']} (date_maj la plus recente gardee)")
    print(f"PDC dedoublonnes       : {len(pdcs)}")
    print(f"stations               : {len(stations)} dans {ndep} fichier(s)")
    print(f"departement par        : code postal consolide {v['cp_consolide']}, INSEE {v['insee']}, "
          f"adresse {v['adresse']}, emprise {v['emprise']}, inattribuable (00.json) {v['inattribuable']}")
    print(f"puissances inconnues   : {rapport['puissances_inconnues']} PDC")
    print(f"bbox : stations exclues: {exclues} (a plus de {RAYON_BBOX_KM} km de la mediane de leur departement)")
    print(f"taille totale ecrite   : {total / 1024:.1f} Ko dans {a.sortie}/")


if __name__ == "__main__":
    main()
