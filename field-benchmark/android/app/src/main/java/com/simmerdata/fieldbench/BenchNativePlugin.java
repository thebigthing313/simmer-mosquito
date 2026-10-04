package com.simmerdata.fieldbench;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Process;
import android.os.SystemClock;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** The benchmark's native half: basemap range reads and download, sizes, clocks, the log and the renderer kill. */
@CapacitorPlugin(name = "BenchNative")
public class BenchNativePlugin extends Plugin {

    static final String PREFS = "bench";
    static final String RECOVERY = "recovery";
    static final String PENDING_KILL = "pendingKill";

    private RandomAccessFile basemap;

    private File basemapFile() {
        return new File(getContext().getFilesDir(), "basemap.pmtiles");
    }

    private File logFile() {
        File dir = getContext().getExternalFilesDir(null);
        return new File(dir != null ? dir : getContext().getFilesDir(), "bench-results.jsonl");
    }

    @PluginMethod
    public synchronized void readRange(PluginCall call) {
        try {
            long offset = call.getLong("offset", 0L);
            int length = call.getInt("length", 0);
            if (basemap == null) basemap = new RandomAccessFile(basemapFile(), "r");
            long available = Math.max(0, basemap.length() - offset);
            byte[] bytes = new byte[(int) Math.min(length, available)];
            basemap.seek(offset);
            basemap.readFully(bytes);
            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("range read failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void basemapInfo(PluginCall call) {
        File file = basemapFile();
        JSObject result = new JSObject();
        result.put("exists", file.exists() && file.length() > 0);
        result.put("bytes", file.exists() ? file.length() : 0);
        call.resolve(result);
    }

    @PluginMethod
    public void downloadBasemap(PluginCall call) {
        String url = call.getString("url");
        new Thread(() -> {
            File temp = new File(getContext().getFilesDir(), "basemap.pmtiles.download");
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                if (conn.getResponseCode() != 200) throw new Exception("HTTP " + conn.getResponseCode());
                long bytes = 0;
                long lastReport = 0;
                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(temp)) {
                    byte[] buffer = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buffer)) > 0) {
                        out.write(buffer, 0, n);
                        bytes += n;
                        if (bytes - lastReport > 1_000_000) {
                            lastReport = bytes;
                            JSObject progress = new JSObject();
                            progress.put("bytes", bytes);
                            notifyListeners("downloadProgress", progress);
                        }
                    }
                }
                synchronized (this) {
                    if (basemap != null) {
                        basemap.close();
                        basemap = null;
                    }
                    if (!temp.renameTo(basemapFile())) throw new Exception("could not move the download into place");
                }
                JSObject result = new JSObject();
                result.put("bytes", bytes);
                call.resolve(result);
            } catch (Exception e) {
                temp.delete();
                call.reject("download failed: " + e.getMessage(), e);
            }
        }).start();
    }

    @PluginMethod
    public void dbSize(PluginCall call) {
        File db = getContext().getDatabasePath(call.getString("name"));
        long bytes = 0;
        for (String suffix : new String[] { "", "-wal", "-shm", "-journal" }) {
            File f = new File(db.getPath() + suffix);
            if (f.exists()) bytes += f.length();
        }
        JSObject result = new JSObject();
        result.put("bytes", bytes);
        call.resolve(result);
    }

    @PluginMethod
    public void deleteDatabase(PluginCall call) {
        getContext().deleteDatabase(call.getString("name"));
        call.resolve();
    }

    @PluginMethod
    public void sinceProcessStart(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ms", SystemClock.elapsedRealtime() - Process.getStartElapsedRealtime());
        call.resolve(result);
    }

    @PluginMethod
    public synchronized void appendLog(PluginCall call) {
        try (FileWriter w = new FileWriter(logFile(), true)) {
            w.write(call.getString("line", "") + "\n");
            call.resolve();
        } catch (Exception e) {
            call.reject("log write failed", e);
        }
    }

    @PluginMethod
    public synchronized void readLog(PluginCall call) {
        File file = logFile();
        String text = "";
        if (file.exists()) {
            try (FileInputStream in = new FileInputStream(file)) {
                byte[] bytes = new byte[(int) file.length()];
                int read = 0;
                while (read < bytes.length) {
                    int n = in.read(bytes, read, bytes.length - read);
                    if (n < 0) break;
                    read += n;
                }
                text = new String(bytes, 0, read, StandardCharsets.UTF_8);
            } catch (Exception e) {
                call.reject("log read failed", e);
                return;
            }
        }
        JSObject result = new JSObject();
        result.put("text", text);
        call.resolve(result);
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_SUBJECT, "Field benchmark results");
        send.putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
        Intent chooser = Intent.createChooser(send, "Share results");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(chooser);
        call.resolve();
    }

    @PluginMethod
    public void getRecovery(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject result = new JSObject();
        result.put("recovery", prefs.getString(RECOVERY, null));
        call.resolve(result);
    }

    @PluginMethod
    public void clearRecovery(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(RECOVERY).commit();
        call.resolve();
    }

    /** chrome://crash gives didCrash true; chrome://kill gives false, as a memory kill would. */
    @PluginMethod
    public void killRenderer(PluginCall call) {
        try {
            JSONObject pending = new JSONObject();
            pending.put("kind", call.getString("kind", "crash"));
            pending.put("expectedQueueIds", call.getString("expectedQueueIds", "[]"));
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PENDING_KILL, pending.toString()).commit();
        } catch (Exception e) {
            call.reject("could not record the kill", e);
            return;
        }
        call.resolve();
        String url = "kill".equals(call.getString("kind")) ? "chrome://kill" : "chrome://crash";
        getActivity().runOnUiThread(() -> getBridge().getWebView().loadUrl(url));
    }

    @PluginMethod
    public void restartApp(PluginCall call) {
        call.resolve();
        Context context = getContext();
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent != null) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            context.startActivity(intent);
        }
        Runtime.getRuntime().exit(0);
    }
}
