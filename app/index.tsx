import { useEffect, useRef, useState } from "react";
import {
  View, StyleSheet, Platform, AppState, Alert
} from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { initializeApp, getApps } from "@react-native-firebase/app";
import database from "@react-native-firebase/database";

// ── Firebase config ──────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBK_tW516wKMzkE7FFJP7Ta5-rZjWf0LKQ",
  authDomain: "trip-managemen-system.firebaseapp.com",
  databaseURL: "https://trip-managemen-system-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "trip-managemen-system",
  storageBucket: "trip-managemen-system.appspot.com",
  messagingSenderId: "1063057780359",
  appId: "1:1063057780359:web:3baa9e063f76d8ca271222"
};

if (getApps().length === 0) initializeApp(firebaseConfig);

// ── Background GPS Task name ──────────────────────────────
const GPS_TASK = "TMS_GPS_BACKGROUND";

// ── Register background task (runs even when app minimized) ──
TaskManager.defineTask(GPS_TASK, async ({ data, error }) => {
  if (error) { console.error("GPS Task error:", error); return; }
  if (!data) return;
  const { locations } = data;
  const loc = locations[0];
  if (!loc) return;

  // Read driver name from storage
  const driverName = global.tmsDriverName || "unknown";
  if (driverName === "unknown") return;

  try {
    const trail_ref = database().ref(`live_locations/${driverName}/trail`);
    const snap = await trail_ref.once("value");
    let trail = snap.val() || [];
    trail.push({ lat: loc.coords.latitude, lng: loc.coords.longitude, t: new Date().toISOString() });
    if (trail.length > 30) trail = trail.slice(-30);

    await database().ref(`live_locations/${driverName}`).set({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      speed: loc.coords.speed || 0,
      heading: loc.coords.heading || null,
      timestamp: new Date().toISOString(),
      status: "active",
      driverName,
      trail
    });
  } catch (e) {
    console.error("RTDB write error:", e);
  }
});

// ── Notification setup ────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// ── Main App ──────────────────────────────────────────────
export default function App() {
  const webviewRef = useRef(null);
  const appState   = useRef(AppState.currentState);
  const [gpsActive, setGpsActive] = useState(false);

  useEffect(() => {
    setupNotificationChannel();
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => { sub.remove(); stopGPS(); deactivateKeepAwake(); };
  }, []);

  async function setupNotificationChannel() {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("gps", {
        name: "GPS Tracking",
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
      });
    }
  }

  async function handleAppStateChange(nextState) {
    // App going to background — GPS keeps running via background task
    if (appState.current === "active" && nextState.match(/inactive|background/)) {
      console.log("App to background — GPS background task continues");
    }
    // App came to foreground
    if (appState.current.match(/inactive|background/) && nextState === "active") {
      console.log("App to foreground");
    }
    appState.current = nextState;
  }

  async function startGPS(driverName) {
    global.tmsDriverName = driverName;

    // Request foreground permission
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== "granted") {
      Alert.alert("Permission Denied", "Location permission is required for GPS tracking.");
      return false;
    }

    // Request background permission (critical for background GPS)
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    if (bg !== "granted") {
      Alert.alert(
        "Background Location Required",
        "Please allow 'Allow all the time' for location to track GPS when app is minimized.",
        [{ text: "OK" }]
      );
    }

    // Keep screen awake
    await activateKeepAwakeAsync();

    // Show persistent foreground service notification
    await Notifications.scheduleNotificationAsync({
      identifier: "gps-active",
      content: {
        title: "TMS Al-Haram — GPS Active",
        body: `Tracking ${driverName} — location sharing is ON`,
        sticky: true,
        autoDismiss: false,
        android: { channelId: "gps", ongoing: true, color: "#8B0000" }
      },
      trigger: null,
    });

    // Start background location task
    const isRegistered = await TaskManager.isTaskRegisteredAsync(GPS_TASK);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(GPS_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000,       // every 10 seconds
        distanceInterval: 10,      // or every 10 meters
        foregroundService: {
          notificationTitle: "TMS Al-Haram GPS Active",
          notificationBody: `Tracking ${driverName}`,
          notificationColor: "#8B0000",
        },
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
      });
    }

    setGpsActive(true);
    return true;
  }

  async function stopGPS() {
    global.tmsDriverName = null;
    const isRegistered = await TaskManager.isTaskRegisteredAsync(GPS_TASK);
    if (isRegistered) await Location.stopLocationUpdatesAsync(GPS_TASK);
    await Notifications.dismissNotificationAsync("gps-active");
    deactivateKeepAwake();
    setGpsActive(false);
  }

  // Messages from WebView → Native
  function onWebViewMessage(event) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "START_GPS" && msg.driverName) {
        startGPS(msg.driverName).then(ok => {
          // Tell WebView GPS is handled by native
          webviewRef.current?.injectJavaScript(
            `window.nativeGpsActive = ${ok}; true;`
          );
        });
      }
      if (msg.type === "STOP_GPS") {
        stopGPS().then(() => {
          webviewRef.current?.injectJavaScript(
            `window.nativeGpsActive = false; true;`
          );
        });
      }
      if (msg.type === "DRIVER_LOGOUT") {
        stopGPS();
        if (msg.driverName) {
          database().ref(`live_locations/${msg.driverName}`).update({
            status: "offline",
            timestamp: new Date().toISOString()
          }).catch(() => {});
        }
      }
    } catch (e) {}
  }

  // JS injected into WebView to bridge native GPS
  const injectedJS = `
    (function(){
      window.nativeGpsActive = false;
      window.isNativeApp = true;

      // Override startTracking to use native GPS
      var _origStart = window.startTracking;
      window.startTracking = function(){
        var driverName = window.getMyDriverName ? window.getMyDriverName() : "unknown";
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "START_GPS",
          driverName: driverName
        }));
      };

      // Override stopTracking to use native GPS
      var _origStop = window.stopTracking;
      window.stopTracking = function(){
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "STOP_GPS" }));
        if(_origStop) _origStop();
      };

      // Intercept logout
      var _origLogout = window.doLogout;
      window.doLogout = function(){
        var name = window.getMyDriverName ? window.getMyDriverName() : null;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "DRIVER_LOGOUT",
          driverName: name
        }));
        if(_origLogout) _origLogout();
      };

      console.log("TMS Native Bridge ready");
    })();
    true;
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ uri: "https://YOUR-NETLIFY-URL.netlify.app" }}
        style={styles.webview}
        injectedJavaScript={injectedJS}
        onMessage={onWebViewMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        geolocationEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        onError={(e) => console.error("WebView error:", e)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#8B0000" },
  webview:   { flex: 1 },
});
