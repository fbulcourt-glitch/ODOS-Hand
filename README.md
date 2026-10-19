# ODOS-Hand — Odomètre Numérique Intelligent

## 1. Présentation Générale et Objectifs
Le projet **ODOS-Hand** consiste en la conception et la fabrication d'un **odomètre numérique portatif** (curvimètre / roue de mesure à main) de haute précision, logé dans un boîtier ergonomique sur mesure imprimé en 3D (ABS).

### Objectifs principaux :
* **Mesure rapide et précise :** Permettre la mesure de distances linéaires ou courbes par roulement avec une résolution de 2,5 mm et un affichage en centimètres (précision au dixième de centimètre : 0,1 cm).
* **Aide à la mesure répétitive :** Faciliter le report d'une distance cible paramétrable (`targetDistance_mm`) grâce à un double retour :
  1. **Visuel :** Une barre de progression dynamique à l'écran qui s'élargit depuis le centre et clignote une fois la cible atteinte.
  2. **Haptique :** Un moteur vibreur qui s'active progressivement à l'approche de la cible (à partir de 80 % de la distance) et émet des pulsations franches lorsque la consigne est atteinte.
* **Ergonomie « Zéro Interrupteur » :** Fonctionnement instantané à une seule main (« Appuyer pour mesurer, relâcher pour figer ») avec mise en veille profonde automatique pour économiser la batterie.
* **Connectivité Smartphone (BLE) :** Paramétrage de la distance cible et récupération de l'historique des 20 dernières mesures via l'application Web Bluetooth **ODOS-Hand** (PWA) hébergée sur GitHub Pages.

---

## 2. Architecture Matérielle (Hardware)

### 2.1. Microcontrôleur
* **Modèle :** ESP32-C3 SuperMini.
* **Caractéristiques clés :** Architecture RISC-V, ultra-compact, Bluetooth 5.0 (BLE) intégré, gestion native du *Deep Sleep*, régulateur 3,3 V embarqué.

### 2.2. Capteurs de Mesure (Encodeur Magnétique)
* **Composants :** 2x Capteurs à effet Hall bipolaires **SS41F** (boîtier TO-92).
* **Principe :** Lecture en quadrature (déphasage de 90°) d'une couronne d'aimants intégrée à la roue de mesure.
* **Résolution mécanique :** 1 tick = 2,5 mm (0,25 cm).
* **Avantage du décodage en quadrature :** Détection du sens de rotation (avant/arrière) et immunité aux vibrations mécaniques à l'arrêt.

### 2.3. Interface Utilisateur Embarquée
* **Écran :** OLED 0,96" I2C (128 x 64 pixels, contrôleur SSD1306, adresse `0x3C`).
  * *Particularité optique :* Utilisation d'une commande matérielle I2C (`0xA0`) pour corriger l'inversion miroir horizontale liée à l'intégration optique dans le boîtier.
* **Bouton Principal :** Bouton poussoir anti-vandalisme en Inox avec anneau LED RGB intégré.
  * Contact bouton : **Active LOW** (relié au `GND` lors de l'appui, résistance de `PULLUP` interne activée).
  * LED RGB : **Active LOW** (Anode commune sur 3,3 V, pilotage par mise à la masse des cathodes R, G, B).
* **Retour Haptique :** Module vibreur sur PCB (22 x 20 mm) intégrant un moteur plat (*coin motor* Ø 10 x 3 mm), un transistor MOSFET de commande, une résistance et une diode de roue libre.
  * *Installation mécanique :* Face inférieure rigide du PCB collée directement contre la paroi interne du boîtier en ABS pour maximiser le transfert d'énergie vibratoire. Alimenté sur le rail 3,3 V régulé.

### 2.4. Système d'Alimentation et Mesure de Batterie
* **Batterie :** Accumulateur LiPo 3,7 V rechargeable.
* **Chargeur :** Module **TP4056** alimenté via connecteur magnétique / Pogo pins externes.
* **Mesure de tension (Pont diviseur) :**
  * 2 résistances de 100 kΩ en série entre `BAT+` et `GND`.
  * Point milieu connecté à l'entrée analogique `GPIO 4` (ADC1).
  * **Étalonnage de précision :** En raison de l'impédance du pont (100 kΩ) et de la non-linéarité de l'ADC de l'ESP32-C3 (atténuation 11 dB), un facteur de correction logiciel exact de **1,2545** a été déterminé au multimètre de précision (4124,8 mV réels pour 3288 mV lus).
  * Plage de conversion : 3300 mV = 0 % | 4150 mV = 100 %.

---

## 3. Mapping des Broches (Pinout ESP32-C3 SuperMini)

| Broche (GPIO) | Fonction | Direction / Mode | Logique / Détails |
| :--- | :--- | :--- | :--- |
| **GPIO 0** | Capteur Hall A (`PIN_HALL_A`) | `INPUT_PULLUP` | Interruption sur `CHANGE` |
| **GPIO 1** | Capteur Hall B (`PIN_HALL_B`) | `INPUT_PULLUP` | Interruption sur `CHANGE` |
| **GPIO 2** | Bouton Inox (`PIN_BTN`) | `INPUT_PULLUP` | Active `LOW` + Source de réveil *Deep Sleep* |
| **GPIO 3** | LED Rouge (`PIN_LED_R`) | `OUTPUT` | Active `LOW` (`LOW` = Allumée, `HIGH` = Éteinte) |
| **GPIO 4** | Mesure Batterie (`PIN_BAT_ADC`)| `INPUT` (ADC1) | Atténuation 11 dB, Pont diviseur x2 |
| **GPIO 5** | LED Bleue (`PIN_LED_B`) | `OUTPUT` | Active `LOW` |
| **GPIO 6** | Module Vibreur (`PIN_VIB`) | `OUTPUT` (PWM) | Active `HIGH` (`analogWrite` de 0 à 255) |
| **GPIO 8** | I2C SDA (`PIN_SDA`) | I2C Data | Écran OLED SSD1306 |
| **GPIO 9** | I2C SCL (`PIN_SCL`) | I2C Clock | Écran OLED SSD1306 |
| **GPIO 10** | LED Verte (`PIN_LED_G`) | `OUTPUT` | Active `LOW` |

---

## 4. Fonctionnement Logiciel Embarqué (Firmware ODOS-Hand)

### 4.1. Cycle de Mesure Standard
1. **Veille profonde (*Deep Sleep*) :** L'appareil **ODOS-Hand** est totalement éteint (écran éteint, LEDs éteintes, vibreur coupé). Consommation réduite à quelques microampères.
2. **Réveil et Mesure Active :**
   * L'utilisateur appuie et maintient le bouton Inox (`GPIO 2` à `LOW`).
   * L'ESP32 se réveille instantanément, allume la **LED Verte**, remet le compteur à zéro et affiche `0,0 cm`.
   * Tant que le bouton est maintenu enfoncé, le déplacement de la roue incrémente la mesure en temps réel.
3. **Progression Visuelle et Haptique :**
   * **De 0 % à 80 % de la cible :** La barre inférieure grandit proportionnellement. Le vibreur reste à l'arrêt (`PWM = 0`).
   * **De 80 % à 100 % de la cible :** La barre continue de grandir. Le vibreur s'active avec une intensité progressive (rampe PWM de 90 à 255).
   * **À 100 % et au-delà :** La barre de progression clignote (250 ms) et le vibreur émet des pulsations nettes (100 ms ON / 100 ms OFF à `PWM = 255`).
4. **Figeage de la Mesure :**
   * Dès que l'utilisateur relâche le bouton, la **LED Verte** s'éteint, le vibreur se coupe immédiatement et la dernière mesure reste affichée en fixe avec la barre pleine.
   * La mesure est enregistrée dans l'historique interne (mémoire non volatile NVS).
5. **Maintien et Extinction :**
   * L'écran affiche le résultat pendant **60 secondes**.
   * Si l'utilisateur appuie à nouveau sur le bouton pendant ce délai, une nouvelle mesure démarre immédiatement à `0,0 cm`.
   * Sans action au bout de 60 secondes, **ODOS-Hand** retourne en *Deep Sleep*.

### 4.2. Mise en Page Graphique (OLED 128 x 64)
* **Grille fixe anti-sautillement :** Les chiffres sont alignés à droite sur des coordonnées X strictes pour éviter tout décalage visuel lors du passage des dizaines ou des centaines :
  * Centaines : X = 4 | Dizaines : X = 26 | Unités : X = 48 (Police `u8g2_font_logisoso32_tn`).
  * Virgule : X = 68 | Dixièmes : X = 78 (Police `u8g2_font_helvB18_tf`).
  * Unité `cm` : X = 98 (Police `u8g2_font_helvB14_tf`).
* **Indicateur Batterie :** Affiché en pourcentage (`XX%`) en haut à droite (Y = 16, aligné sur X = 126).
* **Barre de progression :** Centrée sur X = 64, position verticale Y = 58, hauteur 4 px, largeur évoluant de 10 px à 114 px.

---

## 5. Spécifications du Mode Bluetooth (BLE) & Application Web

### 5.1. Activation et Comportement Matériel
* **Déclenchement :** **5 clics rapides** sur le bouton Inox.
* **Signalisation d'attente :** L'anneau LED du bouton **clignote en Bleu** tant qu'aucun smartphone n'est connecté (diffusion du nom BLE `ODOS-Hand`).
* **État connecté :** Dès la connexion établie avec l'application, la LED passe au **Bleu fixe**.
* **Sauvegarde NVS (`Preferences.h`) :** La distance cible (`targetDistance_mm`) et le tableau circulaire des **20 dernières mesures** sont stockés en mémoire Flash interne pour survivre au *Deep Sleep*.

### 5.2. Interface de l'Application Web (PWA sur GitHub Pages)
Application monopage (`index.html`) utilisant l'API *Web Bluetooth* (compatible nativement sur Chrome Android / PC, et via l'application *Bluefy* sur iOS) :
* **En-tête principal :**
  * Visuel de l'outil **ODOS-Hand**.
  * Affichage du niveau de batterie en pourcentage (`%`).
  * Bouton principal **« Connect / Disconnect »**.
* **Onglet 1 : « Records » (Historique) :**
  * Liste des 20 dernières mesures effectuées.
  * Bouton **« Sync »** permettant de télécharger et rafraîchir la liste depuis **ODOS-Hand**.
* **Onglet 2 : « Target » (Consigne) :**
  * Champ de saisie numérique permettant d'entrer la nouvelle distance cible en **centimètres (cm)**.
  * Bouton **« Send »** pour transmettre la consigne à l'outil.
  * **Double confirmation de réception :**
    1. *Sur l'application :* Apparition d'un voyant vert de confirmation.
    2. *Sur ODOS-Hand :* **3 vibrations franches** accompagnées de **3 flashs Orange** sur le bouton Inox (combinaison simultanée de `PIN_LED_R` + `PIN_LED_G`).
* **Déconnexion et Fin :**
  * Lorsque l'utilisateur appuie sur **« Disconnect »** dans l'application, **ODOS-Hand** coupe le Bluetooth et bascule immédiatement en **veille profonde (*Deep Sleep*)**, prêt pour sa prochaine mesure sur le terrain.
