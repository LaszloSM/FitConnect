"""Curado en español de la base de alimentos: qué se toma de cada fuente, con
qué nombre, sinónimos y porciones caseras. Lo usa `build_foods.py`.

Las porciones caseras son aproximadas (una taza de arroz cocido ≈ 160 g); se
eligieron por cómo se sirve en Colombia y la app siempre deja ajustar los
gramos a mano.
"""

#: Grupo de la TCAC → categoría de la app.
TCAC_GROUPS = {
    "A": "cereales", "B": "verduras", "C": "frutas", "D": "grasas", "E": "pescados", "F": "carnes",
    "G": "lacteos", "J": "huevos", "K": "dulces", "L": "otros", "P": "otros", "R": "cereales",
    "S": "platos", "T": "leguminosas",
}

#: Alimentos de la TCAC que no se publican en la app: huevos de especies
#: protegidas y cosas que nadie registra como comida.
TCAC_EXCLUDE = {683, 686, 690, 725, 740, 741, 742, 893}

#: Ajustes de categoría por nombre (la TCAC mete el pollo en «carnes» y el
#: maní en leguminosas, que está bien, pero así se busca mejor).
CATEGORY_BY_PREFIX = [
    ("carne de pollo", "aves"), ("pechuga", "aves"), ("chorizo de pollo", "aves"),
    ("papa", "tuberculos"), ("yuca", "tuberculos"), ("platano", "tuberculos"), ("arracacha", "tuberculos"),
    ("name", "tuberculos"), ("malanga", "tuberculos"), ("batata", "tuberculos"),
    ("mani", "frutos_secos"), ("nuez", "frutos_secos"), ("almendra", "frutos_secos"),
    ("cafe", "bebidas"), ("te,", "bebidas"),
]

#: Sinónimos por palabra (sobre el nombre normalizado, sin tildes).
SYNONYMS = {
    "banano": ["guineo", "cambur"], "platano": ["plátano"], "frijol": ["fríjol", "frijoles", "fríjoles", "porotos"],
    "ahuyama": ["zapallo", "calabaza"], "arveja": ["alverja", "guisante"], "maiz tierno": ["mazorca", "choclo"],
    "aguacate": ["palta"], "papa": ["patata"], "carne de res": ["res", "carne"], "lomo": ["solomito"],
    "carne de cerdo": ["cerdo", "marrano"], "carne de pollo": ["pollo"], "huevo": ["huevos"],
    "queso": ["quesito"], "arepa": ["arepas"], "lenteja": ["lentejas"], "tomate de arbol": ["tamarillo"],
    "maracuya": ["parchita"], "azucar, moreno": ["panela", "azúcar morena"], "panceta": ["tocino"],
    "atun": ["atún en lata"], "leche de vaca, entera": ["leche entera"], "leche de vaca, descremada": ["leche descremada", "leche deslactosada"],
    "yogur": ["yogurt", "kumis"], "avena": ["avena en hojuelas", "oats"], "pasta": ["espagueti", "macarrones"],
    "aceite": ["aceite de cocina"], "mantequilla de mani": ["crema de maní"], "garbanzo": ["garbanzos"],
}

#: Porciones caseras por palabra clave del nombre normalizado. Gana la
#: primera regla que aplique; todas incluyen además «100 g».
PORTIONS = [
    ("arepa", [("1 arepa mediana", 80), ("1 arepa grande", 120)]),
    ("almojabana", [("1 unidad", 60)]), ("pandebono", [("1 unidad", 50)]), ("pan de queso", [("1 unidad", 50)]),
    ("huevo", [("1 huevo", 50), ("2 huevos", 100)]),
    ("arroz blanco, cocido", [("1 taza", 160), ("1 cucharón", 100)]),
    ("arroz", [("1 taza cocida", 160)]),
    ("pasta", [("1 taza cocida", 140)]),
    ("pan", [("1 tajada", 25), ("1 pan pequeño", 40)]),
    ("leche", [("1 vaso", 240), ("1 taza", 240)]),
    ("yogur", [("1 vaso", 200)]), ("kumis", [("1 vaso", 200)]),
    ("queso", [("1 tajada", 30), ("1 porción", 50)]),
    ("cuajada", [("1 porción", 50)]),
    ("frijol", [("1 taza cocido", 170), ("1 cucharón", 120)]),
    ("lenteja", [("1 taza cocida", 200)]), ("garbanzo", [("1 taza cocido", 165)]),
    ("papa criolla", [("1 papa criolla", 25), ("5 papas criollas", 125)]),
    ("papa", [("1 papa mediana", 150)]),
    ("yuca", [("1 porción", 150)]),
    ("platano", [("1 plátano", 200), ("1 tajada", 40)]),
    ("banano", [("1 banano mediano", 120)]),
    ("manzana", [("1 manzana", 180)]), ("naranja", [("1 naranja", 150)]), ("mandarina", [("1 mandarina", 90)]),
    ("pera", [("1 pera", 180)]), ("mango", [("1 mango", 200)]), ("guayaba", [("1 guayaba", 90)]),
    ("aguacate", [("1/2 aguacate", 70), ("1 aguacate", 140)]),
    ("papaya", [("1 taza en cubos", 145)]), ("pina", [("1 taza en cubos", 165)]),
    ("fresa", [("1 taza", 150)]), ("uva", [("1 taza", 150)]), ("sandia", [("1 tajada", 280)]),
    ("pechuga", [("1 porción (palma de la mano)", 120)]),
    ("carne", [("1 porción (palma de la mano)", 120)]),
    ("chorizo", [("1 chorizo", 60)]), ("salchicha", [("1 salchicha", 50)]),
    ("pescado", [("1 filete", 150)]), ("atun", [("1 lata escurrida", 107)]),
    ("tilapia", [("1 filete", 150)]), ("salmon", [("1 filete", 150)]), ("mojarra", [("1 mojarra", 250)]),
    ("aceite", [("1 cucharada", 14), ("1 cucharadita", 5)]),
    ("mantequilla de mani", [("1 cucharada", 16), ("2 cucharadas", 32)]),
    ("mantequilla", [("1 cucharadita", 5), ("1 cucharada", 14)]),
    ("margarina", [("1 cucharadita", 5)]), ("mayonesa", [("1 cucharada", 15)]),
    ("azucar", [("1 cucharadita", 5), ("1 cucharada", 12)]),
    ("miel", [("1 cucharada", 21)]),
    ("avena", [("3 cucharadas", 30), ("1 taza", 80)]),
    ("almendra", [("1 puñado", 30)]), ("mani", [("1 puñado", 30)]), ("nuez", [("1 puñado", 30)]),
    ("cafe", [("1 pocillo", 120), ("1 taza", 240)]),
    ("jugo", [("1 vaso", 240)]),
    ("galleta", [("1 galleta", 10), ("1 paquete", 30)]),
    ("chocolatina", [("1 chocolatina", 30)]),
]

#: Lo que la TCAC no tiene (o no pasó la verificación) y sí está en USDA:
#: (fdc_id, clave, nombre, categoría, sinónimos, porciones).
USDA = [
    (171477, "pechuga_pollo_asada", "Pechuga de pollo sin piel, asada", "aves", ["pollo"], [("1 porción (palma)", 120)]),
    (172388, "muslo_pollo_asado", "Muslo de pollo sin piel, asado", "aves", ["pollo", "pernil"], [("1 muslo", 70)]),
    (174031, "carne_molida_90_asada", "Carne de res molida 90/10, asada", "carnes", ["hamburguesa casera"], [("1 porción", 100)]),
    (171811, "lomo_res_asado", "Lomo de res magro, asado", "carnes", ["solomito"], [("1 porción (palma)", 120)]),
    (168250, "lomo_cerdo_asado", "Lomo de cerdo magro, asado", "carnes", ["cerdo"], [("1 porción (palma)", 120)]),
    (171496, "pechuga_pavo_asada", "Pechuga de pavo, asada", "aves", ["pavo"], [("1 porción", 100)]),
    (173863, "jamon_tajado", "Jamón tajado bajo en grasa", "carnes", ["jamón de cerdo"], [("1 tajada", 20), ("2 tajadas", 40)]),
    (175168, "salmon_cocido", "Salmón, cocido", "pescados", [], [("1 filete", 150)]),
    (175177, "tilapia_cocida", "Tilapia, cocida", "pescados", ["mojarra roja"], [("1 filete", 150)]),
    (175139, "sardinas_aceite", "Sardinas en aceite, escurridas", "pescados", [], [("1 lata", 90)]),
    (173709, "atun_agua_usda", "Atún en agua, escurrido", "pescados", ["atún en lata"], [("1 lata", 107)]),
    (171287, "huevo_entero", "Huevo de gallina entero, crudo", "huevos", ["huevo"], [("1 huevo", 50), ("2 huevos", 100)]),
    (173424, "huevo_cocido", "Huevo de gallina cocido", "huevos", ["huevo duro"], [("1 huevo", 50)]),
    (172183, "clara_huevo", "Clara de huevo", "huevos", ["claras"], [("1 clara", 33)]),
    (171269, "leche_descremada_usda", "Leche descremada", "lacteos", ["leche deslactosada"], [("1 vaso", 245)]),
    (171265, "leche_entera_usda", "Leche entera", "lacteos", [], [("1 vaso", 244)]),
    (170894, "yogur_griego", "Yogur griego natural sin grasa", "lacteos", ["yogurt griego"], [("1 vaso", 170)]),
    (171284, "yogur_natural", "Yogur natural entero", "lacteos", ["yogurt", "kumis"], [("1 vaso", 200)]),
    (170847, "queso_mozzarella_semi", "Queso mozzarella semidescremado", "lacteos", [], [("1 tajada", 28)]),
    (172182, "queso_cottage", "Queso cottage 2 %", "lacteos", [], [("1/2 taza", 113)]),
    (328637, "queso_cheddar", "Queso cheddar", "lacteos", ["queso amarillo"], [("1 tajada", 28)]),
    (2346385, "queso_crema", "Queso crema", "lacteos", [], [("1 cucharada", 15)]),
    (170859, "crema_leche", "Crema de leche", "lacteos", ["crema"], [("1 cucharada", 15)]),
    (173180, "proteina_whey", "Proteína de suero (whey) en polvo", "suplementos", ["whey", "proteína en polvo"], [("1 scoop", 30)]),
    (173177, "proteina_whey_isolate", "Proteína whey aislada en polvo", "suplementos", ["isolate"], [("1 scoop", 29)]),
    (174832, "bebida_almendras", "Bebida de almendras sin azúcar", "bebidas", ["leche de almendras"], [("1 vaso", 240)]),
    (172446, "bebida_soya", "Bebida de soya", "bebidas", ["leche de soya"], [("1 vaso", 240)]),
    (173904, "avena_usda", "Avena en hojuelas, cruda", "cereales", ["oats"], [("3 cucharadas", 30), ("1/2 taza", 40)]),
    (169704, "arroz_integral_cocido", "Arroz integral, cocido", "cereales", [], [("1 taza", 195)]),
    (169737, "pasta_cocida", "Pasta cocida", "cereales", ["espagueti", "macarrones"], [("1 taza", 140)]),
    (172688, "pan_integral_usda", "Pan integral tajado", "cereales", ["pan tajado"], [("1 tajada", 28)]),
    (174924, "pan_blanco_tajado", "Pan blanco tajado", "cereales", ["pan de molde"], [("1 tajada", 25)]),
    (175036, "tortilla_maiz", "Tortilla de maíz", "cereales", [], [("1 tortilla", 26)]),
    (175037, "tortilla_trigo", "Tortilla de trigo", "cereales", ["wrap"], [("1 tortilla", 45)]),
    (171646, "granola", "Granola", "cereales", [], [("1/2 taza", 61)]),
    (174648, "corn_flakes", "Hojuelas de maíz (corn flakes)", "cereales", ["cereal"], [("1 taza", 28)]),
    (168917, "quinua_cocida", "Quinua, cocida", "cereales", ["quinoa"], [("1 taza", 185)]),
    (172746, "galletas_soda", "Galletas de soda", "snacks", ["galletas saladas"], [("1 paquete", 30)]),
    (169999, "mazorca_cocida", "Mazorca dulce, cocida", "verduras", ["choclo", "maíz tierno"], [("1 mazorca", 100)]),
    (170440, "papa_cocida_usda", "Papa sin cáscara, cocida", "tuberculos", ["patata"], [("1 papa mediana", 150)]),
    (168483, "batata_asada", "Batata asada", "tuberculos", ["camote", "boniato"], [("1 batata", 130)]),
    (172421, "lentejas_cocidas", "Lentejas cocidas", "leguminosas", ["lenteja"], [("1 taza", 200)]),
    (175194, "frijol_rojo_cocido", "Fríjol rojo cocido", "leguminosas", ["frijol", "frijoles"], [("1 taza", 177), ("1 cucharón", 120)]),
    (173757, "garbanzos_cocidos", "Garbanzos cocidos", "leguminosas", [], [("1 taza", 164)]),
    (173735, "frijol_negro_cocido", "Fríjol negro cocido", "leguminosas", ["caraota"], [("1 taza", 172)]),
    (172448, "tofu_firme", "Tofu firme", "leguminosas", [], [("1 porción", 100)]),
    (171688, "manzana", "Manzana con cáscara", "frutas", [], [("1 manzana", 180)]),
    (169097, "naranja", "Naranja", "frutas", [], [("1 naranja", 150)]),
    (169910, "mango_usda", "Mango", "frutas", [], [("1 taza", 165)]),
    (169124, "pina", "Piña", "frutas", [], [("1 taza en cubos", 165)]),
    (169926, "papaya", "Papaya", "frutas", [], [("1 taza en cubos", 145)]),
    (167762, "fresa_usda", "Fresas", "frutas", [], [("1 taza", 150)]),
    (174683, "uvas", "Uvas", "frutas", [], [("1 taza", 150)]),
    (169118, "pera", "Pera", "frutas", [], [("1 pera", 180)]),
    (167765, "sandia", "Sandía", "frutas", ["patilla"], [("1 tajada", 280)]),
    (169105, "mandarina", "Mandarina", "frutas", [], [("1 mandarina", 90)]),
    (168153, "kiwi", "Kiwi", "frutas", [], [("1 kiwi", 75)]),
    (171711, "arandanos", "Arándanos", "frutas", [], [("1 taza", 148)]),
    (167746, "limon", "Limón", "frutas", [], [("1 limón", 60)]),
    (173944, "banano_usda", "Banano", "frutas", ["guineo"], [("1 banano mediano", 120)]),
    (171705, "aguacate_usda", "Aguacate", "frutas", ["palta"], [("1/2 aguacate", 70)]),
    (169967, "brocoli_cocido", "Brócoli cocido", "verduras", [], [("1 taza", 156)]),
    (168462, "espinaca", "Espinaca cruda", "verduras", [], [("1 taza", 30)]),
    (169249, "lechuga", "Lechuga", "verduras", [], [("1 taza", 36)]),
    (170457, "tomate_usda", "Tomate", "verduras", [], [("1 tomate", 120)]),
    (170393, "zanahoria", "Zanahoria cruda", "verduras", [], [("1 zanahoria", 60)]),
    (168409, "pepino", "Pepino cohombro", "verduras", ["cohombro"], [("1/2 pepino", 150)]),
    (170000, "cebolla_usda", "Cebolla cabezona", "verduras", [], [("1/2 cebolla", 55)]),
    (170108, "pimenton_rojo", "Pimentón rojo", "verduras", ["pimiento"], [("1/2 pimentón", 60)]),
    (169296, "ahuyama_asada", "Ahuyama asada", "verduras", ["zapallo"], [("1 taza", 205)]),
    (169141, "habichuela_cocida", "Habichuela cocida", "verduras", ["ejotes"], [("1 taza", 125)]),
    (169251, "champinones", "Champiñones", "verduras", [], [("1 taza", 70)]),
    (169986, "coliflor", "Coliflor", "verduras", [], [("1 taza", 107)]),
    (169975, "repollo_usda", "Repollo", "verduras", [], [("1 taza", 89)]),
    (169146, "remolacha_cocida", "Remolacha cocida", "verduras", [], [("1/2 taza", 85)]),
    (169291, "calabacin", "Calabacín", "verduras", ["zucchini"], [("1 taza", 124)]),
    (171413, "aceite_oliva_usda", "Aceite de oliva", "grasas", [], [("1 cucharada", 14)]),
    (172336, "aceite_canola", "Aceite de canola", "grasas", ["aceite vegetal"], [("1 cucharada", 14)]),
    (173410, "mantequilla_sal", "Mantequilla con sal", "grasas", [], [("1 cucharadita", 5)]),
    (172470, "mantequilla_mani_usda", "Mantequilla de maní sin sal", "frutos_secos", ["crema de maní"], [("2 cucharadas", 32)]),
    (170567, "almendras", "Almendras", "frutos_secos", [], [("1 puñado", 30)]),
    (173806, "mani_tostado_usda", "Maní tostado sin sal", "frutos_secos", [], [("1 puñado", 30)]),
    (170187, "nueces", "Nueces", "frutos_secos", [], [("1 puñado", 30)]),
    (170571, "maranon", "Marañón tostado", "frutos_secos", ["cashew", "anacardo"], [("1 puñado", 30)]),
    (170554, "chia", "Semillas de chía", "frutos_secos", [], [("1 cucharada", 12)]),
    (169414, "linaza", "Linaza", "frutos_secos", [], [("1 cucharada", 10)]),
    (171009, "mayonesa_usda", "Mayonesa", "grasas", [], [("1 cucharada", 15)]),
    (171890, "cafe_preparado", "Café negro (tinto) sin azúcar", "bebidas", ["tinto", "café"], [("1 pocillo", 120), ("1 taza", 240)]),
    (173227, "te_negro", "Té preparado sin azúcar", "bebidas", ["té"], [("1 taza", 240)]),
    (169098, "jugo_naranja", "Jugo de naranja natural", "bebidas", [], [("1 vaso", 248)]),
    (168746, "cerveza", "Cerveza", "bebidas", [], [("1 lata", 355), ("1 botella", 330)]),
    (173210, "bebida_energizante", "Bebida energizante", "bebidas", ["energizante"], [("1 lata", 250)]),
    (170880, "leche_chocolatada", "Leche chocolatada semidescremada", "bebidas", [], [("1 caja", 200)]),
    (169655, "azucar_usda", "Azúcar blanca", "dulces", ["azúcar"], [("1 cucharadita", 4), ("1 cucharada", 12)]),
    (169640, "miel", "Miel de abejas", "dulces", [], [("1 cucharada", 21)]),
    (170273, "chocolate_oscuro", "Chocolate oscuro 70-85 %", "dulces", [], [("1 onza", 28)]),
    (167587, "chocolatina_leche", "Chocolatina de leche", "dulces", [], [("1 chocolatina", 30)]),
    (167575, "helado_vainilla", "Helado de vainilla", "dulces", [], [("1 bola", 66)]),
    (169677, "papas_fritas_paquete", "Papas fritas de paquete", "snacks", ["papitas"], [("1 paquete", 30)]),
    (172716, "galletas_chips", "Galletas con chips de chocolate", "snacks", [], [("1 galleta", 16)]),
    (170693, "hamburguesa_sencilla", "Hamburguesa sencilla", "platos", [], [("1 hamburguesa", 110)]),
]

#: Platos colombianos como recetas: (clave, nombre, porciones del plato,
#: ingredientes). Cada ingrediente es (fuente:id, gramos) con fuente `tcac`,
#: `usda` o `agua` (agua del caldo: pesa y no aporta). Son recetas caseras
#: típicas; los valores salen de sumar los ingredientes.
RECIPES = [
    ("bandeja_paisa", "Bandeja paisa", [("1 plato", 735)], [
        ("usda:175194", 200), ("tcac:10", 150), ("usda:174031", 80), ("tcac:549", 60), ("tcac:551", 60),
        ("usda:171287", 50), ("tcac:225", 100), ("tcac:252", 50), ("tcac:5", 60), ("tcac:377", 15)]),
    ("ajiaco", "Ajiaco santafereño", [("1 plato", 530)], [
        ("usda:171477", 80), ("tcac:193", 100), ("tcac:201", 120), ("usda:169999", 60), ("usda:170859", 20),
        ("agua", 150)]),
    ("sancocho_gallina", "Sancocho de gallina", [("1 plato", 620)], [
        ("usda:172388", 100), ("tcac:247", 100), ("tcac:201", 100), ("tcac:228", 60), ("usda:169999", 60),
        ("agua", 200)]),
    ("sancocho_pescado", "Sancocho de pescado", [("1 plato", 600)], [
        ("usda:175177", 120), ("tcac:247", 120), ("tcac:228", 80), ("agua", 280)]),
    ("arepa_queso_rellena", "Arepa con queso", [("1 arepa", 130)], [("tcac:5", 100), ("tcac:638", 30)]),
    ("arepa_huevo", "Arepa de huevo", [("1 arepa", 170)], [("tcac:9", 120), ("usda:171287", 50)]),
    ("calentado", "Calentado (arroz con fríjol y huevo)", [("1 plato", 355)], [
        ("tcac:10", 150), ("usda:175194", 150), ("usda:171287", 50), ("tcac:377", 5)]),
    ("changua", "Changua", [("1 plato", 480)], [("tcac:632", 250), ("usda:171287", 100), ("agua", 100), ("tcac:74", 30)]),
    ("huevos_pericos", "Huevos pericos", [("1 porción", 155)], [
        ("usda:171287", 100), ("tcac:244", 30), ("tcac:150", 20), ("tcac:377", 5)]),
    ("huevo_frito", "Huevo frito", [("1 huevo", 55)], [("usda:171287", 50), ("tcac:377", 5)]),
    ("empanada_carne", "Empanada de carne (frita)", [("1 empanada", 110)], [
        ("tcac:69", 60), ("usda:174031", 25), ("tcac:201", 15), ("tcac:377", 10)]),
    ("patacon", "Patacón", [("1 patacón", 110)], [("tcac:228", 100), ("tcac:377", 10)]),
    ("tajadas_maduro", "Tajadas de plátano maduro fritas", [("1 porción", 108)], [("tcac:225", 100), ("tcac:377", 8)]),
    ("arroz_pollo", "Arroz con pollo", [("1 plato", 255)], [
        ("tcac:10", 150), ("usda:171477", 60), ("usda:170393", 20), ("usda:169999", 20), ("tcac:377", 5)]),
    ("sopa_lentejas", "Sopa de lentejas", [("1 plato", 370)], [
        ("usda:172421", 150), ("tcac:201", 50), ("usda:170393", 20), ("agua", 150)]),
    ("lentejas_arroz", "Lentejas guisadas con arroz", [("1 plato", 355)], [
        ("usda:172421", 180), ("tcac:10", 150), ("tcac:150", 15), ("tcac:377", 10)]),
    ("sudado_pollo", "Sudado de pollo con papa", [("1 plato", 285)], [
        ("usda:172388", 120), ("tcac:201", 100), ("tcac:244", 40), ("tcac:150", 20), ("tcac:377", 5)]),
    ("pollo_asado_papa", "Pollo asado con papa", [("1 plato", 300)], [("usda:172388", 150), ("tcac:201", 150)]),
    ("caldo_costilla", "Caldo de costilla", [("1 plato", 430)], [("tcac:542", 80), ("tcac:201", 100), ("agua", 250)]),
    ("ensalada_mixta", "Ensalada mixta con aceite", [("1 porción", 125)], [
        ("usda:169249", 50), ("usda:170457", 50), ("usda:170000", 20), ("usda:171413", 5)]),
    ("salpicon_frutas", "Salpicón de frutas", [("1 vaso", 250)], [
        ("usda:169926", 50), ("usda:169124", 50), ("usda:173944", 50), ("usda:169098", 50), ("usda:167765", 50)]),
    ("jugo_mora_agua", "Jugo de mora en agua con azúcar", [("1 vaso", 265)], [("tcac:339", 100), ("usda:169655", 15), ("agua", 150)]),
    ("jugo_mora_leche", "Jugo de mora en leche con azúcar", [("1 vaso", 265)], [("tcac:339", 100), ("tcac:632", 150), ("usda:169655", 15)]),
    ("jugo_lulo_agua", "Jugo de lulo en agua con azúcar", [("1 vaso", 265)], [("tcac:321", 100), ("usda:169655", 15), ("agua", 150)]),
    ("jugo_maracuya_agua", "Jugo de maracuyá en agua con azúcar", [("1 vaso", 265)], [("tcac:333", 80), ("usda:169655", 15), ("agua", 170)]),
    ("jugo_guayaba_leche", "Jugo de guayaba en leche con azúcar", [("1 vaso", 265)], [("tcac:309", 100), ("tcac:632", 150), ("usda:169655", 15)]),
    ("avena_leche", "Avena en leche (bebida)", [("1 vaso", 230)], [("tcac:632", 200), ("usda:173904", 20), ("usda:169655", 10)]),
    ("chocolate_leche", "Chocolate en leche", [("1 pocillo", 225)], [("tcac:632", 200), ("tcac:698", 25)]),
    ("agua_panela", "Aguapanela (estimada con azúcar morena)", [("1 vaso", 250)], [("tcac:689", 40), ("agua", 210)]),
    ("tinto_azucar", "Tinto con azúcar", [("1 pocillo", 125)], [("usda:171890", 120), ("usda:169655", 5)]),
    ("perro_caliente", "Perro caliente", [("1 perro", 130)], [
        ("tcac:74", 60), ("tcac:608", 50), ("usda:171009", 10), ("usda:169677", 10)]),
    ("batido_proteina_banano", "Batido de proteína con banano y leche descremada", [("1 batido", 400)], [
        ("usda:173180", 30), ("usda:171269", 250), ("usda:173944", 120)]),
    ("arroz_huevo", "Arroz con huevo", [("1 plato", 205)], [("tcac:10", 150), ("usda:171287", 50), ("tcac:377", 5)]),
    ("carne_asada_arroz_ensalada", "Carne asada con arroz y ensalada", [("1 plato", 375)], [
        ("usda:171811", 120), ("tcac:10", 150), ("usda:169249", 50), ("usda:170457", 50), ("usda:171413", 5)]),
    ("pescado_frito_patacon", "Mojarra frita con patacón y arroz", [("1 plato", 495)], [
        ("usda:175177", 200), ("tcac:228", 100), ("tcac:10", 150), ("tcac:377", 25), ("tcac:252", 20)]),
]
