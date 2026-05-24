import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, AppState, Alert, Platform } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

const GPS_TASK = "TMS_GPS_BACKGROUND";
const FIREBASE_URL = "https://trip-managemen-system-default-rtdb.asia-southeast1.firebasedatabase.app";

// Background GPS task — runs even when app minimized or screen off
TaskManager.defineTask(GPS_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data;
  const loc = locations[0];
  if (!loc || !global.tmsDriverName) return;

  const name = global.tmsDriverName;
  try {
    // Read existing trail
    const res = await fetch(`${FIREBASE_URL}/live_locations/${name}/trail.json`);
    let trail = res.ok ? (await res.json() || []) : [];
    if (!Array.isArray(trail)) trail = [];
    trail.push({ lat: loc.coords.latitude, lng: loc.coords.longitude, t: new Date().toISOString() });
    if (trail.length > 30) trail = trail.slice(-30);

    // Write full location update via REST API
    await fetch(`${FIREBASE_URL}/live_locations/${name}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy || null,
        speed: loc.coords.speed || 0,
        heading: loc.coords.heading || null,
        timestamp: new Date().toISOString(),
        status: "active",
        driverName: name,
        trail
      })
    });
  } catch (e) {
    console.error("GPS background write error:", e);
  }
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const webviewRef = useRef(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("gps", {
        name: "GPS Tracking",
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
      });
    }
    const sub = AppState.addEventListener("change", next => {
      appState.current = next;
    });
    return () => { sub.remove(); stopGPS(); deactivateKeepAwake(); };
  }, []);

  async function startGPS(driverName) {
    global.tmsDriverName = driverName;

    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== "granted") {
      Alert.alert("Permission Required", "Please allow location access.");
      return false;
    }

    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    if (bg !== "granted") {
      Alert.alert("Background Location Required",
        "Go to Settings > Apps > TMS Al-Haram > Permissions > Location > Allow all the time");
    }

    await activateKeepAwakeAsync();

    await Notifications.scheduleNotificationAsync({
      identifier: "gps-active",
      content: {
        title: "TMS Al-Haram — GPS Active",
        body: `Tracking ${driverName}`,
        android: { channelId: "gps", ongoing: true, color: "#8B0000" }
      },
      trigger: null,
    });

    const already = await TaskManager.isTaskRegisteredAsync(GPS_TASK);
    if (!already) {
      await Location.startLocationUpdatesAsync(GPS_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000,
        distanceInterval: 10,
        foregroundService: {
          notificationTitle: "TMS Al-Haram GPS Active",
          notificationBody: `Tracking ${driverName}`,
          notificationColor: "#8B0000",
        },
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
      });
    }
    return true;
  }

  async function stopGPS() {
    global.tmsDriverName = null;
    const already = await TaskManager.isTaskRegisteredAsync(GPS_TASK);
    if (already) await Location.stopLocationUpdatesAsync(GPS_TASK);
    await Notifications.dismissNotificationAsync("gps-active").catch(() => {});
    deactivateKeepAwake();
  }

  async function setOffline(driverName) {
    try {
      await fetch(`${FIREBASE_URL}/live_locations/${driverName}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "offline", timestamp: new Date().toISOString() })
      });
    } catch (e) {}
  }

  function onMessage(event) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "START_GPS" && msg.driverName) {
        startGPS(msg.driverName).then(ok => {
          webviewRef.current?.injectJavaScript(`window.nativeGpsActive=${ok};true;`);
        });
      }
      if (msg.type === "STOP_GPS") {
        stopGPS();
        webviewRef.current?.injectJavaScript(`window.nativeGpsActive=false;true;`);
      }
      if (msg.type === "DRIVER_LOGOUT" && msg.driverName) {
        stopGPS();
        setOffline(msg.driverName);
      }
    } catch (e) {}
  }

  const injectedJS = `
    (function(){
      window.isNativeApp = true;
      window.nativeGpsActive = false;
      var _orig = window.startTracking;
      window.startTracking = function(){
        var n = window.getMyDriverName ? window.getMyDriverName() : "unknown";
        window.ReactNativeWebView.postMessage(JSON.stringify({type:"START_GPS",driverName:n}));
        if(_orig) _orig();
      };
      var _origStop = window.stopTracking;
      window.stopTracking = function(){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:"STOP_GPS"}));
        if(_origStop) _origStop();
      };
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
        onMessage={onMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        geolocationEnabled={true}
        allowsInlineMediaPlayback={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#8B0000" },
  webview: { flex: 1 },
});
