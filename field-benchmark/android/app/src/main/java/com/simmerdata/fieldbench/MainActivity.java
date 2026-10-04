package com.simmerdata.fieldbench;

import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.WebViewListener;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Recovers from WebView renderer death the way #1362 and #1363 settled: record
 * the death, close every SQLite connection so a half-done transaction rolls back,
 * reset the bridge, and recreate the activity, which builds a new WebView.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "FieldBench";
    private boolean recovering = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BenchNativePlugin.class);
        super.onCreate(savedInstanceState);
        bridge.addWebViewListener(
            new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                    onRendererGone(detail);
                    return true;
                }
            }
        );
    }

    private void onRendererGone(RenderProcessGoneDetail detail) {
        if (recovering) return;
        recovering = true;
        long goneAt = System.currentTimeMillis();
        boolean didCrash = detail != null && detail.didCrash();
        int priority = detail != null ? detail.rendererPriorityAtExit() : -1;
        Log.w(TAG, "renderer gone, didCrash=" + didCrash + " priority=" + priority);

        SharedPreferences prefs = getSharedPreferences(BenchNativePlugin.PREFS, MODE_PRIVATE);
        try {
            JSONObject pending = new JSONObject(prefs.getString(BenchNativePlugin.PENDING_KILL, "{}"));
            JSONObject record = new JSONObject();
            record.put("goneAt", goneAt);
            record.put("didCrash", didCrash);
            record.put("rendererPriorityAtExit", priority);
            record.put("kind", pending.optString("kind", "unrequested"));
            record.put("expectedQueueIds", new JSONArray(pending.optString("expectedQueueIds", "[]")));
            prefs.edit().putString(BenchNativePlugin.RECOVERY, record.toString()).remove(BenchNativePlugin.PENDING_KILL).commit();
        } catch (Exception e) {
            Log.e(TAG, "could not record the renderer death", e);
        }

        closeSqliteConnections();

        new Handler(Looper.getMainLooper()).post(() -> {
            bridge.reset();
            recreate();
        });
    }

    /** The SQLite plugin keeps its connections in a private dictionary; reach it by reflection. */
    private void closeSqliteConnections() {
        try {
            PluginHandle handle = bridge.getPlugin("CapacitorSQLite");
            if (handle == null) return;
            Object plugin = handle.getInstance();
            Field field = plugin.getClass().getDeclaredField("implementation");
            field.setAccessible(true);
            Object implementation = field.get(plugin);
            if (implementation == null) return;
            Method close = implementation.getClass().getDeclaredMethod("closeAllConnections");
            close.setAccessible(true);
            close.invoke(implementation);
            Log.w(TAG, "closed SQLite connections before recreate");
        } catch (Exception e) {
            Log.e(TAG, "could not close SQLite connections", e);
        }
    }
}
