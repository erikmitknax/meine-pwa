#!/usr/bin/env python3
"""Passt das von 'npx cap add android' erzeugte Projekt an:
Version, Icons, fester Signaturschluessel und das Benachrichtigungs-Plug-in (lautlos, bleibt bis "Erledigt",
kommt nach dem Wegwischen nach 15 Minuten wieder)."""
import os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
RES_SRC = os.path.join(ROOT, 'resources')
# Gleicher fester Debug-Schluessel wie bei den anderen Apps (liegt in android-app/resources)
KEYSTORE = os.path.join(ROOT, '..', 'android-app', 'resources', 'debug.keystore')
APP = os.path.join(ROOT, 'android', 'app')
MAIN = os.path.join(APP, 'src', 'main')
run = os.environ.get('RUN_NUMBER', '1')
PKG = 'io.github.erikmitknax.aufgaben'

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

# 4) Manifest: Benachrichtigungs-Berechtigung, Neustart-Empfaenger, Widget
mf = os.path.join(MAIN, 'AndroidManifest.xml')
m = open(mf, encoding='utf-8').read()
assert '</application>' in m and '</manifest>' in m, 'Manifest unerwartet'
receiver = (
    '        <receiver android:name="%s.AufgabenReceiver" android:exported="false">\n'
    '            <intent-filter>\n'
    '                <action android:name="android.intent.action.BOOT_COMPLETED" />\n'
    '            </intent-filter>\n'
    '        </receiver>\n'
    '        <receiver android:name="%s.AufgabenWidget" android:exported="false">\n'
    '            <intent-filter>\n'
    '                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n'
    '            </intent-filter>\n'
    '            <meta-data android:name="android.appwidget.provider" android:resource="@xml/aufgaben_widget_info" />\n'
    '        </receiver>\n' % (PKG, PKG)
)
perms = (
    '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n'
    '    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />\n'
)
m = m.replace('</application>', receiver + '    </application>', 1)
m = m.replace('</manifest>', perms + '</manifest>', 1)
open(mf, 'w', encoding='utf-8').write(m)
print('Manifest angepasst')

# 5) Widget-Ressourcen (Startbildschirm und Sperrbildschirm)
for sub in ('layout', 'drawable', 'xml'):
    os.makedirs(os.path.join(MAIN, 'res', sub), exist_ok=True)


def write_res(sub, name, text):
    open(os.path.join(MAIN, 'res', sub, name), 'w', encoding='utf-8').write(text)


write_res('drawable', 'aufgaben_widget_bg.xml', """<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#E61F1D1A" />
    <corners android:radius="22dp" />
</shape>
""")

rows = ''
for i in range(1, 6):
    rows += """    <LinearLayout
        android:id="@+id/row%d"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="2dp"
        android:gravity="center_vertical"
        android:orientation="horizontal">
        <TextView
            android:id="@+id/d%d"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:paddingRight="8dp"
            android:text="\u25cf"
            android:textSize="14sp" />
        <TextView
            android:id="@+id/t%d"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:ellipsize="end"
            android:maxLines="1"
            android:textColor="#FFFFFF"
            android:textSize="15sp" />
        <TextView
            android:id="@+id/c%d"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:paddingLeft="14dp"
            android:paddingTop="6dp"
            android:paddingRight="4dp"
            android:paddingBottom="6dp"
            android:text="✓"
            android:textColor="#7FD6BF"
            android:textSize="22sp"
            android:textStyle="bold" />
    </LinearLayout>
""" % (i, i, i, i)

write_res('layout', 'aufgaben_widget.xml', """<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/aufgaben_widget_bg"
    android:orientation="vertical"
    android:padding="14dp">
    <TextView
        android:id="@+id/header"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Aufgaben"
        android:textColor="#9FA39B"
        android:textSize="13sp"
        android:textStyle="bold" />
    <TextView
        android:id="@+id/empty"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:paddingTop="6dp"
        android:text="Alles erledigt ✓"
        android:textColor="#FFFFFF"
        android:textSize="16sp" />
""" + rows + """    <TextView
        android:id="@+id/more"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:paddingTop="4dp"
        android:textColor="#9FA39B"
        android:textSize="12sp" />
</LinearLayout>
""")

write_res('layout', 'aufgaben_notif.xml', """<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/nroot"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:gravity="center_vertical"
    android:orientation="horizontal"
    android:padding="12dp">
    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:orientation="vertical">
        <TextView
            android:id="@+id/ntitle"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:ellipsize="end"
            android:maxLines="2"
            android:textSize="15sp"
            android:textStyle="bold" />
        <TextView
            android:id="@+id/nsub"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="Offen"
            android:textSize="12sp" />
    </LinearLayout>
    <TextView
        android:id="@+id/ndone"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:paddingBottom="8dp"
        android:paddingLeft="14dp"
        android:paddingTop="8dp"
        android:text="\u2713 Erledigt"
        android:textSize="15sp"
        android:textStyle="bold" />
</LinearLayout>
""")

write_res('xml', 'aufgaben_widget_info.xml', """<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:initialLayout="@layout/aufgaben_widget"
    android:minWidth="250dp"
    android:minHeight="110dp"
    android:minResizeWidth="180dp"
    android:minResizeHeight="80dp"
    android:resizeMode="horizontal|vertical"
    android:targetCellWidth="4"
    android:targetCellHeight="2"
    android:updatePeriodMillis="0"
    android:widgetCategory="home_screen|keyguard" />
""")
print('Widget-Ressourcen angelegt')

# 6) Java: Speicher, Wiederholung, Benachrichtigungen, Empfaenger, Widget, Plug-in, MainActivity
jdir = os.path.join(MAIN, 'java', *PKG.split('.'))
assert os.path.isdir(jdir), 'Java-Ordner fehlt: ' + jdir


def write_java(name, src):
    open(os.path.join(jdir, name + '.java'), 'w', encoding='utf-8').write(src.replace('PKG', PKG))


write_java('Recur', r"""package PKG;

import java.util.Calendar;

/** Naechster Termin einer Wiederholung (gleiche Uhrzeit, Ortszeit) - gleiche Regeln wie in der Seite. */
final class Recur {
    private Recur() {}

    static long next(long due, String rep, long now) {
        long base = Math.max(now, due);
        long d = due;
        for (int i = 0; i < 5000; i++) {
            d = add(d, rep);
            if (d > base) break;
        }
        return d;
    }

    private static long add(long ms, String rep) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        if ("weekly".equals(rep)) {
            c.add(Calendar.DAY_OF_MONTH, 7);
        } else if ("monthly".equals(rep)) {
            c.add(Calendar.MONTH, 1);
        } else if ("weekdays".equals(rep)) {
            do {
                c.add(Calendar.DAY_OF_MONTH, 1);
            } while (c.get(Calendar.DAY_OF_WEEK) == Calendar.SATURDAY || c.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY);
        } else {
            c.add(Calendar.DAY_OF_MONTH, 1);
        }
        return c.getTimeInMillis();
    }
}
""")

write_java('NStore', r"""package PKG;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** Kleiner Speicher der Aufgaben auf der Android-Seite (damit Erinnerungen auch ohne offene App klappen). */
final class NStore {
    private NStore() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences("aufgaben_native", Context.MODE_PRIVATE);
    }

    static JSONArray tasks(Context c) {
        try {
            return new JSONArray(p(c).getString("tasks", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static void saveTasks(Context c, JSONArray a) {
        p(c).edit().putString("tasks", a.toString()).apply();
    }

    static JSONObject find(Context c, String id) {
        JSONArray a = tasks(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) return o;
        }
        return null;
    }

    static void remove(Context c, String id) {
        JSONArray a = tasks(c);
        JSONArray out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && !id.equals(o.optString("id"))) out.put(o);
        }
        saveTasks(c, out);
    }

    /** Zeitpunkt, vor dem die Aufgabe nicht wieder angezeigt wird (nach dem Wegwischen). */
    static void setNext(Context c, String id, long next) {
        update(c, id, -1, next);
    }

    /** Neuer Termin (due >= 0) und/oder neue "nicht vor"-Zeit (next >= 0). */
    static void update(Context c, String id, long due, long next) {
        JSONArray a = tasks(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) {
                try {
                    if (due >= 0) o.put("due", due);
                    if (next >= 0) o.put("next", next);
                } catch (Exception ignored) {
                    // egal
                }
            }
        }
        saveTasks(c, a);
    }

    /** Einstellung: nach dem Wegwischen wiederkommen nach ... (Standard 15 Minuten). */
    static long repeatMs(Context c) {
        long v = p(c).getLong("repeatMs", 15L * 60L * 1000L);
        return v < 60000L ? 15L * 60L * 1000L : v;
    }

    static void setRepeatMs(Context c, long ms) {
        if (ms >= 60000L) p(c).edit().putLong("repeatMs", ms).apply();
    }

    private static JSONArray doneList(Context c) {
        try {
            return new JSONArray(p(c).getString("done", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** In der Benachrichtigung oder im Widget abgehakt: merken, bis die Seite es abholt.
        due = neuer Termin bei Wiederholung, sonst 0. */
    static void addDone(Context c, String id, long ts, long due) {
        JSONArray d = doneList(c);
        try {
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("ts", ts);
            o.put("due", due);
            d.put(o);
        } catch (Exception ignored) {
            // egal
        }
        p(c).edit().putString("done", d.toString()).apply();
    }

    static JSONArray pendingDone(Context c) {
        return doneList(c);
    }

    static JSONArray takeDone(Context c) {
        JSONArray d = doneList(c);
        p(c).edit().putString("done", "[]").apply();
        return d;
    }
}
""")

write_java('Notifier', r"""package PKG;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.Icon;
import android.service.notification.StatusBarNotification;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

final class Notifier {
    private Notifier() {}

    static final String CHANNEL = "aufgaben_leise";
    static final String ACT_DONE = "PKG.DONE";
    static final String ACT_DISMISSED = "PKG.DISMISSED";
    static final String ACT_SHOW = "PKG.SHOW";
    // Nach dem Wegwischen kommt die Aufgabe nach dieser Zeit zurueck
    static final long REPEAT_MS = 15L * 60L * 1000L;

    static int nid(String id) {
        return id.hashCode();
    }

    private static void ensureChannel(Context c) {
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Aufgaben (lautlos)", NotificationManager.IMPORTANCE_LOW);
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    private static PendingIntent receiverIntent(Context c, String action, String id, int slot) {
        Intent i = new Intent(c, AufgabenReceiver.class).setAction(action).putExtra("id", id);
        return PendingIntent.getBroadcast(c, nid(id) * 4 + slot, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** "Erledigt": gleicher Knopf in Benachrichtigung und Widget. */
    static PendingIntent doneIntent(Context c, String id) {
        return receiverIntent(c, ACT_DONE, id, 0);
    }

    /** Zeigt die Benachrichtigung: lautlos, "laufend". Mit Kategorie ist der Inhalt komplett in deren Farbe. */
    static void show(Context c, String id, String title, String colorHex) {
        ensureChannel(c);

        PendingIntent open = null;
        Intent launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (launch != null) {
            open = PendingIntent.getActivity(c, nid(id) * 4 + 3, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        Notification.Builder b = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_menu_agenda)
                .setContentTitle(title)
                .setContentText("Offen \u2013 mit \u201eErledigt\u201c abhaken")
                .setCategory(Notification.CATEGORY_REMINDER)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setDeleteIntent(receiverIntent(c, ACT_DISMISSED, id, 1));

        int color = 0;
        boolean colored = false;
        if (colorHex != null && !colorHex.isEmpty()) {
            try {
                color = Color.parseColor(colorHex);
                colored = true;
            } catch (Exception ignored) {
                colored = false;
            }
        }

        if (colored) {
            double lum = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255.0;
            int tx = lum > 0.6 ? 0xFF111111 : 0xFFFFFFFF;
            RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.aufgaben_notif);
            rv.setInt(R.id.nroot, "setBackgroundColor", color);
            rv.setTextViewText(R.id.ntitle, title);
            rv.setTextColor(R.id.ntitle, tx);
            rv.setTextColor(R.id.nsub, tx);
            rv.setTextColor(R.id.ndone, tx);
            rv.setOnClickPendingIntent(R.id.ndone, doneIntent(c, id));
            b.setColor(color)
                    .setColorized(true)
                    .setStyle(new Notification.DecoratedCustomViewStyle())
                    .setCustomContentView(rv);
        } else {
            Notification.Action done = new Notification.Action.Builder(
                    Icon.createWithResource(c, android.R.drawable.checkbox_on_background),
                    "Erledigt",
                    doneIntent(c, id)).build();
            b.addAction(done);
        }
        if (open != null) b.setContentIntent(open);

        c.getSystemService(NotificationManager.class).notify(nid(id), b.build());
    }

    static boolean isShown(Context c, String id) {
        for (StatusBarNotification s : c.getSystemService(NotificationManager.class).getActiveNotifications()) {
            if (s.getId() == nid(id)) return true;
        }
        return false;
    }

    /** Plant, dass die Aufgabe zur angegebenen Zeit (wieder) erscheint. */
    static void schedule(Context c, String id, long atMillis) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, receiverIntent(c, ACT_SHOW, id, 2));
    }

    static void cancelAlarm(Context c, String id) {
        c.getSystemService(AlarmManager.class).cancel(receiverIntent(c, ACT_SHOW, id, 2));
    }

    static void cancelNotification(Context c, String id) {
        c.getSystemService(NotificationManager.class).cancel(nid(id));
    }

    /** Alles wiederherstellen (nach Neustart): Faelliges zeigen, Kuenftiges planen. */
    static void restore(Context c) {
        long now = System.currentTimeMillis();
        JSONArray a = NStore.tasks(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject t = a.optJSONObject(i);
            if (t == null) continue;
            String id = t.optString("id");
            long at = Math.max(t.optLong("due", 0), t.optLong("next", 0));
            if (at <= now) show(c, id, t.optString("title"), t.optString("color", "")); else schedule(c, id, at);
        }
        AufgabenWidget.refreshAll(c);
    }
}
""")

write_java('AufgabenReceiver', r"""package PKG;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

public class AufgabenReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String action = i.getAction();
        String id = i.getStringExtra("id");

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            Notifier.restore(c);
            return;
        }
        if (id == null) return;

        if (Notifier.ACT_DONE.equals(action)) {
            // Abgehakt (Benachrichtigung oder Widget). Wiederholende Aufgaben rutschen auf den naechsten Termin,
            // die anderen verschwinden. Die Seite holt es beim naechsten Oeffnen ab und gleicht mit Firebase ab.
            JSONObject t = NStore.find(c, id);
            long now = System.currentTimeMillis();
            String rep = t == null ? "" : t.optString("rep", "");
            Notifier.cancelAlarm(c, id);
            Notifier.cancelNotification(c, id);
            if (t != null && !rep.isEmpty()) {
                long nd = Recur.next(t.optLong("due"), rep, now);
                NStore.update(c, id, nd, 0);
                Notifier.schedule(c, id, nd);
                NStore.addDone(c, id, now, nd);
            } else {
                NStore.remove(c, id);
                NStore.addDone(c, id, now, 0);
            }
        } else if (Notifier.ACT_DISMISSED.equals(action)) {
            // Weggewischt: in 15 Minuten wieder anzeigen, falls noch offen
            JSONObject cur = NStore.find(c, id);
            if (cur != null) {
                // Eigene Zeit der Aufgabe, sonst die Einstellung fuer alle
                long own = cur.optLong("snooze", 0) * 60000L;
                long next = System.currentTimeMillis() + (own >= 60000L ? own : NStore.repeatMs(c));
                NStore.setNext(c, id, next);
                Notifier.schedule(c, id, next);
            }
        } else if (Notifier.ACT_SHOW.equals(action)) {
            JSONObject t = NStore.find(c, id);
            if (t != null) {
                NStore.setNext(c, id, 0);
                Notifier.show(c, id, t.optString("title"), t.optString("color", ""));
            }
        }
        AufgabenWidget.refreshAll(c);
    }
}
""")

write_java('AufgabenWidget', r"""package PKG;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Widget fuer Start- und Sperrbildschirm: offene Aufgaben mit Haken zum Abhaken. */
public class AufgabenWidget extends AppWidgetProvider {
    private static final int MAX = 5;

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static void refreshAll(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new ComponentName(c, AufgabenWidget.class));
            if (ids == null) return;
            for (int id : ids) m.updateAppWidget(id, build(c));
        } catch (Exception ignored) {
            // Widget ist optional
        }
    }

    private static String when(long due, long now) {
        boolean sameDay = new SimpleDateFormat("yyyyMMdd", Locale.GERMANY).format(new Date(due))
                .equals(new SimpleDateFormat("yyyyMMdd", Locale.GERMANY).format(new Date(now)));
        return new SimpleDateFormat(sameDay ? "HH:mm" : "dd.MM. HH:mm", Locale.GERMANY).format(new Date(due));
    }

    static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.aufgaben_widget);
        final int[] rows = {R.id.row1, R.id.row2, R.id.row3, R.id.row4, R.id.row5};
        final int[] titles = {R.id.t1, R.id.t2, R.id.t3, R.id.t4, R.id.t5};
        final int[] checks = {R.id.c1, R.id.c2, R.id.c3, R.id.c4, R.id.c5};
        final int[] dots = {R.id.d1, R.id.d2, R.id.d3, R.id.d4, R.id.d5};

        List<JSONObject> list = new ArrayList<>();
        JSONArray a = NStore.tasks(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null) list.add(o);
        }
        Collections.sort(list, new Comparator<JSONObject>() {
            @Override
            public int compare(JSONObject x, JSONObject y) {
                return Long.compare(x.optLong("due"), y.optLong("due"));
            }
        });

        long now = System.currentTimeMillis();
        for (int i = 0; i < MAX; i++) {
            if (i < list.size()) {
                JSONObject t = list.get(i);
                String id = t.optString("id");
                long due = t.optLong("due");
                String label = t.optString("title") + (due > now ? "  · " + when(due, now) : "");
                v.setViewVisibility(rows[i], View.VISIBLE);
                v.setTextViewText(titles[i], label);
                int dotColor = 0;
                try {
                    String col = t.optString("color", "");
                    if (!col.isEmpty()) dotColor = Color.parseColor(col);
                } catch (Exception ignored) {
                    dotColor = 0;
                }
                if (dotColor != 0) {
                    double lum = (0.299 * Color.red(dotColor) + 0.587 * Color.green(dotColor) + 0.114 * Color.blue(dotColor)) / 255.0;
                    v.setViewVisibility(dots[i], View.VISIBLE);
                    // Schwarz waere auf dem dunklen Widget unsichtbar: dann hellgrau
                    v.setTextColor(dots[i], lum < 0.25 ? 0xFF8A8A8A : dotColor);
                } else {
                    v.setViewVisibility(dots[i], View.GONE);
                }
                v.setOnClickPendingIntent(checks[i], Notifier.doneIntent(c, id));
            } else {
                v.setViewVisibility(rows[i], View.GONE);
            }
        }
        v.setViewVisibility(R.id.empty, list.isEmpty() ? View.VISIBLE : View.GONE);
        if (list.size() > MAX) {
            v.setViewVisibility(R.id.more, View.VISIBLE);
            v.setTextViewText(R.id.more, "+" + (list.size() - MAX) + " weitere");
        } else {
            v.setViewVisibility(R.id.more, View.GONE);
        }

        Intent launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (launch != null) {
            PendingIntent open = PendingIntent.getActivity(c, 7, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            v.setOnClickPendingIntent(R.id.header, open);
        }
        return v;
    }
}
""")

write_java('AufgabenPlugin', r"""package PKG;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

@CapacitorPlugin(name = "AufgabenNative")
public class AufgabenPlugin extends Plugin {

    private boolean granted() {
        if (Build.VERSION.SDK_INT < 33) return true;
        return getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    /** Die Seite gibt die aktuelle Liste offener Aufgaben; hier werden Benachrichtigungen, Alarme und Widget angepasst. */
    @PluginMethod
    public void setTasks(PluginCall call) {
        JSArray arr = call.getArray("tasks");
        if (arr == null) {
            call.reject("tasks fehlt");
            return;
        }
        Context c = getContext();
        try {
            NStore.setRepeatMs(c, call.getData().optLong("repeatMs", 0));
            // Gerade abgehakte, noch nicht abgeholte Aufgaben: den Stand der App-Seite behalten
            Set<String> skip = new HashSet<>();
            JSONArray pend = NStore.pendingDone(c);
            for (int i = 0; i < pend.length(); i++) {
                JSONObject d = pend.optJSONObject(i);
                if (d != null) skip.add(d.optString("id"));
            }

            Map<String, JSONObject> old = new HashMap<>();
            JSONArray oldArr = NStore.tasks(c);
            for (int i = 0; i < oldArr.length(); i++) {
                JSONObject o = oldArr.optJSONObject(i);
                if (o != null) old.put(o.optString("id"), o);
            }

            JSONArray fresh = new JSONArray();
            Set<String> keep = new HashSet<>();
            Set<String> titleChanged = new HashSet<>();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject t = arr.getJSONObject(i);
                String id = t.getString("id");
                JSONObject prev = old.get(id);
                if (skip.contains(id)) {
                    if (prev != null) {
                        fresh.put(prev);
                        keep.add(id);
                    }
                    continue;
                }
                JSONObject o = new JSONObject();
                o.put("id", id);
                o.put("title", t.optString("title"));
                o.put("due", t.optLong("due"));
                o.put("rep", t.optString("rep", ""));
                o.put("color", t.optString("color", ""));
                o.put("snooze", t.optLong("snooze", 0));
                long due = t.optLong("due");
                // Wurde der Termin geaendert, gilt die Wegwisch-Pause nicht mehr
                boolean sameDue = prev != null && prev.optLong("due") == due;
                o.put("next", sameDue ? prev.optLong("next", 0) : 0L);
                if (prev != null && (!prev.optString("title").equals(t.optString("title")) || !prev.optString("color", "").equals(t.optString("color", "")))) titleChanged.add(id);
                fresh.put(o);
                keep.add(id);
            }

            for (String id : old.keySet()) {
                if (!keep.contains(id)) {
                    Notifier.cancelAlarm(c, id);
                    Notifier.cancelNotification(c, id);
                }
            }

            NStore.saveTasks(c, fresh);

            long now = System.currentTimeMillis();
            for (int i = 0; i < fresh.length(); i++) {
                JSONObject o = fresh.getJSONObject(i);
                String id = o.getString("id");
                long at = Math.max(o.optLong("due"), o.optLong("next"));
                if (at <= now) {
                    if (!Notifier.isShown(c, id) || titleChanged.contains(id)) Notifier.show(c, id, o.optString("title"), o.optString("color", ""));
                } else {
                    Notifier.cancelNotification(c, id);
                    Notifier.schedule(c, id, at);
                }
            }
            AufgabenWidget.refreshAll(c);
            call.resolve();
        } catch (Exception e) {
            call.reject("setTasks fehlgeschlagen: " + e.getMessage());
        }
    }

    /** Abgehakte Aufgaben (aus Benachrichtigung oder Widget) abholen: [{id, ts, due}]. */
    @PluginMethod
    public void takeDone(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("items", NStore.takeDone(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void permissionState(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", granted());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(final PluginCall call) {
        if (!granted() && Build.VERSION.SDK_INT >= 33 && getActivity() != null) {
            getActivity().runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    getActivity().requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4711);
                }
            });
        }
        call.resolve();
    }
}
""")

write_java('MainActivity', r"""package PKG;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AufgabenPlugin.class);
        super.onCreate(savedInstanceState);
        // Zurueck-Taste/-Geste: erst in der Seite zurueck, erst dann App beenden
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                if (wv != null && wv.canGoBack()) {
                    wv.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });
    }
}
""")
print('Benachrichtigungs-Plug-in und Widget eingetragen, Build-Nummer', run)
