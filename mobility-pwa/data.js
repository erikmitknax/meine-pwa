/* Mobility Quest – Inhalte: Regionen, Übungen, Programme, Tests, Wissen, Ränge.
   Alles statisch. Änderungen hier kommen ohne neue APK auf dem Handy an. */

/* ---------- Körperregionen ---------- */
const REGIONS = {
  nacken:   { n: "Nacken",        c: "#7fd4ff" },
  schulter: { n: "Schultern",     c: "#ffb347" },
  brust:    { n: "Brust",         c: "#ff6b6b" },
  bws:      { n: "Oberer Rücken", c: "#c792ea" },
  lat:      { n: "Lat / Seite",   c: "#5ce1e6" },
  arme:     { n: "Arme & Hände",  c: "#f7d774" },
  lws:      { n: "Unterer Rücken",c: "#b8a1ff" },
  huefte:   { n: "Hüfte",         c: "#6bff95" },
  adduktor: { n: "Adduktoren",    c: "#9cff6b" },
  hams:     { n: "Beinrückseite", c: "#ff8fd1" },
  quads:    { n: "Oberschenkel vorn", c: "#ff9e6b" },
  wade:     { n: "Wade & Fuß",    c: "#6bd1ff" },
};

const TYPES = {
  dyn:    { n: "Dynamisch",  s: "DYN", d: "Kontrollierte Bewegung durch den Bewegungsumfang. Ideal vor dem Training." },
  stat:   { n: "Statisch",   s: "HOLD", d: "Position halten und entspannen. Ideal nach dem Training oder an Ruhetagen." },
  cars:   { n: "Gelenkkreise", s: "CARS", d: "Langsame, aktive Kreise am Ende des Bewegungsumfangs. Trainiert Kontrolle." },
  pnf:    { n: "Anspannen-Entspannen", s: "PNF", d: "Im Dehnen kurz gegen den Widerstand anspannen, dann tiefer gehen. Sehr effektiv." },
  loaded: { n: "Mit Gewicht", s: "LOAD", d: "Dehnen unter leichter Last. Baut Kraft im Endbereich auf. Für Fortgeschrittene." },
};

/* ---------- Übungen ----------
   u: "s" = Sekunden, "r" = Wiederholungen. v = Standardwert. side = pro Seite. lvl 1–3.
   gym: zu welchem Trainingstag passt sie besonders (push/pull/legs). */
const EXERCISES = [
  // ===== Dynamisch / Aufwärmen =====
  { id: "catcow", n: "Katze-Kuh", r: ["bws", "lws"], t: "dyn", u: "r", v: 10, lvl: 1, gym: ["push", "pull", "legs"],
    steps: ["Vierfüßlerstand: Hände unter den Schultern, Knie unter der Hüfte.", "Einatmen: Bauch sinken lassen, Brust nach vorn, Blick leicht hoch (Kuh).", "Ausatmen: Rücken Wirbel für Wirbel rund machen, Kinn zur Brust (Katze).", "Langsam und fließend wechseln."],
    cues: ["Bewegung aus der ganzen Wirbelsäule, nicht nur aus dem Nacken.", "Arme bleiben gestreckt."], err: ["Zu schnell durchwippen.", "Nur das Hohlkreuz bewegen."], feel: "Ganze Wirbelsäule, wird warm und locker." },
  { id: "armcircle", n: "Armkreisen", r: ["schulter"], t: "dyn", u: "r", v: 10, lvl: 1, gym: ["push", "pull"],
    steps: ["Aufrecht stehen, Arme seitlich gestreckt.", "Klein anfangen und die Kreise langsam größer machen.", "Die Hälfte vorwärts, die Hälfte rückwärts."],
    cues: ["Schultern weg von den Ohren.", "Rippen unten lassen, kein Hohlkreuz."], err: ["Hektisches Schleudern."], feel: "Schultergelenk, wird warm." },
  { id: "dislocate", n: "Schulter-Durchzug (Stab/Band)", r: ["schulter", "brust"], t: "dyn", u: "r", v: 10, lvl: 1, gym: ["push", "pull"],
    steps: ["Besenstiel, Handtuch oder Band weit greifen.", "Mit gestreckten Armen langsam über den Kopf und hinter den Körper führen.", "Und wieder zurück nach vorn.", "Wenn es leicht geht, den Griff etwas enger machen."],
    cues: ["Arme gerade lassen.", "Bauch fest, Rippen nicht nach vorn schieben."], err: ["Griff zu eng – Ellbogen knicken ein.", "Schmerz vorn in der Schulter: Griff breiter."], feel: "Vordere Schulter und Brust." },
  { id: "wallslide", n: "Wandrutschen (Wall Slides)", r: ["schulter", "bws"], t: "dyn", u: "r", v: 10, lvl: 1, gym: ["push", "pull"],
    steps: ["Rücken an die Wand, Füße etwas weg von der Wand.", "Arme in U-Form (90°) an die Wand, Handrücken möglichst an der Wand.", "Arme langsam nach oben schieben, so weit es mit Kontakt geht.", "Wieder runter bis zur U-Form."],
    cues: ["Unterer Rücken bleibt an der Wand.", "Schulterblätter beim Runterziehen bewusst nach unten ziehen."], err: ["Hohlkreuz, um höher zu kommen."], feel: "Oberer Rücken und Schulterblätter arbeiten." },
  { id: "scappush", n: "Schulterblatt-Liegestütz", r: ["schulter", "bws"], t: "dyn", u: "r", v: 10, lvl: 1, gym: ["push"],
    steps: ["Liegestütz-Position (oder auf den Knien).", "Arme bleiben gestreckt.", "Brust absinken lassen, sodass die Schulterblätter zusammengehen.", "Dann vom Boden wegdrücken, Schulterblätter auseinander."],
    cues: ["Nur die Schulterblätter bewegen sich, nicht die Ellbogen."], err: ["Durchhängender Bauch."], feel: "Rund um die Schulterblätter, aktiviert den Sägemuskel." },
  { id: "thread", n: "Faden einfädeln", r: ["bws", "schulter"], t: "dyn", u: "r", v: 8, side: true, lvl: 1, gym: ["push", "pull"],
    steps: ["Vierfüßlerstand.", "Einen Arm zur Decke öffnen, Blick folgt der Hand.", "Dann den Arm unter dem Körper durchfädeln, Schulter Richtung Boden.", "Fließend wechseln."],
    cues: ["Hüfte bleibt über den Knien.", "Drehung kommt aus dem oberen Rücken."], err: ["Hüfte kippt mit."], feel: "Zwischen den Schulterblättern, Rotation des oberen Rückens." },
  { id: "openbook", n: "Offenes Buch", r: ["bws", "brust"], t: "dyn", u: "r", v: 8, side: true, lvl: 1, gym: ["push", "pull"],
    steps: ["Seitlich hinlegen, Knie 90° angewinkelt, Arme gestreckt übereinander.", "Oberen Arm wie eine Buchseite zur anderen Seite öffnen.", "Blick folgt der Hand, 2 Sek. halten, ausatmen.", "Zurück und wiederholen."],
    cues: ["Knie bleiben zusammen am Boden (evtl. Kissen zwischen die Knie).", "Nicht mit Schwung."], err: ["Knie heben ab – dann dreht die Lendenwirbelsäule statt der Brustwirbelsäule."], feel: "Brust und oberer Rücken, Rotation." },
  { id: "wgs", n: "World's Greatest Stretch", r: ["huefte", "bws", "hams"], t: "dyn", u: "r", v: 5, side: true, lvl: 2, gym: ["legs", "pull"],
    steps: ["Großer Ausfallschritt nach vorn, hinteres Knie gestreckt oder am Boden.", "Hand auf der Innenseite des vorderen Fußes abstellen.", "Ellbogen Richtung Fußknöchel senken.", "Dann den Arm zur Decke aufdrehen, Blick folgt.", "Zum Schluss Hüfte nach hinten schieben, vorderes Bein strecken (Beinrückseite)."],
    cues: ["Hinteres Gesäß anspannen – dehnt die Hüftbeuger mehr.", "Langsam, jede Position 2 Sek."], err: ["Vorderes Knie fällt nach innen."], feel: "Hüftbeuger, Leiste, oberer Rücken, Beinrückseite." },
  { id: "legswingfb", n: "Beinschwingen vor/zurück", r: ["huefte", "hams"], t: "dyn", u: "r", v: 12, side: true, lvl: 1, gym: ["legs"],
    steps: ["Seitlich an Wand oder Rack festhalten.", "Äußeres Bein locker vor und zurück schwingen.", "Den Bogen langsam größer werden lassen."],
    cues: ["Oberkörper bleibt ruhig und aufrecht.", "Kontrollierter Schwung, kein Reißen."], err: ["Mit dem Rücken mitschwingen."], feel: "Hüftbeuger vorn, Beinrückseite hinten." },
  { id: "legswingside", n: "Beinschwingen seitlich", r: ["adduktor", "huefte"], t: "dyn", u: "r", v: 12, side: true, lvl: 1, gym: ["legs"],
    steps: ["Frontal zur Wand, beide Hände an der Wand.", "Ein Bein vor dem Standbein seitlich hin und her schwingen."],
    cues: ["Hüfte zeigt nach vorn.", "Standbein leicht gebeugt."], err: ["Becken dreht sich mit."], feel: "Innenseite Oberschenkel und seitliche Hüfte." },
  { id: "kneewall", n: "Knie-zur-Wand-Wippen", r: ["wade"], t: "dyn", u: "r", v: 12, side: true, lvl: 1, gym: ["legs"],
    steps: ["Vor einer Wand in Schrittstellung, vorderer Fuß ca. 5–10 cm von der Wand.", "Knie über die Zehen Richtung Wand schieben, Ferse bleibt am Boden.", "Zurück und wiederholen. Wenn es leicht geht: Fuß weiter weg."],
    cues: ["Knie zeigt über den 2.–3. Zeh.", "Ferse klebt am Boden."], err: ["Ferse hebt ab.", "Knie kippt nach innen."], feel: "Vorderes Sprunggelenk und tiefe Wade. Wichtig für tiefe Kniebeugen." },
  { id: "cossack", n: "Kosaken-Kniebeuge", r: ["adduktor", "huefte", "wade"], t: "dyn", u: "r", v: 6, side: true, lvl: 2, gym: ["legs"],
    steps: ["Sehr breiter Stand, Fußspitzen leicht nach außen.", "Gewicht auf ein Bein verlagern und tief in die Hocke auf dieser Seite gehen.", "Anderes Bein bleibt gestreckt, Zehen dürfen nach oben zeigen.", "Durch die Mitte zur anderen Seite wechseln."],
    cues: ["Ferse des gebeugten Beins bleibt am Boden.", "Brust aufrecht, zum Halten Hände vor die Brust oder an etwas festhalten."], err: ["Nur halb tief gehen und mit Schwung wechseln."], feel: "Innenseite des gestreckten Beins, Hüfte des gebeugten Beins." },
  { id: "squatpry", n: "Tiefe Hocke mit Hebeln", r: ["huefte", "adduktor", "wade"], t: "dyn", u: "s", v: 45, lvl: 1, gym: ["legs"],
    steps: ["In die tiefste Hocke gehen, die du mit Fersen am Boden schaffst (zur Not an etwas festhalten oder Fersen unterlegen).", "Ellbogen innen an die Knie legen und die Knie sanft nach außen drücken.", "Gewicht langsam von links nach rechts und vor und zurück verlagern."],
    cues: ["Brust hoch, ruhig atmen.", "Knie zeigen in Richtung der Zehen."], err: ["Runder unterer Rücken in der tiefsten Position ist okay ohne Gewicht – nur nicht ruckartig."], feel: "Hüfte, Leiste, Sprunggelenke." },
  { id: "inchworm", n: "Raupe (Inchworm)", r: ["hams", "schulter"], t: "dyn", u: "r", v: 6, lvl: 1, gym: ["legs", "push"],
    steps: ["Aus dem Stand mit möglichst gestreckten Beinen nach vorn beugen, Hände auf den Boden.", "Mit den Händen nach vorn laufen bis in die Liegestützposition.", "Mit den Füßen in kleinen Schritten zu den Händen laufen.", "Aufrichten und wiederholen."],
    cues: ["Knie so gerade wie möglich, aber nicht durchgedrückt erzwingen."], err: ["Durchhängender Rücken in der Liegestützposition."], feel: "Beinrückseite, Schultern, Rumpf." },
  { id: "wristrock", n: "Handgelenk-Wippen", r: ["arme"], t: "dyn", u: "r", v: 10, lvl: 1, gym: ["push", "pull"],
    steps: ["Vierfüßlerstand, Hände flach.", "Langsam nach vorn, hinten und zur Seite wippen.", "Dann Hände umdrehen (Finger zeigen zu den Knien) und sanft zurücklehnen.", "Zum Schluss Handrücken auf den Boden, leicht wippen."],
    cues: ["Gewicht dosieren über die Hüfte."], err: ["Zu viel Druck auf einmal."], feel: "Handgelenke und Unterarme. Gut vor Bankdrücken und Klimmzügen." },

  // ===== Gelenkkreise (CARs) =====
  { id: "neckcar", n: "Nacken-Kreise (CARs)", r: ["nacken"], t: "cars", u: "r", v: 3, lvl: 1, gym: ["push", "pull"],
    steps: ["Aufrecht sitzen oder stehen, Faust leicht anspannen.", "Kinn zur Brust, dann sehr langsam Ohr zur Schulter, Blick nach oben, andere Schulter, zurück.", "Pro Richtung 3 langsame Kreise (je ca. 10 Sek.)."],
    cues: ["Langsam ist hier der Punkt.", "Rest des Körpers bewegt sich nicht."], err: ["Kopf nach hinten fallen lassen und schnell kreisen."], feel: "Rund um den Nacken." },
  { id: "shouldercar", n: "Schulter-Kreise (CARs)", r: ["schulter"], t: "cars", u: "r", v: 3, side: true, lvl: 1, gym: ["push", "pull"],
    steps: ["Stehen, freie Hand macht eine Faust und spannt den ganzen Körper leicht an.", "Gestreckten Arm vorn nach oben führen, so weit wie möglich.", "Am höchsten Punkt Daumen nach außen drehen und den Arm hinten herum nach unten führen.", "Langsam zurück in die Ausgangsposition. Dann Richtung umkehren."],
    cues: ["Rumpf dreht nicht mit.", "So groß und so langsam wie möglich."], err: ["Hohlkreuz, um höher zu kommen."], feel: "Kompletter Bewegungsumfang der Schulter." },
  { id: "hipcar", n: "Hüft-Kreise (CARs)", r: ["huefte"], t: "cars", u: "r", v: 3, side: true, lvl: 2, gym: ["legs"],
    steps: ["Vierfüßlerstand oder stehend festhalten.", "Knie nach vorn zur Brust ziehen, dann seitlich nach außen öffnen.", "Nach hinten führen und das Knie unter dem Körper zurück nach vorn bringen.", "Danach Richtung umkehren."],
    cues: ["Becken und Rücken bleiben ruhig.", "Groß, langsam, angespannt."], err: ["Mit dem Rumpf ausgleichen."], feel: "Hüftgelenk in alle Richtungen." },
  { id: "switch9090", n: "90/90-Wechsel", r: ["huefte"], t: "dyn", u: "r", v: 8, side: true, lvl: 1, gym: ["legs"],
    steps: ["Sitzen, beide Knie 90° gebeugt: ein Bein vor dir, eins seitlich hinter dir.", "Hände hinter dir abstützen.", "Beide Knie zur anderen Seite kippen, sodass das Bild gespiegelt ist.", "Ohne Hände: schwieriger."],
    cues: ["Aufrecht sitzen, Brust hoch.", "Langsam ablegen."], err: ["Knie knallen auf den Boden."], feel: "Innen- und Außenrotation der Hüfte." },

  // ===== Statisch: Oberkörper =====
  { id: "doorpec", n: "Brustdehnung im Türrahmen", r: ["brust", "schulter"], t: "stat", u: "s", v: 45, side: true, lvl: 1, gym: ["push"],
    steps: ["Unterarm an den Türrahmen, Ellbogen auf Schulterhöhe.", "Einen Schritt nach vorn machen und den Oberkörper leicht wegdrehen.", "Halten und ruhig atmen."],
    cues: ["Schulter nach hinten-unten, nicht nach vorn wegkippen.", "Ellbogen höher = obere Brust, tiefer = untere Brust."], err: ["Ziehen vorn in der Schulter statt in der Brust: weniger tief gehen."], feel: "Brust, vordere Schulter." },
  { id: "latbench", n: "Lat-Dehnung an der Bank", r: ["lat", "schulter"], t: "stat", u: "s", v: 45, lvl: 1, gym: ["pull"],
    steps: ["Vor eine Bank (oder Stuhl/Sofa) knien.", "Ellbogen auf die Bank, Hände zusammen (mit Stab: Stab in den Händen).", "Hüfte nach hinten schieben und Brust Richtung Boden sinken lassen.", "Für mehr Dehnung Hände hinter den Kopf und Ellbogen zusammen."],
    cues: ["Rippen einziehen, nicht ins Hohlkreuz.", "Ausatmen und tiefer sinken."], err: ["Hohlkreuz statt Schulterdehnung."], feel: "Seitlicher Rücken (Lat), Trizeps, Schulter." },
  { id: "childside", n: "Kindhaltung mit Seitgriff", r: ["lat", "lws"], t: "stat", u: "s", v: 60, lvl: 1, gym: ["pull", "push", "legs"],
    steps: ["Knie breit, Gesäß auf die Fersen sinken lassen.", "Arme lang nach vorn ausstrecken, Stirn ablegen.", "Nach der Hälfte der Zeit beide Hände zur rechten Seite wandern lassen, dann zur linken."],
    cues: ["In den unteren Rücken atmen.", "Schultern sinken lassen."], err: ["Gesäß kommt nicht runter: Kissen auf die Fersen."], feel: "Seitlicher Rücken, unterer Rücken, Schultern." },
  { id: "crossbody", n: "Arm vor der Brust", r: ["schulter"], t: "stat", u: "s", v: 30, side: true, lvl: 1, gym: ["push", "pull"],
    steps: ["Einen Arm gestreckt vor der Brust zur Gegenseite führen.", "Mit dem anderen Unterarm über dem Ellbogen sanft heranziehen."],
    cues: ["Schulter unten lassen, nicht hochziehen.", "Kopf zur Gegenseite drehen verstärkt es."], err: ["Druck direkt auf das Ellbogengelenk."], feel: "Hintere Schulter." },
  { id: "sleeper", n: "Sleeper Stretch", r: ["schulter"], t: "stat", u: "s", v: 30, side: true, lvl: 2, gym: ["push", "pull"],
    steps: ["Auf die Seite legen, unterer Arm 90° vor dem Körper, Ellbogen auf Schulterhöhe.", "Unterarm zeigt zur Decke.", "Mit der anderen Hand den Unterarm sanft Richtung Boden drücken."],
    cues: ["Sehr sanft, nur leichtes Ziehen.", "Etwas nach hinten rollen entlastet."], err: ["Stechender Schmerz vorn in der Schulter – sofort lockerer."], feel: "Hintere Schulterkapsel, Innenrotation." },
  { id: "tricepsoh", n: "Trizeps über Kopf", r: ["arme", "lat"], t: "stat", u: "s", v: 30, side: true, lvl: 1, gym: ["push"],
    steps: ["Arm über den Kopf, Ellbogen beugen, Hand zwischen die Schulterblätter.", "Mit der anderen Hand den Ellbogen sanft hinter den Kopf ziehen.", "Leicht zur Gegenseite neigen verstärkt die Lat-Dehnung."],
    cues: ["Kopf nicht nach vorn drücken lassen.", "Rippen unten."], err: ["Hohlkreuz."], feel: "Trizeps, seitlicher Rücken." },
  { id: "bicepswall", n: "Bizeps an der Wand", r: ["arme", "brust"], t: "stat", u: "s", v: 30, side: true, lvl: 1, gym: ["pull"],
    steps: ["Seitlich zur Wand stellen, Arm gestreckt nach hinten, Handfläche auf Schulterhöhe an die Wand.", "Daumen zeigt nach oben.", "Körper langsam von der Wand wegdrehen."],
    cues: ["Arm bleibt gestreckt.", "Schulter nicht nach vorn kippen lassen."], err: ["Zu tief drehen – Druck vorn in der Schulter."], feel: "Bizeps, vordere Schulter, Brust." },
  { id: "forearm", n: "Unterarm-Dehnung", r: ["arme"], t: "stat", u: "s", v: 30, side: true, lvl: 1, gym: ["pull"],
    steps: ["Arm gestreckt nach vorn, Handfläche nach oben.", "Mit der anderen Hand die Finger sanft nach unten-hinten ziehen (Beuger).", "Dann Handrücken nach oben und Hand nach unten ziehen (Strecker). Zeit aufteilen."],
    cues: ["Ellbogen gestreckt lassen."], err: ["Zu stark ziehen."], feel: "Unterarm innen und außen. Gut nach Klimmzügen und Rudern." },
  { id: "uppertrap", n: "Nacken seitlich", r: ["nacken"], t: "stat", u: "s", v: 30, side: true, lvl: 1, gym: ["push", "pull"],
    steps: ["Aufrecht sitzen, eine Hand unter das Gesäß klemmen oder Schulter bewusst runter.", "Ohr zur anderen Schulter neigen.", "Andere Hand legt sich nur locker auf den Kopf (kaum ziehen)."],
    cues: ["Kinn leicht eingezogen.", "Ein bisschen nach vorn-unten blicken dehnt einen anderen Teil."], err: ["Mit der Hand kräftig ziehen."], feel: "Seitlicher Nacken bis zur Schulter." },
  { id: "deadhang", n: "Passives Hängen", r: ["lat", "schulter", "arme"], t: "stat", u: "s", v: 30, lvl: 1, gym: ["pull"],
    steps: ["An der Klimmzugstange schulterbreit greifen.", "Füße vom Boden oder Knie beugen, Körper hängen lassen.", "Schultern bis zu den Ohren steigen lassen, entspannt atmen."],
    cues: ["Wenn die Hände nicht halten: Füße leicht am Boden lassen.", "Am Ende einmal kurz Schulterblätter runterziehen (aktiv) und loslassen."], err: ["Bei Schulterbeschwerden: Füße am Boden und Last dosieren."], feel: "Lat, Schultern, Wirbelsäule wird entlastet." },
  { id: "bwsroll", n: "Brustwirbel-Strecken über Rolle", r: ["bws"], t: "dyn", u: "r", v: 10, lvl: 1, gym: ["push", "pull"],
    steps: ["Schaumstoffrolle (oder gerolltes Handtuch / Bankkante) quer unter den oberen Rücken.", "Hände hinter dem Kopf, Ellbogen zusammen.", "Über die Rolle nach hinten strecken, Gesäß bleibt am Boden.", "Rolle 2–3 Positionen weiter oben/unten wiederholen."],
    cues: ["Rippen unten, die Bewegung kommt aus der Brustwirbelsäule.", "Nicht auf den unteren Rücken rollen."], err: ["Hohlkreuz im unteren Rücken."], feel: "Oberer Rücken. Gegenmittel zu viel Sitzen und Bankdrücken." },
  { id: "sphinx", n: "Sphinx / Kobra", r: ["lws", "bws"], t: "stat", u: "s", v: 30, lvl: 1, gym: ["pull", "legs"],
    steps: ["Bauchlage, Unterarme unter die Schultern (Sphinx).", "Brust aufrichten, Becken bleibt am Boden.", "Fortgeschritten: Arme strecken (Kobra), so weit es angenehm ist."],
    cues: ["Gesäß locker lassen.", "Schultern weg von den Ohren."], err: ["Stauchendes Gefühl im unteren Rücken – zurück zur Sphinx."], feel: "Bauch, Hüftbeuger, Rückenstreckung." },
  { id: "twist", n: "Liegende Drehung", r: ["lws", "bws", "huefte"], t: "stat", u: "s", v: 45, side: true, lvl: 1, gym: ["pull", "legs"],
    steps: ["Rückenlage, Arme seitlich ausgestreckt.", "Ein Knie anziehen und über den Körper zur Gegenseite sinken lassen.", "Blick zur anderen Seite, Schultern bleiben möglichst am Boden."],
    cues: ["Schwerkraft arbeiten lassen.", "Tief ausatmen."], err: ["Knie runterdrücken."], feel: "Seitlicher Rücken, Gesäß, Brust." },

  // ===== Statisch: Unterkörper =====
  { id: "couch", n: "Couch Stretch", r: ["quads", "huefte"], t: "stat", u: "s", v: 60, side: true, lvl: 2, gym: ["legs"],
    steps: ["Ein Knie vor eine Wand oder Couch, Schienbein an der Wand nach oben (Kissen unter das Knie!).", "Anderes Bein vorn aufstellen.", "Oberkörper langsam aufrichten.", "Gesäß der hinteren Seite fest anspannen und Becken nach vorn kippen."],
    cues: ["Gesäß anspannen ist der wichtigste Teil.", "Zu stark? Knie weiter weg von der Wand."], err: ["Hohlkreuz statt Hüftstreckung."], feel: "Vorderer Oberschenkel und Hüftbeuger. Die Gegenübung zum Sitzen." },
  { id: "hipflexor", n: "Hüftbeuger-Dehnung kniend", r: ["huefte", "quads"], t: "stat", u: "s", v: 45, side: true, lvl: 1, gym: ["legs"],
    steps: ["Kniender Ausfallschritt, hinteres Knie auf weicher Unterlage.", "Becken aufrichten (Schambein Richtung Bauchnabel), Gesäß hinten anspannen.", "Hüfte langsam nach vorn schieben.", "Optional: Arm der hinteren Seite nach oben und leicht zur Gegenseite neigen."],
    cues: ["Lieber wenig Weg mit richtig gekipptem Becken als viel Weg mit Hohlkreuz."], err: ["Hohlkreuz."], feel: "Vorn in der Leiste des hinteren Beins." },
  { id: "pigeon", n: "Taube", r: ["huefte"], t: "stat", u: "s", v: 60, side: true, lvl: 2, gym: ["legs"],
    steps: ["Aus dem Vierfüßlerstand ein Knie nach vorn hinter das Handgelenk bringen, Unterschenkel schräg vor dir.", "Hinteres Bein lang nach hinten ausstrecken.", "Hüfte gerade ausrichten, Oberkörper aufrecht oder nach vorn ablegen."],
    cues: ["Kissen unter die Hüfte der vorderen Seite, falls sie in der Luft hängt.", "Knieschmerz? → lieber 'Liegende 4'."], err: ["Gewicht auf das vordere Knie verdreht."], feel: "Gesäß und äußere Hüfte des vorderen Beins." },
  { id: "fig4", n: "Liegende 4", r: ["huefte"], t: "stat", u: "s", v: 45, side: true, lvl: 1, gym: ["legs"],
    steps: ["Rückenlage, beide Füße aufgestellt.", "Einen Fußknöchel über das andere Knie legen (sieht aus wie eine 4).", "Das untere Bein zur Brust ziehen, Hände hinter den Oberschenkel."],
    cues: ["Kopf und Schultern bleiben am Boden.", "Oberes Knie sanft wegschieben."], err: [], feel: "Gesäß und äußere Hüfte. Knieschonende Alternative zur Taube." },
  { id: "hold9090", n: "90/90 halten", r: ["huefte"], t: "stat", u: "s", v: 60, side: true, lvl: 2, gym: ["legs"],
    steps: ["90/90-Sitz (vorderes und hinteres Knie 90° gebeugt).", "Aufrecht sitzen, dann mit geradem Rücken über das vordere Schienbein lehnen.", "Halten, dann Seite wechseln."],
    cues: ["Brustbein nach vorn, nicht rund werden."], err: ["Gewicht kippt aufs hintere Bein."], feel: "Gesäß vorn, Hüftrotation." },
  { id: "butterfly", n: "Schmetterling", r: ["adduktor"], t: "stat", u: "s", v: 60, lvl: 1, gym: ["legs"],
    steps: ["Sitzen, Fußsohlen zusammen, Knie fallen nach außen.", "Füße mit den Händen halten.", "Mit geradem Rücken nach vorn lehnen."],
    cues: ["Füße weiter weg = andere Dehnung (mehr Rücken und Hüfte)."], err: ["Knie mit den Ellbogen runterdrücken."], feel: "Innenseite der Oberschenkel." },
  { id: "frog", n: "Frosch", r: ["adduktor", "huefte"], t: "stat", u: "s", v: 60, lvl: 2, gym: ["legs"],
    steps: ["Vierfüßlerstand auf weicher Unterlage.", "Knie so weit wie angenehm nach außen schieben, Unterschenkel parallel, Füße zeigen nach außen.", "Auf die Unterarme gehen und Hüfte langsam nach hinten schieben."],
    cues: ["Rücken gerade halten.", "Sehr langsam reingehen, die Dehnung ist intensiv."], err: ["Knie auf hartem Boden."], feel: "Tiefe Innenseite Oberschenkel, Leiste." },
  { id: "straddle", n: "Grätsche im Sitzen", r: ["adduktor", "hams"], t: "stat", u: "s", v: 60, lvl: 2, gym: ["legs"],
    steps: ["Sitzen, Beine so weit wie möglich gestreckt auseinander.", "Zehen zeigen nach oben.", "Mit geradem Rücken das Becken nach vorn kippen, Hände wandern nach vorn."],
    cues: ["Auf ein Kissen sitzen hilft, das Becken zu kippen.", "Bauchnabel nach vorn, nicht Kopf nach unten."], err: ["Runder Rücken statt Hüftbeugung."], feel: "Innen- und Rückseite der Oberschenkel." },
  { id: "seatedfold", n: "Sitzende Vorbeuge", r: ["hams", "lws"], t: "stat", u: "s", v: 45, lvl: 1, gym: ["legs"],
    steps: ["Sitzen, Beine gestreckt zusammen.", "Mit geradem Rücken aus der Hüfte nach vorn beugen.", "Hände an Schienbeine, Füße oder Zehen."],
    cues: ["Knie dürfen leicht gebeugt sein.", "Ausatmen und nachgeben."], err: ["Mit Schwung nach vorn wippen."], feel: "Beinrückseite und unterer Rücken." },
  { id: "hamband", n: "Beinrückseite mit Band (liegend)", r: ["hams"], t: "stat", u: "s", v: 45, side: true, lvl: 1, gym: ["legs"],
    steps: ["Rückenlage, Band oder Handtuch um den Fuß.", "Bein gestreckt nach oben ziehen, anderes Bein bleibt lang am Boden.", "Ferse zur Decke schieben."],
    cues: ["Becken bleibt am Boden.", "Fußspitze zu dir ziehen dehnt zusätzlich die Wade und den Nerv – nicht übertreiben."], err: ["Kribbeln im Bein = Nervendehnung, dann weniger."], feel: "Rückseite Oberschenkel." },
  { id: "pnfham", n: "Beinrückseite PNF", r: ["hams"], t: "pnf", u: "s", v: 60, side: true, lvl: 2, gym: ["legs"],
    steps: ["Wie 'Beinrückseite mit Band' in die Dehnung gehen (ca. 15 Sek.).", "Dann 5–6 Sek. das Bein mit etwa 30 % Kraft gegen das Band nach unten drücken.", "Locker lassen, ausatmen und das Bein ein Stück weiter heranziehen.", "Insgesamt 3 Runden."],
    cues: ["Nur mittlere Kraft beim Anspannen.", "Der Gewinn kommt in der Entspannungsphase."], err: ["Mit voller Kraft anspannen."], feel: "Rückseite Oberschenkel – merklich mehr Bewegung nach jeder Runde." },
  { id: "calfwall", n: "Wade an der Wand (gestreckt)", r: ["wade"], t: "stat", u: "s", v: 45, side: true, lvl: 1, gym: ["legs"],
    steps: ["Hände an die Wand, ein Bein weit nach hinten.", "Hinteres Bein gestreckt, Ferse am Boden, Fuß zeigt gerade nach vorn.", "Hüfte nach vorn schieben."],
    cues: ["Alternative: Fußballen auf eine Stufe, Ferse absinken lassen."], err: ["Fuß dreht nach außen."], feel: "Obere Wade." },
  { id: "soleus", n: "Wade an der Wand (gebeugt)", r: ["wade"], t: "stat", u: "s", v: 45, side: true, lvl: 1, gym: ["legs"],
    steps: ["Wie die gestreckte Wadendehnung, aber hinteres Knie beugen.", "Gewicht nach unten bringen, Ferse bleibt am Boden."],
    cues: ["Kürzerer Schritt als bei der gestreckten Variante."], err: ["Ferse hebt ab."], feel: "Tiefe untere Wade, Achillessehne. Wichtig für die Kniebeuge-Tiefe." },
  { id: "deepsquat", n: "Tiefe Hocke halten", r: ["huefte", "wade", "lws"], t: "stat", u: "s", v: 60, lvl: 1, gym: ["legs"],
    steps: ["Füße etwa schulterbreit, Zehen leicht auswärts.", "So tief wie möglich in die Hocke, Fersen am Boden.", "Festhalten erlaubt (Türrahmen, Rack). Einfach hängen und atmen."],
    cues: ["Jeden Tag ein bisschen bringt mehr als einmal lang.", "Fersen auf eine kleine Erhöhung, wenn es noch nicht geht."], err: [], feel: "Hüfte, Sprunggelenke, unterer Rücken." },

  // ===== Mit Gewicht (Fortgeschritten) =====
  { id: "jefferson", n: "Jefferson Curl", r: ["hams", "lws"], t: "loaded", u: "r", v: 8, lvl: 3, gym: ["legs"],
    steps: ["Auf eine Erhöhung (Bank/Box) stellen, sehr leichtes Gewicht (2–10 kg) oder nur ein Stab.", "Kinn zur Brust und Wirbel für Wirbel nach unten abrollen, Beine gestreckt.", "Unten kurz halten, dann Wirbel für Wirbel langsam wieder aufrollen."],
    cues: ["Sehr leicht anfangen – Ziel ist Kontrolle, nicht Last.", "3 Sek. runter, 3 Sek. hoch."], err: ["Zu schweres Gewicht.", "Bei Bandscheiben-Vorgeschichte weglassen."], feel: "Beinrückseite und gesamter Rücken." },
  { id: "rdlstretch", n: "Langsames RDL mit Dehnpause", r: ["hams"], t: "loaded", u: "r", v: 8, lvl: 2, gym: ["legs"],
    steps: ["Leichte Kurzhanteln oder Stange, hüftbreiter Stand.", "Hüfte nach hinten schieben, Rücken gerade, Gewicht nah an den Beinen.", "Unten 3 Sek. in der Dehnung halten.", "Gesäß anspannen und hochkommen."],
    cues: ["Knie leicht gebeugt.", "Gewicht deutlich leichter als im normalen Training."], err: ["Runder Rücken."], feel: "Beinrückseite. Baut Kraft in der gedehnten Position." },
  { id: "pecfly", n: "Kurzhantel-Fly mit Dehnpause", r: ["brust", "schulter"], t: "loaded", u: "r", v: 8, lvl: 2, gym: ["push"],
    steps: ["Auf der Bank liegen, leichte Kurzhanteln.", "Arme leicht gebeugt nach außen absenken bis zur angenehmen Dehnung.", "Unten 3 Sek. halten, dann zurück."],
    cues: ["Schulterblätter zusammen und unten.", "Leicht! Es geht um die Dehnung."], err: ["Zu tief und zu schwer."], feel: "Brust in gedehnter Position." },
];

/* ---------- Fertige Programme (Quests) ----------
   items: [Übungs-ID, Wert] – Wert in der Einheit der Übung (s oder r). kind: warm | cool | deep | daily */
const PROGRAMS = [
  { id: "warm_push", n: "Push-Aufwärmen", kind: "warm", gym: "push", d: "Vor dem Push-Tag: Schultern, Brustwirbelsäule und Handgelenke bereit fürs Drücken.",
    items: [["catcow", 8], ["armcircle", 10], ["shouldercar", 2], ["dislocate", 10], ["thread", 6], ["scappush", 10], ["wallslide", 8], ["wristrock", 8]] },
  { id: "warm_pull", n: "Pull-Aufwärmen", kind: "warm", gym: "pull", d: "Vor dem Pull-Tag: Schultern über Kopf frei, oberer Rücken mobil, Griff warm.",
    items: [["catcow", 8], ["armcircle", 10], ["shouldercar", 2], ["dislocate", 10], ["openbook", 6], ["deadhang", 20], ["wallslide", 8], ["wristrock", 8]] },
  { id: "warm_legs", n: "Bein-Aufwärmen", kind: "warm", gym: "legs", d: "Vor dem Beintag: Hüfte, Sprunggelenk und Beinrückseite für tiefe Kniebeugen.",
    items: [["legswingfb", 10], ["legswingside", 10], ["wgs", 4], ["kneewall", 10], ["cossack", 5], ["switch9090", 6], ["squatpry", 45]] },
  { id: "cool_push", n: "Push-Abkühlen", kind: "cool", gym: "push", d: "Nach dem Push-Tag: Brust, vordere Schulter und Trizeps entspannen, Brustwirbelsäule strecken.",
    items: [["doorpec", 45], ["tricepsoh", 30], ["crossbody", 30], ["bwsroll", 8], ["uppertrap", 30], ["childside", 60]] },
  { id: "cool_pull", n: "Pull-Abkühlen", kind: "cool", gym: "pull", d: "Nach dem Pull-Tag: Lat, Bizeps und Unterarme lösen.",
    items: [["deadhang", 30], ["latbench", 45], ["bicepswall", 30], ["forearm", 30], ["childside", 60], ["twist", 40]] },
  { id: "cool_legs", n: "Bein-Abkühlen", kind: "cool", gym: "legs", d: "Nach dem Beintag: Hüftbeuger, Gesäß, Beinrückseite, Waden.",
    items: [["couch", 60], ["fig4", 45], ["hamband", 45], ["butterfly", 60], ["soleus", 40]] },
  { id: "rest_full", n: "Ganzkörper-Session", kind: "deep", d: "Ruhetag, ca. 25 Min.: Der komplette Körper einmal durch. Das Herzstück deiner Woche.",
    items: [["catcow", 10], ["neckcar", 2], ["shouldercar", 3], ["hipcar", 3], ["wgs", 5], ["openbook", 8], ["deepsquat", 60], ["couch", 60], ["pigeon", 60], ["hamband", 45], ["butterfly", 60], ["doorpec", 45], ["latbench", 60], ["calfwall", 45], ["twist", 45], ["childside", 60]] },
  { id: "hip_dungeon", n: "Hüft-Dungeon", kind: "deep", d: "Ca. 20 Min. nur Hüfte: für tiefere Kniebeugen und weniger Ziehen im unteren Rücken.",
    items: [["hipcar", 3], ["switch9090", 8], ["hold9090", 60], ["cossack", 6], ["frog", 60], ["pigeon", 75], ["couch", 75], ["deepsquat", 90]] },
  { id: "shoulder_forge", n: "Schulter-Schmiede", kind: "deep", d: "Ca. 15 Min.: Schultern und oberer Rücken – Gegengewicht zu viel Bankdrücken.",
    items: [["shouldercar", 3], ["bwsroll", 10], ["thread", 8], ["wallslide", 10], ["deadhang", 40], ["latbench", 60], ["doorpec", 60], ["sleeper", 30], ["crossbody", 30], ["childside", 60]] },
  { id: "ham_boss", n: "Vorbeuge-Boss", kind: "deep", d: "Ca. 15 Min.: Beinrückseite mit PNF. Ziel: Handflächen auf den Boden.",
    items: [["legswingfb", 12], ["inchworm", 6], ["pnfham", 60], ["seatedfold", 60], ["straddle", 60], ["calfwall", 45], ["rdlstretch", 8]] },
  { id: "ankle_quest", n: "Knöchel-Quest", kind: "deep", d: "Ca. 10 Min.: Sprunggelenk und Waden – damit die Fersen in der Kniebeuge unten bleiben.",
    items: [["kneewall", 15], ["calfwall", 45], ["soleus", 60], ["squatpry", 60], ["cossack", 5], ["deepsquat", 60]] },
  { id: "morning", n: "Morgen-Boot", kind: "daily", d: "8 Min. nach dem Aufstehen. Kein Gerät nötig.",
    items: [["catcow", 10], ["neckcar", 2], ["armcircle", 10], ["wgs", 3], ["deepsquat", 45], ["twist", 30]] },
  { id: "desk", n: "Schreibtisch-Reset", kind: "daily", d: "5 Min. gegen Sitzen: Nacken, Brust, Hüftbeuger.",
    items: [["uppertrap", 30], ["doorpec", 30], ["hipflexor", 40], ["bwsroll", 8]] },
  { id: "evening", n: "Abend-Entspannung", kind: "daily", d: "12 Min. ruhig vor dem Schlafen, alles im Liegen.",
    items: [["childside", 60], ["fig4", 45], ["hamband", 45], ["twist", 45], ["butterfly", 60], ["sphinx", 30]] },
];

/* ---------- Beweglichkeits-Tests (Statuswerte) ----------
   kind "num": Zahl eingeben, score(v) -> 0..100.  kind "pick": Auswahl, Wert = Punkte. */
const TESTS = [
  { id: "toetouch", n: "Zehen berühren", stat: "FLEX", unit: "cm", kind: "num", side: false,
    how: "Stehen, Beine gestreckt (nicht durchdrücken), langsam nach unten beugen. Miss den Abstand Fingerspitzen–Boden. Fingerspitzen über dem Boden = negative Zahl (z. B. −12), am Boden = 0, tiefer (Finger/Handfläche am Boden, Stufe) = positiv.",
    hint: "Gut: 0 cm (Boden). Sehr gut: +10 cm (Handflächen am Boden).", ph: "z. B. -12",
    score: v => clamp(Math.round(60 + v * 2.5), 0, 100) },
  { id: "kneewall", n: "Knie zur Wand", stat: "ANKL", unit: "cm", kind: "num", side: true,
    how: "Fuß vor die Wand, Knie zur Wand schieben, Ferse bleibt am Boden. Fuß so weit wie möglich nach hinten setzen, bei dem das Knie die Wand noch berührt. Miss Zeh–Wand.",
    hint: "Unter 8 cm: eingeschränkt. 10–12 cm: gut. Über 12 cm: sehr gut.", ph: "z. B. 9",
    score: v => clamp(Math.round(v * 8), 0, 100) },
  { id: "squathold", n: "Tiefe Hocke", stat: "HIPS", unit: "s", kind: "num", side: false,
    how: "Ohne Festhalten tief in die Hocke (Oberschenkel unter waagerecht), Fersen am Boden. Wie viele Sekunden kannst du entspannt bleiben?",
    hint: "Ziel: 60 Sekunden. Super: 120 Sekunden.", ph: "z. B. 20",
    score: v => clamp(Math.round(v / 1.2), 0, 100) },
  { id: "thomas", n: "Hüftbeuger (Thomas-Test)", stat: "HIPS", kind: "pick", side: true,
    how: "Auf die Kante eines Tisches/Bettes setzen, nach hinten ablegen und ein Knie fest zur Brust ziehen. Das andere Bein hängt locker. Wie liegt der Oberschenkel des hängenden Beins?",
    opts: [["Schwebt deutlich über der Kante", 25], ["Fast waagerecht", 60], ["Liegt flach oder tiefer, Unterschenkel hängt senkrecht", 100]] },
  { id: "shoulderflex", n: "Arme über Kopf (Wandtest)", stat: "SHLD", kind: "pick", side: false,
    how: "Mit Rücken, Gesäß und Kopf an die Wand stellen, unterer Rücken flach. Arme gestreckt nach oben Richtung Wand führen. Was berührt die Wand?",
    opts: [["Hände kommen nicht in Wandnähe", 25], ["Hände fast an der Wand, nur mit Hohlkreuz", 55], ["Daumen berühren die Wand ohne Hohlkreuz", 100]] },
  { id: "scratch", n: "Hände hinterm Rücken", stat: "SHLD", unit: "cm", kind: "num", side: true,
    how: "Eine Hand von oben über die Schulter, die andere von unten hinter den Rücken. Miss den Abstand der Mittelfinger. Überlappen = negative Zahl. Seite = obere Hand.",
    hint: "Unter 10 cm: okay. Berühren (0): gut. Überlappen: sehr gut.", ph: "z. B. 8",
    score: v => clamp(Math.round(80 - v * 4), 0, 100) },
  { id: "rotation", n: "Brustkorb-Drehung", stat: "SPINE", kind: "pick", side: true,
    how: "Offenes Buch: seitlich liegen, Knie 90° und zusammen. Oberen Arm zur anderen Seite öffnen, Knie bleiben unten. Wo landet die Schulter?",
    opts: [["Arm bleibt deutlich in der Luft", 25], ["Hand fast am Boden", 60], ["Schulterblatt liegt flach am Boden", 100]] },
  { id: "slr", n: "Bein heben (liegend)", stat: "FLEX", kind: "pick", side: true,
    how: "Rückenlage, ein Bein gestreckt am Boden. Das andere Bein gestreckt so weit wie möglich anheben (Becken bleibt unten). Schätze den Winkel.",
    opts: [["Unter 60°", 30], ["60–80°", 65], ["Über 80° (fast senkrecht oder mehr)", 100]] },
];
const STATS = {
  FLEX:  { n: "Beinrückseite", c: "#ff8fd1" },
  HIPS:  { n: "Hüfte",          c: "#6bff95" },
  SHLD:  { n: "Schultern",      c: "#ffb347" },
  SPINE: { n: "Wirbelsäule",    c: "#c792ea" },
  ANKL:  { n: "Sprunggelenk",   c: "#6bd1ff" },
};

/* ---------- Ränge ---------- */
const RANKS = [
  [0, "Steifer Holzfäller"], [80, "Rostiger Ritter"], [250, "Lockerer Knappe"], [550, "Gelenkiger Krieger"],
  [1000, "Mobiler Ranger"], [1700, "Beweglicher Mönch"], [2700, "Gummi-Ninja"], [4000, "Schlangenmensch"], [6000, "Mobility-Legende"],
];

/* ---------- Wissen (Codex) ---------- */
const CODEX = [
  { id: "why", t: "Warum Mobilität?", ico: "!", body: `
<p>Du trainierst 5× pro Woche Kraft. Das ist stark. Kraft ist aber nur in dem Bewegungsumfang nutzbar, den du auch erreichst. Mobilität ist dein <b>Bewegungsspielraum</b> – und den kannst du genauso trainieren wie Muskeln.</p>
<h4>Was du konkret davon hast</h4>
<ul>
<li><b>Bessere Technik im Gym:</b> tiefere Kniebeugen ohne dass die Fersen hochgehen oder der Rücken rund wird, sauberes Drücken über Kopf ohne Hohlkreuz, stabilere Schulterposition beim Bankdrücken.</li>
<li><b>Mehr Muskelreiz:</b> Ein größerer Bewegungsumfang heißt mehr Arbeit in der gedehnten Position – das wird mit gutem Muskelwachstum in Verbindung gebracht.</li>
<li><b>Weniger Ziehen und Steifheit:</b> Viel Push-Training plus Sitzen zieht Schultern nach vorn. Brust, Hüftbeuger und Beinrückseite fühlen sich mit der Zeit „kurz“ an.</li>
<li><b>Gelenke im Alltag:</b> Bücken, über Kopf greifen, auf dem Boden sitzen – Dinge, die mit den Jahren schwerer werden, wenn man sie nicht nutzt.</li>
</ul>
<h4>Ehrlich gesagt</h4>
<p>Dehnen allein ist kein Verletzungsschutz-Zaubertrank – die Studienlage dazu ist gemischt. Was gut belegt ist: Beweglichkeit lässt sich zuverlässig steigern, und Kraft im ganzen Bewegungsumfang macht dich belastbarer. Deshalb kombiniert diese App Dehnen, aktive Mobilität und gezielte Kraft in der gedehnten Position.</p>` },
  { id: "terms", t: "Beweglichkeit vs. Mobilität", ico: "?", body: `
<p><b>Beweglichkeit (Flexibilität)</b> = wie weit ein Gelenk passiv bewegt werden kann – z. B. wie weit dich jemand in eine Dehnung schieben kann.</p>
<p><b>Mobilität</b> = wie viel davon du <i>aktiv und kontrolliert</i> nutzen kannst – mit eigener Muskelkraft.</p>
<p>Beispiel: Du kannst im Liegen dein Bein mit einem Band bis 90° ziehen (Beweglichkeit), aktiv heben schaffst du aber nur 60° (Mobilität). Die Lücke zwischen den beiden ist „ungenutzter“ Bewegungsraum.</p>
<p>Darum gibt es hier beide Arten von Übungen: <b>HOLD</b> (statisches Dehnen) für die Beweglichkeit, <b>DYN</b>, <b>CARS</b> und <b>LOAD</b> für die aktive Kontrolle.</p>` },
  { id: "dose", t: "Wie oft und wie lange?", ico: "⏱", body: `
<h4>Die Faustregeln</h4>
<ul>
<li><b>Haltezeit:</b> 30–60 Sekunden pro Dehnung. Unter 20 Sek. bringt wenig.</li>
<li><b>Pro Muskelgruppe und Einheit:</b> etwa 60 Sekunden insgesamt (z. B. 2 × 30 Sek. oder 1 × 60 Sek.).</li>
<li><b>Häufigkeit:</b> Mindestens 2–3 Mal pro Woche pro Bereich. Täglich ein bisschen wirkt am besten.</li>
<li><b>Wochensumme:</b> Studien deuten darauf hin, dass ab etwa <b>5 Minuten pro Muskelgruppe und Woche</b> deutliche Fortschritte kommen.</li>
<li><b>Intensität:</b> Ein deutliches, aber erträgliches Ziehen – auf einer Skala von 1–10 etwa eine <b>5–7</b>. Kein Schmerz.</li>
</ul>
<h4>Wann sehe ich Ergebnisse?</h4>
<p>Erste Verbesserungen spürst du oft schon nach 1–2 Wochen (vor allem weil dein Nervensystem die Dehnung besser toleriert). Messbare, bleibende Fortschritte brauchen <b>4–8 Wochen</b> regelmäßiges Training. Wenn du aufhörst, geht es langsam wieder zurück – wie bei Kraft.</p>
<h4>Für dich heißt das</h4>
<p>Etwa <b>1,5–2 Stunden pro Woche</b> reichen völlig. Die App verteilt das so: kurz vor und nach jedem Training plus eine längere Einheit am Ruhetag (siehe „Dein Spielplan“).</p>` },
  { id: "when", t: "Vor oder nach dem Training?", ico: "↔", body: `
<h4>Vor dem Training: dynamisch</h4>
<p>5–8 Minuten <b>dynamische</b> Übungen und Gelenkkreise. Sie machen die Gelenke warm und bereiten genau die Bewegungen vor, die gleich kommen. Danach deine normalen Aufwärmsätze mit leichtem Gewicht.</p>
<p>Lange statische Dehnungen (deutlich über 60 Sek. pro Muskel) direkt vor schweren Sätzen können die Maximalkraft kurz leicht senken. Kurzes statisches Dehnen ist vor dem Training okay, wenn es dir hilft, in eine Position zu kommen.</p>
<h4>Nach dem Training: statisch</h4>
<p>Die Muskeln sind warm – ein guter Moment für 5–10 Minuten <b>statisches</b> Dehnen. Bringt Ruhe rein und ist der einfachste Weg, regelmäßig zu dehnen, weil du sowieso schon da bist.</p>
<h4>Separate Einheit</h4>
<p>Die größten Fortschritte machst du mit eigenen Mobility-Sessions an Ruhetagen (15–30 Min.). Davor 3–5 Minuten bewegen (Gehen, Gelenkkreise), damit du warm bist.</p>` },
  { id: "how", t: "So dehnst du richtig", ico: "★", body: `
<ul>
<li><b>Langsam rein</b>, nie wippen oder reißen.</li>
<li><b>Atmen:</b> ruhig durch die Nase, beim Ausatmen bewusst etwas tiefer sinken.</li>
<li><b>Entspannen:</b> Ein Muskel, der Angst hat, lässt nicht los. Kiefer, Schultern und Hände locker.</li>
<li><b>Position vor Tiefe:</b> Lieber wenig Weg in der richtigen Haltung als viel Weg mit Ausweichbewegung (z. B. Hohlkreuz beim Hüftbeuger).</li>
<li><b>PNF (Anspannen-Entspannen):</b> In der Dehnung 5 Sek. mit ca. 30 % Kraft gegen den Widerstand drücken, dann locker lassen und tiefer gehen. Sehr wirkungsvoll.</li>
<li><b>Mit Gewicht:</b> Übungen wie RDLs oder Flys mit Pause in der gedehnten Position bauen Kraft im Endbereich – gut für dich als Kraftsportler.</li>
<li><b>Konstanz schlägt Intensität.</b> 10 Minuten täglich bringen mehr als 1 Stunde am Sonntag.</li>
</ul>` },
  { id: "split", t: "Dein Push/Pull/Beine-Split", ico: "⚔", body: `
<h4>Push (2×/Woche)</h4>
<p>Brust, vordere Schulter und Trizeps arbeiten viel. Typische Folge: Schultern ziehen nach vorn, der obere Rücken wird rund und steif. <b>Ausgleich:</b> Brustdehnung, Brustwirbelsäule strecken und drehen, Schulter-Innenrotation (Sleeper), Wand-Rutschen.</p>
<h4>Pull (2×/Woche)</h4>
<p>Lat, Bizeps und Unterarme. Ein steifer Lat begrenzt die Arme über Kopf und führt zu Hohlkreuz beim Überkopfdrücken. <b>Ausgleich:</b> Lat-Dehnung an der Bank, passives Hängen, Bizeps- und Unterarmdehnung.</p>
<h4>Beine (1×/Woche)</h4>
<p>Für tiefe, saubere Kniebeugen brauchst du vor allem <b>Sprunggelenk</b> (Knie über die Zehen), <b>Hüfte</b> (Beugung und Rotation) und lockere <b>Adduktoren</b>. Hüftbeuger und vordere Oberschenkel sind vom Sitzen oft kurz. <b>Ausgleich:</b> Couch Stretch, Taube, Knie-zur-Wand, tiefe Hocke.</p>
<h4>Achtung Ungleichgewicht</h4>
<p>Bei nur einem Beintag pro Woche bekommen Hüfte und Beine weniger Aufmerksamkeit. Deine Ruhetag-Sessions legen deshalb extra Gewicht auf die untere Körperhälfte.</p>` },
  { id: "measure", t: "Fortschritt messen", ico: "▲", body: `
<p>Gefühl täuscht. Mach alle <b>4 Wochen</b> die Tests unter „Status“ – immer zur gleichen Tageszeit und aufgewärmt. Dann siehst du schwarz auf weiß, was sich bewegt.</p>
<p>Aus den Tests berechnet die App deine fünf Statuswerte (Beinrückseite, Hüfte, Schultern, Wirbelsäule, Sprunggelenk). Der schwächste Wert ist dein nächster „Boss“ – darauf solltest du dich konzentrieren.</p>` },
  { id: "myths", t: "Mythen", ico: "✗", body: `
<ul>
<li><b>„Dehnen verhindert Muskelkater.“</b> – Kaum. Der Effekt ist sehr klein.</li>
<li><b>„Dehnen macht schwach und langsam.“</b> – Langfristig nicht. Nur sehr lange statische Dehnungen direkt vor Maximalkraft können kurzfristig etwas kosten.</li>
<li><b>„Muskeln werden durch Dehnen länger.“</b> – Teilweise. Ein Großteil des schnellen Fortschritts ist erhöhte Dehntoleranz – dein Nervensystem erlaubt mehr. Langfristig passt sich auch das Gewebe an.</li>
<li><b>„Krafttraining macht unbeweglich.“</b> – Nein. Krafttraining durch den vollen Bewegungsumfang verbessert die Beweglichkeit sogar. Halbe Wiederholungen tun das nicht.</li>
<li><b>„Ich bin halt einfach steif.“</b> – Genetik spielt eine Rolle, aber fast jeder kann sich deutlich verbessern.</li>
</ul>` },
  { id: "safety", t: "Sicherheit", ico: "+", body: `
<ul>
<li><b>Ziehen ist okay, Schmerz nicht.</b> Stechend, brennend oder im Gelenk statt im Muskel: sofort lockerer.</li>
<li><b>Kribbeln oder Taubheit</b> (z. B. bei Beinrückseite-Dehnungen) heißt, ein Nerv wird gedehnt. Fußspitze locker lassen und weniger tief.</li>
<li><b>Gelenke nicht erzwingen</b> – vor allem Knie bei Taube und Schulter beim Sleeper Stretch.</li>
<li>Bei Verletzungen, Bandscheibenproblemen oder anhaltenden Schmerzen: erst mit Arzt oder Physiotherapeut abklären.</li>
</ul>
<p class="small muted">Diese App ersetzt keine medizinische Beratung.</p>` },
];

/* Standard-Wochenplan: Mo Push, Di Pull, Mi Beine, Do Push, Fr Pull, Sa+So Ruhe. Index 0 = Montag. */
const DEFAULT_GYM = ["push", "pull", "legs", "push", "pull", "rest", "rest"];
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WEEKDAYS_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const GYM_LABEL = { push: "Push", pull: "Pull", legs: "Beine", rest: "Ruhetag" };

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
