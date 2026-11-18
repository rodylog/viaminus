#!/usr/bin/env python3
"""Tests de generate.py (unittest, bibliotheque standard) : les donnees inlinees dans le
<script> de la page (snapshot de repli, table des provinces espagnoles) ne peuvent ni refermer
ce script ni en ouvrir un autre. Releve du 11/11/2026 : une adresse du flux contenant
« </script><script>… » cassait la page, et le second script etait hache par csp_meta, donc
autorise par la CSP.

Sans reseau : le flux des prix et la bibliotheque MapLibre sont remplaces ; la page est ecrite
dans un dossier temporaire (--out), jamais a l'emplacement par defaut.

    python3 generate_test.py
"""
import contextlib
import io
import json
import os
import re
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest import mock

import generate

PIEGE = "1 rue </script><script>alert(1)</script>"
COMMENTAIRE = "<!-- <script> jamais referme"


def generer(lignes, provinces=None):
    """La page generee avec `lignes` pour snapshot (et `provinces` pour table, si donnee)."""
    lire = generate.lire

    def lire_piege(nom):
        if nom == "es-provincias.json" and provinces is not None:
            return json.dumps(provinces, ensure_ascii=False)
        return lire(nom)

    with tempfile.TemporaryDirectory() as dossier:
        sortie = os.path.join(dossier, "index.html")
        with mock.patch.object(generate, "snapshot", lambda *a: lignes), \
             mock.patch.object(generate, "biblio_inline", lambda nom, sri: "/* %s */" % nom), \
             mock.patch.object(generate, "lire", lire_piege), \
             mock.patch("sys.argv", ["generate.py", "--out", sortie]), \
             contextlib.redirect_stdout(io.StringIO()):
            generate.main()
        with open(sortie, encoding="utf-8") as f:
            return f.read()


def balises(html):
    return html.count("<script"), html.count("</script"), html.count("<!--"), html.count("'sha256-")


class DonneesInlinees(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temoin = generer([])

    def test_page_temoin(self):
        self.assertEqual(self.temoin.count("<script"), 2)
        self.assertEqual(self.temoin.count("'sha256-"), 2)

    def test_snapshot_qui_referme_le_script(self):
        html = generer([{"adresse": PIEGE, "ville": "</SCRIPT >"}])
        self.assertEqual(balises(html), balises(self.temoin))
        self.assertNotIn("<script>alert(1)", html)

    def test_snapshot_qui_ouvre_un_commentaire(self):
        html = generer([{"adresse": COMMENTAIRE}])
        self.assertEqual(balises(html), balises(self.temoin))

    def test_snapshot_relu_a_l_identique(self):
        lignes = [{"adresse": PIEGE, "ville": COMMENTAIRE, "cp": "34000", "prix": 1.709}]
        html = generer(lignes)
        m = re.search(r"^const SNAPSHOT = (.*);$", html, re.M)
        self.assertIsNotNone(m)
        self.assertEqual(json.loads(m.group(1)), lignes)

    def test_table_des_provinces_piegee(self):
        html = generer([], provinces={"17": {"nom": PIEGE + COMMENTAIRE, "bbox": [0, 0, 1, 1]}})
        self.assertEqual(balises(html), balises(self.temoin))
        self.assertNotIn("<script>alert(1)", html)


class OuvertureEnLocal(unittest.TestCase):
    """--open sert la page en http://127.0.0.1 (contexte securise : geolocalisation et stockage
    stable sous Firefox, ce que file:// refuse) et ne montre que la page et data/irve/."""

    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        d = self.dossier.name
        self.page = os.path.join(d, "fuelpilot ma page.html")
        for chemin, texte in ((self.page, "<p>page</p>"), (os.path.join(d, "secret.txt"), "non"),
                              (os.path.join(d, "data", "irve", "index.json"), "{}")):
            os.makedirs(os.path.dirname(chemin), exist_ok=True)
            with open(chemin, "w", encoding="utf-8") as f:
                f.write(texte)
        serveurs, ouvertes = [], []
        base = generate.http.server.ThreadingHTTPServer

        class Note(base):
            def __init__(self, adresse, *a, **kw):
                super().__init__((adresse[0], 0), *a, **kw)   # port libre pour le test
                serveurs.append(self)

        with mock.patch.object(generate.http.server, "ThreadingHTTPServer", Note), \
             mock.patch.object(generate.webbrowser, "open", ouvertes.append), \
             contextlib.redirect_stdout(io.StringIO()):
            self.fil = threading.Thread(target=generate.ouvrir_en_local, args=(self.page, 8765))
            self.fil.start()
            while not serveurs:
                pass
        self.serveur, self.ouvertes = serveurs[0], ouvertes
        self.racine = "http://127.0.0.1:%d" % self.serveur.server_address[1]

    def tearDown(self):
        self.serveur.shutdown()
        self.fil.join()
        self.dossier.cleanup()

    def statut(self, chemin):
        try:
            with urllib.request.urlopen(self.racine + chemin) as r:
                return r.status, r.headers.get("Cache-Control"), r.read().decode()
        except urllib.error.HTTPError as e:
            return e.code, None, None

    def test_ouvre_en_http_local_pas_en_file(self):
        self.assertEqual(len(self.ouvertes), 1)
        self.assertTrue(self.ouvertes[0].startswith("http://127.0.0.1:8765/fuelpilot%20ma%20page.html"))

    def test_page_et_bornes_servies_sans_cache(self):
        self.assertEqual(self.statut("/fuelpilot%20ma%20page.html"), (200, "no-store", "<p>page</p>"))
        self.assertEqual(self.statut("/")[2], "<p>page</p>")
        self.assertEqual(self.statut("/data/irve/index.json")[0], 200)

    def test_rien_d_autre_du_dossier(self):
        for chemin in ("/secret.txt", "/data/", "/data/irve/../../secret.txt",
                       "/data/irve/%2e%2e/%2e%2e/secret.txt", "/data/irve/index.json/../../secret.txt"):
            self.assertEqual(self.statut(chemin)[0], 404, chemin)


if __name__ == "__main__":
    unittest.main()
