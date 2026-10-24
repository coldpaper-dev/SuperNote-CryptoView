package com.cryptoview;

import android.graphics.Typeface;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.common.assets.ReactFontManager;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * The only native code in CryptoView: the plugin's own font files, and text
 * files read and written by absolute path (the plugin SDK has no writeFile).
 */
public class ViewNativeModule extends ReactContextBaseJavaModule {
    public ViewNativeModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "ViewNative";
    }

    /**
     * Make a font file shipped with the plugin usable as a fontFamily. The
     * host only knows its own fonts, so each file is registered by path.
     */
    @ReactMethod
    public void loadFont(String family, String uri, Promise promise) {
        try {
            String path = uri.startsWith("file://") ? uri.substring(7) : uri;
            Typeface typeface = Typeface.createFromFile(path);
            ReactFontManager.getInstance().setTypeface(family, Typeface.NORMAL, typeface);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("E_FONT", uri + ": " + e.getMessage());
        }
    }

    /** The file as UTF-8 text, or "" when it does not exist. */
    @ReactMethod
    public void readFile(String path, Promise promise) {
        try {
            File file = new File(path);
            if (!file.exists()) {
                promise.resolve("");
                return;
            }
            promise.resolve(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
        } catch (Exception e) {
            promise.reject("E_READ", path + ": " + e.getMessage());
        }
    }

    /** Written to a temporary file first, so a kill mid-write cannot truncate it. */
    @ReactMethod
    public void writeFile(String path, String content, Promise promise) {
        try {
            File file = new File(path);
            File parent = file.getParentFile();
            if (parent != null && !parent.exists()) {
                parent.mkdirs();
            }
            File tmp = new File(path + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp, false)) {
                out.write(content.getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
            if (!tmp.renameTo(file)) {
                file.delete();
                if (!tmp.renameTo(file)) {
                    throw new java.io.IOException("rename failed");
                }
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("E_WRITE", path + ": " + e.getMessage());
        }
    }
}
