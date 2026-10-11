#!/usr/bin/env python3
"""Passt das von 'npx cap add android' erzeugte Projekt an (Version, Icons, fester Signaturschluessel)."""
import os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
RES_SRC = os.path.join(ROOT, 'resources')
# Gleicher fester Debug-Schluessel wie beim Trainingsbuch (liegt in android-app/resources)
KEYSTORE = os.path.join(ROOT, '..', 'android-app', 'resources', 'debug.keystore')
APP = os.path.join(ROOT, 'android', 'app')
MAIN = os.path.join(APP, 'src', 'main')
run = os.environ.get('RUN_NUMBER', '1')

# 1) Versionsnummer = Build-Nummer (damit Updates ueber die alte App installiert werden koennen)
bg = os.path.join(APP, 'build.gradle')
g = open(bg, encoding='utf-8').read()
g, n = re.subn(r'versionCode\s+\d+', 'versionCode ' + run, g, count=1)
assert n == 1, 'versionCode nicht gefunden'
g = re.sub(r'versionName\s+"[^"]*"', 'versionName "1.0.%s"' % run, g, count=1)
open(bg, 'w', encoding='utf-8').write(g)

# 2) Launcher-Icon (Fehler hier sind nicht kritisch)
try:
    big = Image.open(os.path.join(RES_SRC, 'icon-512.png')).convert('RGBA')
    mask = Image.open(os.path.join(RES_SRC, 'icon-maskable-512.png')).convert('RGBA')
    legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    adaptive = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
    for d in legacy:
        folder = os.path.join(MAIN, 'res', 'mipmap-' + d)
        big.resize((legacy[d],) * 2, Image.LANCZOS).save(os.path.join(folder, 'ic_launcher.png'))
        big.resize((legacy[d],) * 2, Image.LANCZOS).save(os.path.join(folder, 'ic_launcher_round.png'))
        mask.resize((adaptive[d],) * 2, Image.LANCZOS).save(os.path.join(folder, 'ic_launcher_foreground.png'))
    px = mask.getpixel((2, 2))
    color = '#%02X%02X%02X' % px[:3]
    colors = os.path.join(MAIN, 'res', 'values', 'ic_launcher_background.xml')
    open(colors, 'w', encoding='utf-8').write(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">%s</color>\n</resources>\n' % color)
except Exception as e:  # noqa
    print('Icon-Anpassung uebersprungen:', e, file=sys.stderr)

# 3) Festen Signaturschluessel direkt in der Gradle-Konfiguration eintragen
ks = os.path.abspath(KEYSTORE).replace('\\', '/')
assert os.path.exists(ks), 'Schluessel nicht gefunden: ' + ks
g = open(bg, encoding='utf-8').read()
block = (
    "    signingConfigs {\n"
    "        debug {\n"
    "            storeFile file('%s')\n"
    "            storePassword 'android'\n"
    "            keyAlias 'androiddebugkey'\n"
    "            keyPassword 'android'\n"
    "        }\n"
    "    }\n" % ks
)
assert re.search(r'^android\s*\{', g, re.M), 'android-Block nicht gefunden'
if 'signingConfigs' not in g:
    g = re.sub(r'^(android\s*\{\s*\n)', lambda m: m.group(1) + block, g, count=1, flags=re.M)
    open(bg, 'w', encoding='utf-8').write(g)
    print('Signaturschluessel eingetragen')

print('Android-Projekt angepasst, Build-Nummer', run)

# 4) Vibration fuer den Timer erlauben
mf = os.path.join(MAIN, 'AndroidManifest.xml')
m = open(mf, encoding='utf-8').read()
if 'android.permission.VIBRATE' not in m:
    m = m.replace('</manifest>', '    <uses-permission android:name="android.permission.VIBRATE" />\n</manifest>', 1)
    open(mf, 'w', encoding='utf-8').write(m)
    print('VIBRATE-Berechtigung eingetragen')
