#!/usr/bin/env python3
"""Tests d'irve_build.py (unittest, bibliotheque standard) : les quatre voies de resolution du
departement et l'emprise robuste. Mesures du 30/10/2026 sur le fichier reel : 49 % des
stations tombaient dans 00.json faute de code postal ou d'INSEE alors que l'adresse portait
le code postal ; la bbox de l'Herault allait de -1,53 a 47,21 a cause de 8 PDC aberrants.

    python3 irve_build_test.py
"""
import unittest

from irve_build import attribuer_par_emprise, bbox_robuste, departement


def ligne(cp="", insee="", adresse=""):
    return {"consolidated_code_postal": cp, "code_insee_commune": insee, "adresse_station": adresse}


def station(dep, lon, lat, voie="cp_consolide"):
    return {"id": "x", "lon": lon, "lat": lat, "_dep": dep, "_voie": voie}


class Departement(unittest.TestCase):
    def test_voie_1_code_postal_consolide(self):
        self.assertEqual(departement(ligne(cp="34130", insee="34154", adresse="80330 Longueau")), ("34", "cp_consolide"))

    def test_voie_2_insee_quand_le_code_postal_manque(self):
        self.assertEqual(departement(ligne(insee="80410", adresse="x")), ("80", "insee"))
        self.assertEqual(departement(ligne(insee="2A004")), ("2A", "insee"))
        self.assertEqual(departement(ligne(insee="2B033")), ("2B", "insee"))

    def test_voie_3_dernier_groupe_de_5_chiffres_de_l_adresse(self):
        self.assertEqual(departement(ligne(adresse="3 Rue Laurent Lavoisier, 80330 Longueau")), ("80", "adresse"))
        # Le DERNIER groupe : un numero de voie a 5 chiffres avant le code postal ne trompe pas.
        self.assertEqual(departement(ligne(adresse="12345 route de Nimes, 34000 Montpellier")), ("34", "adresse"))
        # Pas de groupe de 5 chiffres isole : rien.
        self.assertEqual(departement(ligne(adresse="Parking P2 D172, Montpellier")), (None, None))
        self.assertEqual(departement(ligne(adresse="tel 0612345678")), (None, None))

    def test_corse_20xxx_par_la_latitude(self):
        self.assertEqual(departement(ligne(adresse="20000 Ajaccio"), lat=41.92), ("2A", "adresse"))
        self.assertEqual(departement(ligne(adresse="20200 Bastia"), lat=42.70), ("2B", "adresse"))
        self.assertEqual(departement(ligne(cp="20200"), lat=42.70), ("2B", "cp_consolide"))
        self.assertEqual(departement(ligne(cp="20000", insee="2A004"), lat=42.70), ("2A", "cp_consolide"))   # l'INSEE prime

    def test_code_postal_invalide_ignore(self):
        self.assertEqual(departement(ligne(cp="99999", adresse="80330 Longueau")), ("80", "adresse"))
        self.assertEqual(departement(ligne(cp="ABCDE")), (None, None))

    def test_voie_4_emprise_des_departements_attribues_la_plus_petite(self):
        # 34 : emprise 3,0-4,2 / 43,2-43,9 ; 30 (plus grand, chevauche) : 3,5-4,9 / 43,4-44,5.
        stations = [station("34", 3.0, 43.2), station("34", 4.2, 43.9), station("34", 3.6, 43.5),
                    station("30", 3.5, 43.4), station("30", 4.9, 44.5), station("30", 4.2, 44.0),
                    station(None, 3.8, 43.6, None),    # dans les deux : le plus petit (34)
                    station(None, 4.7, 44.3, None),    # seulement dans 30
                    station(None, 2.0, 48.0, None)]    # nulle part : inattribuable
        rapport = {"voies": {"emprise": 0, "inattribuable": 0}}
        attribuer_par_emprise(stations, rapport)
        self.assertEqual([s["_dep"] for s in stations[6:]], ["34", "30", "00"])
        self.assertEqual([s["_voie"] for s in stations[6:]], ["emprise", "emprise", "inattribuable"])
        self.assertEqual(rapport["voies"], {"emprise": 2, "inattribuable": 1})


class BboxRobuste(unittest.TestCase):
    def test_une_station_aberrante_est_exclue_de_l_emprise(self):
        # Herault : 9 stations entre 3,2 et 4,1 de longitude, une a Brest (-4,5 ; 48,4).
        liste = [station("34", round(3.2 + i * 0.1, 2), round(43.3 + i * 0.05, 2)) for i in range(9)] + [station("34", -4.5, 48.4)]
        bbox, exclues = bbox_robuste(liste)
        self.assertEqual(exclues, 1)
        self.assertAlmostEqual(bbox[0], 3.2)
        self.assertAlmostEqual(bbox[2], 4.0)
        self.assertAlmostEqual(bbox[3], 43.7)
        # Sans aberration : rien d'exclu, emprise = min / max.
        bbox2, exclues2 = bbox_robuste(liste[:9])
        self.assertEqual((exclues2, bbox2), (0, [3.2, 43.3, 4.0, 43.7]))

    def test_une_seule_station(self):
        self.assertEqual(bbox_robuste([station("34", 3.9, 43.6)]), ([3.9, 43.6, 3.9, 43.6], 0))


if __name__ == "__main__":
    unittest.main()
