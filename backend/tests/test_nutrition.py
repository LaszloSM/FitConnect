"""Cálculos de nutrición contra valores de referencia hechos a mano."""
from datetime import date

import pytest

from app.services import nutrition as n

TODAY = date(2026, 10, 8)


def test_mifflin_matches_the_published_equation():
    # Hombre, 30 años, 80 kg, 180 cm: 10·80 + 6,25·180 − 5·30 + 5 = 1780
    assert n.bmr_mifflin("male", 80, 180, 30) == pytest.approx(1780)
    # Mujer, 25 años, 60 kg, 165 cm: 600 + 1031,25 − 125 − 161 = 1345,25
    assert n.bmr_mifflin("female", 60, 165, 25) == pytest.approx(1345.25)


def test_gain_muscle_targets_for_a_reference_man():
    t = n.compute(sex="male", weight_kg=80, height_cm=180, birth_date=date(1996, 1, 1), activity="moderate",
                  goal="gain_muscle", today=TODAY)
    assert t.bmr == 1780
    assert t.tdee == round(1780 * 1.55)  # 2759
    assert t.kcal == round(1780 * 1.55 * 1.10)  # 3035
    assert t.protein_g == 144  # 1,8 g/kg × 80
    assert t.fat_g == round(0.25 * t.kcal / 9)
    assert abs(t.protein_g * 4 + t.fat_g * 9 + t.carbs_g * 4 - t.kcal) <= 8
    assert t.water_ml == 2800


def test_deficit_never_goes_below_resting_expenditure_or_the_floor():
    t = n.compute(sex="female", weight_kg=50, height_cm=155, birth_date=date(2000, 5, 5), activity="sedentary",
                  goal="lose_fat", today=TODAY)
    assert t.kcal >= 1200 and t.kcal >= t.bmr
    assert t.clamped is True


def test_protein_uses_reference_weight_with_obesity():
    t = n.compute(sex="male", weight_kg=130, height_cm=175, birth_date=date(1985, 1, 1), activity="light",
                  goal="lose_fat", today=TODAY)
    assert t.protein_g == round(2.0 * 25 * 1.75 ** 2)  # 153 g, no 260 g


def test_minors_and_missing_data_are_refused():
    with pytest.raises(ValueError):
        n.compute(sex="female", weight_kg=55, height_cm=160, birth_date=date(2010, 1, 1), activity="light",
                  goal="maintain", today=TODAY)
    with pytest.raises(n.MissingData) as e:
        n.compute(sex=None, weight_kg=70, height_cm=None, birth_date=date(1990, 1, 1), activity="light",
                  goal="maintain", today=TODAY)
    assert e.value.missing == ["sexo", "talla"]


def test_macros_scale_by_grams():
    assert n.macros_for(150, {"kcal": 130, "protein_g": 2.7, "carbs_g": 28.2, "fat_g": 0.3})["kcal"] == 195.0
