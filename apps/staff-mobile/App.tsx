import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "react-native-vector-icons/Ionicons";
import { WebView } from "react-native-webview";
import { Camera, CameraType } from "react-native-camera-kit";
import RNPrint from "react-native-print";
import { clearSession, login, request } from "./src/api";
import { WEB_APP_URL } from "./src/config";
import { Card, Empty, Row, Title } from "./src/ui";
import { colors } from "./src/theme";
type User = {
  id: string;
  name: string;
  email: string;
  portal: "ADMIN" | "STAFF";
  roleCodes?: string[];
  permissions?: string[];
};
type Tab = "home" | "work" | "patients" | "payments" | "more";
const tabs: [Tab, string, any][] = [
  ["home", "Home", "home"],
  ["work", "Work", "calendar"],
  ["patients", "Patients", "people"],
  ["payments", "Payments", "wallet"],
  ["more", "More", "grid"],
];
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState<Tab>("home");
  useEffect(() => {
    AsyncStorage.getItem("user")
      .then((v) => v && setUser(JSON.parse(v)))
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  if (!user) return <Login onDone={setUser} />;
  const confirmLogout = () =>
    Alert.alert("Log out?", "You will need to sign in again to continue working.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await clearSession();
          setUser(null);
        },
      },
    ]);
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />
      <Header user={user} />
      <View style={s.body}>
        {tab === "home" ? (
          <Home user={user} go={setTab} />
        ) : tab === "work" ? (
          <Work user={user} />
        ) : tab === "patients" ? (
          <Patients />
        ) : tab === "payments" ? (
          <Payments />
        ) : (
          <More
            user={user}
            go={setTab}
            logout={confirmLogout}
          />
        )}
      </View>
      <View style={s.tabs}>
        {tabs.map(([key, label, icon]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={s.tab}>
            <Ionicons
              name={tab === key ? icon : (`${icon}-outline` as any)}
              size={22}
              color={tab === key ? colors.primary : colors.muted}
            />
            <Text style={[s.tabText, tab === key && s.active]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
function Login({ onDone }: { onDone: (u: User) => void }) {
  const [portal, setPortal] = useState<"ADMIN" | "STAFF">("ADMIN"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [remember, setRemember] = useState(true),
    [showPassword, setShowPassword] = useState(false);
  const submit = async () => {
    try {
      setBusy(true);
      onDone(await login(email.trim(), password, portal));
    } catch (e) {
      Alert.alert(
        "Unable to sign in",
        e instanceof Error ? e.message : "Please check your details"
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={s.loginSafe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FCFC" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.loginScroll}
        >
          <View style={s.loginGlowOne} />
          <View style={s.loginGlowTwo} />
          <View style={s.brandRow}>
            <View style={s.logo}>
              <Ionicons name="medkit" size={27} color="white" />
            </View>
            <View>
              <Text style={s.brand}>
                CareFlow<Text style={s.brand360}>360</Text>
              </Text>
              <Text style={s.brandSub}>HOSPITAL LEADS APP</Text>
            </View>
          </View>
          <View style={s.promise}>
            <Text style={s.promiseText}>Better</Text>
            <Text style={s.promiseStrong}>Patients</Text>
            <Text style={s.promiseText}>Brighter</Text>
            <Text style={s.promiseStrong}>Care</Text>
            <View style={s.promiseLine} />
          </View>
          <View style={s.intro}>
            <Text style={s.loginTitle}>
              Manage{`\n`}Leads. Improve{`\n`}
              <Text style={s.brand360}>Care.</Text>
            </Text>
            <Text style={s.loginSub}>
              Track patients, follow up{`\n`}faster, and grow your hospital
              {`\n`}with smarter leads.
            </Text>
          </View>
          <View style={s.hospitalWrap}>
            <Image
              source={require("./assets/hospital-hero.png")}
              style={s.hospitalImage}
            />
          </View>
          <View style={s.loginCard}>
            <View style={s.portal}>
              <Pressable
                onPress={() => setPortal("ADMIN")}
                style={[s.portalBtn, portal === "ADMIN" && s.portalActive]}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color={portal === "ADMIN" ? "white" : colors.ink}
                />
                <Text
                  style={portal === "ADMIN" ? s.portalActiveText : s.portalText}
                >
                  Admin
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setPortal("STAFF")}
                style={[s.portalBtn, portal === "STAFF" && s.portalActive]}
              >
                <Ionicons
                  name="people-outline"
                  size={21}
                  color={portal === "STAFF" ? "white" : colors.ink}
                />
                <Text
                  style={portal === "STAFF" ? s.portalActiveText : s.portalText}
                >
                  Staff
                </Text>
              </Pressable>
            </View>
            <View style={s.inputWrap}>
              <Ionicons name="mail-outline" size={22} color={colors.ink} />
              <TextInput
                style={s.loginInput}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Work email"
                placeholderTextColor="#7888A0"
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <View style={s.inputWrap}>
              <Ionicons
                name="lock-closed-outline"
                size={22}
                color={colors.ink}
              />
              <TextInput
                style={s.loginInput}
                secureTextEntry={!showPassword}
                placeholder="Password"
                placeholderTextColor="#7888A0"
                value={password}
                onChangeText={setPassword}
              />
              <Pressable
                hitSlop={12}
                onPress={() => setShowPassword((v) => !v)}
              >
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={23}
                  color={colors.ink}
                />
              </Pressable>
            </View>
            <View style={s.loginOptions}>
              <Pressable
                style={s.remember}
                onPress={() => setRemember((v) => !v)}
              >
                <View style={[s.checkbox, remember && s.checkboxOn]}>
                  {remember && (
                    <Ionicons name="checkmark" size={18} color="white" />
                  )}
                </View>
                <Text style={s.optionText}>Remember me</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Forgot password?",
                    "Please contact your administrator to reset your password."
                  )
                }
              >
                <Text style={s.forgot}>Forgot password?</Text>
              </Pressable>
            </View>
            <Pressable
              style={[s.primaryBtn, busy && { opacity: 0.7 }]}
              onPress={submit}
              disabled={busy}
            >
              <Text style={s.primaryText}>
                {busy ? "Signing in…" : "Sign in securely"}
              </Text>
              <Ionicons name="arrow-forward" size={23} color="white" />
            </Pressable>
            <View style={s.dividerRow}>
              <View style={s.divider} />
              <Text style={s.dividerText}>OR CONTINUE WITH</Text>
              <View style={s.divider} />
            </View>
            <Pressable
              style={s.googleBtn}
              onPress={() =>
                Alert.alert(
                  "Google sign-in",
                  "Google authentication is not configured yet."
                )
              }
            >
              <Ionicons name="logo-google" size={24} color="#4285F4" />
              <Text style={s.googleText}>Sign in with Google</Text>
            </Pressable>
          </View>
          <View style={s.benefits}>
            <Benefit icon="shield-outline" label="Secure Access" />
            <Benefit icon="people-outline" label="Role Based" />
            <Benefit icon="bar-chart-outline" label="Better Follow-ups" />
          </View>
          <Text style={s.tagline}>CARE TODAY. A HEALTHIER TOMORROW.</Text>
          <View style={s.pager}>
            <View style={s.pageOn} />
            <View style={s.pageDot} />
            <View style={s.pageDot} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function Benefit({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={s.benefit}>
      <View style={s.benefitIcon}>
        <Ionicons name={icon} size={27} color="#079588" />
      </View>
      <Text style={s.benefitText}>{label}</Text>
    </View>
  );
}
function Header({ user }: { user: User }) {
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={s.header}>
      <View style={s.headerIdentity}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
        <View>
          <Text style={s.hello}>Hello, {user.name.split(" ")[0]}</Text>
          <Text style={s.role}>
            {(user.roleCodes?.[0] || user.portal).replaceAll("_", " ")}
          </Text>
        </View>
      </View>
      <View style={s.headerActions}>
        <Pressable style={s.bell}>
          <Ionicons name="notifications-outline" size={25} color={colors.ink} />
          <View style={s.dot} />
        </Pressable>
        <View style={s.miniBrand}>
          <Ionicons name="medkit" size={27} color="#079589" />
          <Text style={s.miniBrandText}>CareFlow360</Text>
          <Text style={s.miniBrandSub}>Better Care. Together.</Text>
        </View>
      </View>
    </View>
  );
}
function Home({ user, go }: { user: User; go: (t: Tab) => void }) {
  const [data, setData] = useState<any>();
  useEffect(() => {
    request("/crm/dashboard")
      .then(setData)
      .catch(() => {});
  }, []);
  const tech = user.roleCodes?.includes("LAB_TECHNICIAN");
  const upcoming = data?.upcomingAppointments?.[0];
  return (
    <ScrollView
      contentContainerStyle={s.homeScroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.hero}>
        <View style={s.heroBubble} />
        <View style={s.heroBubbleTwo} />
        <View style={s.heroCopy}>
          <Text style={s.heroDate}>
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </Text>
          <Text style={s.heroTitle}>
            {tech ? "Samples need your attention" : "Your clinic at a glance"}
          </Text>
          <Text style={s.heroSub}>
            {tech
              ? "Process pending samples and keep the lab running smoothly."
              : "Stay on top of patients, appointments and follow-ups."}
          </Text>
          <Pressable style={s.heroButton} onPress={() => go("work")}>
            <Text style={s.heroButtonText}>
              {tech ? "View Samples" : "View Schedule"}
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#087F76" />
          </Pressable>
        </View>
        <View style={s.overviewPill}>
          <Ionicons name="bar-chart" size={19} color="white" />
          <Text style={s.heroOver}>TODAY'S OVERVIEW</Text>
        </View>
        <Image
          source={require("./assets/microscope-hero.png")}
          style={s.microscope}
        />
      </View>
      <View style={s.metrics}>
        <Metric
          icon="people"
          value={data?.patients || 0}
          label="Patients"
          subtitle="Registered today"
          color="#06A497"
          tint="#DFF8F5"
        />
        <Metric
          icon="calendar"
          value={data?.todayAppointments || 0}
          label="Appointments"
          subtitle="Scheduled today"
          color="#287BD7"
          tint="#E5F0FF"
        />
        <Metric
          icon="cash-outline"
          value={`₹${data?.payments || 0}`}
          label="Received"
          subtitle="Payments today"
          color="#159B63"
          tint="#E5F8EF"
        />
        <Metric
          icon="call"
          value={data?.todayCalls || 0}
          label="Calls"
          subtitle="New enquiries"
          color="#F04450"
          tint="#FFE8E9"
        />
      </View>
      <View style={s.sectionRow}>
        <Text style={s.section}>Quick actions</Text>
        <Text style={s.seeAll}>View all →</Text>
      </View>
      <View style={s.quick}>
        <Quick
          icon="person-add"
          label="New patient"
          color="#069D90"
          tint="#E1F7F4"
        />
        <Quick
          icon="calendar"
          label="Book appointment"
          color="#287BD7"
          tint="#E7F1FF"
          onPress={() => go("work")}
        />
        <Quick
          icon="flask"
          label="Lab collection"
          color="#7442C1"
          tint="#F0E8FF"
          onPress={() => go("work")}
        />
        <Quick
          icon="card"
          label="Payment"
          color="#F06A24"
          tint="#FFF0E5"
          onPress={() => go("payments")}
        />
      </View>
      <View style={s.sectionRow}>
        <Text style={s.section}>Up next</Text>
        <Text style={s.seeAll}>See all →</Text>
      </View>
      {upcoming ? (
        <View style={s.nextCard}>
          <View style={s.nextAvatar}>
            <Text style={s.nextAvatarText}>
              {(upcoming.patient?.name || "Patient")
                .split(" ")
                .map((x: string) => x[0])
                .join("")
                .slice(0, 2)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nextName}>
              {upcoming.patient?.name || "Patient"}
            </Text>
            <Text style={s.nextDoctor}>
              {upcoming.doctor?.name || "Clinic appointment"}
            </Text>
            <View style={s.nextTag}>
              <Ionicons name="flask-outline" size={15} color="#173D51" />
              <Text style={s.nextTagText}>
                {tech ? "Lab Collection" : "Appointment"}
              </Text>
            </View>
          </View>
          <Ionicons name="time-outline" size={20} color="#5E7187" />
          <Text style={s.nextTime}>
            {new Date(upcoming.startsAt).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          <Ionicons name="chevron-forward" size={21} color="#5E7187" />
        </View>
      ) : (
        <Card>
          <Empty text="No upcoming appointments" icon="calendar-outline" />
        </Card>
      )}
    </ScrollView>
  );
}
function Work({ user }: { user: User }) {
  const tech = user.roleCodes?.includes("LAB_TECHNICIAN"),
    [kind, setKind] = useState(tech ? "assigned" : "doctor"),
    [rows, setRows] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [scannerOrder, setScannerOrder] = useState<any>(null),
    [collectionOrder, setCollectionOrder] = useState<any>(null),
    [scanTarget, setScanTarget] = useState<any>(null),
    [otpOrder, setOtpOrder] = useState<any>(null),
    [otp, setOtp] = useState(""),
    [paymentOrder, setPaymentOrder] = useState<any>(null),
    [paymentMethod, setPaymentMethod] = useState("CASH"),
    [transactionId, setTransactionId] = useState(""),
    [scannedTokens, setScannedTokens] = useState<string[]>([]),
    [scanMessage, setScanMessage] = useState("Hold the printed barcode steady inside the frame"),
    [submitting, setSubmitting] = useState<string | null>(null);
  const activeStages = ["ASSIGNED", "ACCEPTED", "ON_THE_WAY", "ARRIVED", "PATIENT_VERIFIED", "PREPARATION_CHECKED", "BARCODES_SCANNED", "SPECIMENS_COLLECTED", "PAYMENT_RECORDED", "PACKAGED", "SAMPLE_COLLECTED", "IN_TRANSIT", "RECEIVED"];
  const actionLabels: Record<string, string> = {
    ACCEPTED: "Accept assignment", ON_THE_WAY: "Start journey", ARRIVED: "Mark arrived",
    PATIENT_VERIFIED: "Verify patient", PREPARATION_CHECKED: "Confirm preparation",
    BARCODES_SCANNED: "Scan tube labels", SPECIMENS_COLLECTED: "Confirm specimens collected",
    PAYMENT_RECORDED: "Record payment", PACKAGED: "Confirm package and seal",
    SAMPLE_COLLECTED: "Submit collection", IN_TRANSIT: "Start transport", RECEIVED: "Confirm lab handover",
  };
  const refresh = () => request(`/crm/lab-collections?state=${kind}`).then((d) => setRows(Array.isArray(d) ? d : d.items || []));
  const pullRefresh = async () => {
    setRefreshing(true);
    try {
      const path = kind === "assigned" || kind === "collected"
        ? `/crm/lab-collections?state=${kind}`
        : kind === "doctor" ? "/crm/appointments?limit=100" : `/crm/modules/${kind}-appointments`;
      const data = await request(path);
      setRows(Array.isArray(data) ? data : data.items || []);
    } finally {
      setRefreshing(false);
    }
  };
  const moveWorkflow = async (item: any, stage: string, extra: any = {}) => {
    try {
      setSubmitting(item.id);
      await request(`/crm/lab-collections/${item.id}/workflow`, { method: "PATCH", body: JSON.stringify({ stage, ...extra }) });
      await refresh();
    } catch (error: any) {
      Alert.alert("Cannot continue", error?.message || "Workflow update failed");
    } finally { setSubmitting(null); }
  };
  const confirmWorkflow = (item: any, stage: string, extra: any = {}) =>
    Alert.alert(actionLabels[stage] || "Continue?", "Confirm this workflow update.", [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: () => moveWorkflow(item, stage, extra) },
    ]);
  const captureLocation = async () => {
    if (Platform.OS !== "android") throw new Error("Location tracking is currently available on Android");
    const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("Allow precise location to start the journey");
    return NativeModules.ScanFeedback.currentLocation();
  };
  const startJourney = (item: any) =>
    Alert.alert("Start journey?", "Your live route will be recorded and visible to administrators until arrival.", [
      { text: "Cancel", style: "cancel" },
      { text: "Start", onPress: async () => {
        try {
          const location = await captureLocation();
          await moveWorkflow(item, "ON_THE_WAY", { location });
        } catch (error: any) {
          Alert.alert("Location required", error?.message || "Unable to get current location");
        }
      } },
    ]);
  const openScanner = async (item: any) => {
    if (!item.labelsGeneratedAt) {
      Alert.alert("Labels not ready", "Ask an administrator to generate, print and attach all tube labels first.");
      return;
    }
    setScannedTokens([]);
    setCollectionOrder(item);
  };
  const openTubeScanner = async (item: any, specimen: any) => {
    if (Platform.OS === "android") {
      const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert("Camera permission required", "Allow camera access to scan tube labels.");
        return;
      }
    }
    setScanMessage("Hold the printed barcode steady inside the frame");
    setScanTarget(specimen);
    setScannerOrder(item);
  };
  const requestOtp = async (item: any) => {
    try {
      setSubmitting(item.id);
      const result = await request(`/crm/lab-collections/${item.id}/verification-otp`, { method: "POST" });
      setOtp("");
      setOtpOrder(item);
      Alert.alert("OTP sent", `Ask the customer for the 6-digit OTP sent to ${result.destination}.`);
    } catch (error: any) {
      Alert.alert("OTP not sent", error?.message || "Check the clinic WhatsApp OTP campaign configuration");
    } finally { setSubmitting(null); }
  };
  const verifyOtp = async () => {
    if (!otpOrder || otp.length !== 6) return;
    try {
      setSubmitting(otpOrder.id);
      await request(`/crm/lab-collections/${otpOrder.id}/verify-otp`, { method: "POST", body: JSON.stringify({ otp }) });
      NativeModules.ScanFeedback?.success?.();
      setOtpOrder(null);
      await refresh();
    } catch (error: any) {
      Alert.alert("Verification failed", error?.message || "Incorrect OTP");
    } finally { setSubmitting(null); }
  };
  const submitPayment = async () => {
    if (!paymentOrder) return;
    await moveWorkflow(paymentOrder, "PAYMENT_RECORDED", { payment: { status: "PAID", method: paymentMethod, amount: Number(paymentOrder.amount || 0), transactionId: transactionId || undefined } });
    setPaymentOrder(null);
  };
  const readTubeCode = (value: string) => {
    if (!scannerOrder) return;
    const scannedValue = String(value || "").trim().toUpperCase();
    const compactBarcode = (token: string) =>
      (String(token || "").replaceAll("-", "").match(/.{1,2}/g) || [])
        .slice(0, 12)
        .map((pair) => String(Number.parseInt(pair, 16) % 10))
        .join("");
    const specimen = (scannerOrder.specimens || []).find((item: any) =>
      compactBarcode(item.qrToken) === scannedValue ||
      String(item.barcodeValue || "").toUpperCase() === scannedValue ||
      `CF${String(item.qrToken || "").replaceAll("-", "").slice(0, 20)}`.toUpperCase() === scannedValue ||
      (scannedValue.startsWith(`CF360:${scannerOrder.id}:`.toUpperCase()) && String(item.qrToken).toUpperCase() === scannedValue.split(":").at(-1))
    );
    const token = specimen?.qrToken;
    if (!token) {
      setScanMessage("Wrong test tube — this barcode does not belong to the order");
      return;
    }
    if (scanTarget?.qrToken && token !== scanTarget.qrToken) {
      setScanMessage(`Wrong test tube — scan the tube for ${scanTarget.tests?.join(", ")}`);
      return;
    }
    setScannedTokens((current) => {
      if (current.includes(token)) {
        setScanMessage("This tube is already scanned");
        return current;
      }
      NativeModules.ScanFeedback?.success?.();
      Vibration.vibrate(100);
      setScanMessage(`Tube scanned: ${specimen.tests?.join(", ") || specimen.sampleType}`);
      setTimeout(() => { setScannerOrder(null); setScanTarget(null); }, 350);
      return [...current, token];
    });
  };
  const choices = tech
    ? [
        ["assigned", "Assigned"],
        ["collected", "Collected"],
      ]
    : [
        ["doctor", "Doctor"],
        ["lab", "Lab"],
        ["radiology", "Radiology"],
      ];
  useEffect(() => {
    setBusy(true);
    const path =
      kind === "assigned" || kind === "collected"
        ? `/crm/lab-collections?state=${kind}`
        : kind === "doctor"
        ? "/crm/appointments?limit=100"
        : `/crm/modules/${kind}-appointments`;
    request(path)
      .then((d) => setRows(Array.isArray(d) ? d : d.items || []))
      .catch(() => setRows([]))
      .finally(() => setBusy(false));
  }, [kind]);
  useEffect(() => {
    const active = rows.filter((item) => item.status === "ON_THE_WAY");
    if (!tech || !active.length) return;
    const upload = async () => {
      try {
        const location = await captureLocation();
        await Promise.all(active.map((item) => request(`/crm/lab-collections/${item.id}/location`, { method: "PATCH", body: JSON.stringify(location) })));
      } catch { /* the next interval retries after temporary GPS/network failures */ }
    };
    upload();
    const timer = setInterval(upload, 30000);
    return () => clearInterval(timer);
  }, [rows, tech]);
  const filtered = rows.filter((item) =>
    JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
  );
  return (
    <View style={s.listScreen}>
      <View style={s.pageHeading}>
        <View>
          <Text style={s.pageEyebrow}>WORKSPACE</Text>
          <Text style={s.pageTitle}>
            {tech ? "Lab Collection" : "Appointments"}
          </Text>
          <Text style={s.pageSubtitle}>
            {tech
              ? "Track assigned and collected samples."
              : "Doctor, laboratory and radiology bookings."}
          </Text>
        </View>
        <View style={s.headingArt}>
          <Ionicons name="flask" size={62} color="#079589" />
          <View style={s.artCircle} />
        </View>
      </View>
      <View style={s.segment}>
        {choices.map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setKind(key)}
            style={[s.segmentBtn, kind === key && s.segmentOn]}
          >
            <Ionicons
              name={
                key === "assigned"
                  ? "flask-outline"
                  : key === "collected"
                  ? "checkbox-outline"
                  : "calendar-outline"
              }
              size={20}
              color={kind === key ? "white" : "#07182A"}
            />
            <Text style={kind === key ? s.segmentOnText : s.segmentText}>
              {label} ({kind === key ? rows.length : 0})
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={s.toolRow}>
        <View style={s.pageSearch}>
          <Ionicons name="search-outline" size={25} color="#617086" />
          <TextInput
            style={{ flex: 1 }}
            value={search}
            onChangeText={setSearch}
            placeholder="Search patient name or test..."
            placeholderTextColor="#718096"
          />
        </View>
        <Pressable style={s.toolBtn}>
          <Ionicons name="filter-outline" size={22} color="#0B1930" />
          <Text style={s.toolText}>Filter</Text>
        </Pressable>
        <Pressable style={s.toolBtn}>
          <Ionicons name="swap-vertical-outline" size={22} color="#0B1930" />
          <Text style={s.toolText}>Sort</Text>
        </Pressable>
      </View>
      {busy ? (
        <ActivityIndicator style={{ marginTop: 50 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingBottom: 18 }}
          keyExtractor={(x) => x.id}
          ListEmptyComponent={<Empty text="No records found" />}
          renderItem={({ item }) => (
            <Card style={s.recordCard}>
              <View style={s.cardTop}>
                <Text style={s.cardTitle}>
                  {item.patient?.name || item.patientName || item.title}
                </Text>
                <Text style={s.pill}>
                  {String(item.status || "BOOKED").replaceAll("_", " ")}
                </Text>
              </View>
              <Text style={s.cardSub}>
                {item.testNames ||
                  item.doctor?.name ||
                  item.assignedTechnicianName ||
                  "Clinic appointment"}
              </Text>
              <View style={s.cardMeta}>
                <Ionicons name="time-outline" size={16} color={colors.muted} />
                <Text style={s.cardSub}>
                  {item.appointmentAt || item.startsAt
                    ? new Date(
                        item.appointmentAt || item.startsAt
                      ).toLocaleString("en-IN")
                    : "Schedule pending"}
                </Text>
              </View>
              {(kind === "assigned" || kind === "collected") && tech && (() => {
                const currentIndex = activeStages.indexOf(String(item.status));
                const nextStage = activeStages[currentIndex + 1];
                if (!nextStage) return null;
                return (
                <Pressable
                  style={s.collect}
                  disabled={submitting === item.id}
                  onPress={() => nextStage === "ON_THE_WAY" ? startJourney(item) : nextStage === "PATIENT_VERIFIED" ? requestOtp(item) : nextStage === "BARCODES_SCANNED" ? openScanner(item) : nextStage === "PAYMENT_RECORDED" ? (item.paymentStatus === "PAID" ? confirmWorkflow(item, nextStage, { payment: { status: "PAID", amount: Number(item.amount || 0) } }) : setPaymentOrder(item)) : confirmWorkflow(item, nextStage)}
                >
                  <Ionicons name={nextStage === "BARCODES_SCANNED" ? "scan-outline" : "checkmark-circle-outline"} size={20} color="white" />
                  <Text style={s.primaryText}>{submitting === item.id ? "Updating…" : actionLabels[nextStage]}</Text>
                </Pressable>
                );
              })()}
            </Card>
          )}
        />
      )}
      <Modal visible={!!collectionOrder} animationType="slide" onRequestClose={() => setCollectionOrder(null)}>
        <SafeAreaView style={s.listScreen}>
          <View style={s.scannerHeadLight}><Pressable onPress={() => setCollectionOrder(null)}><Ionicons name="close" size={28} color="#07182A" /></Pressable><View><Text style={s.cardTitle}>Collection details</Text><Text style={s.cardSub}>{collectionOrder?.patient?.name} · {collectionOrder?.title}</Text></View></View>
          <ScrollView contentContainerStyle={{ padding: 18 }}>
            <Card style={s.recordCard}><Text style={s.cardTitle}>Payment</Text><Text style={collectionOrder?.paymentStatus === "PAID" ? s.paid : s.cardSub}>{collectionOrder?.paymentStatus === "PAID" ? "PAID" : `Collect ₹${Number(collectionOrder?.amount || 0).toLocaleString("en-IN")}`}</Text></Card>
            {(collectionOrder?.specimens || []).map((specimen: any) => {
              const done = scannedTokens.includes(specimen.qrToken);
              return <Card key={specimen.id} style={s.recordCard}><View style={s.cardTop}><View style={{ flex: 1 }}><Text style={s.cardTitle}>{specimen.tests?.join(", ")}</Text><Text style={s.cardSub}>{specimen.tubeType} · {specimen.sampleType}</Text></View><Ionicons name={done ? "checkmark-circle" : "flask-outline"} size={26} color={done ? colors.primary : colors.muted} /></View><Pressable disabled={done} style={[s.collect, done && { opacity: .45 }]} onPress={() => openTubeScanner(collectionOrder, specimen)}><Ionicons name={done ? "checkmark-done" : "scan-outline"} size={20} color="white" /><Text style={s.primaryText}>{done ? "Scanned" : "Scan this tube"}</Text></Pressable></Card>;
            })}
            <Pressable style={[s.collect, scannedTokens.length !== (collectionOrder?.specimens?.length || 0) && { opacity: .45 }]} disabled={scannedTokens.length !== (collectionOrder?.specimens?.length || 0)} onPress={async () => { const order = collectionOrder; setCollectionOrder(null); await moveWorkflow(order, "BARCODES_SCANNED", { barcodeTokens: scannedTokens }); }}><Ionicons name="checkmark-done" size={20} color="white" /><Text style={s.primaryText}>Submit all scanned tubes</Text></Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal visible={!!scannerOrder} animationType="slide" onRequestClose={() => { setScannerOrder(null); setScanTarget(null); }}>
        <SafeAreaView style={s.scannerScreen}>
          <View style={s.scannerHead}>
            <Pressable onPress={() => { setScannerOrder(null); setScanTarget(null); }}><Ionicons name="close" size={30} color="white" /></Pressable>
            <View><Text style={s.scannerTitle}>Scan {scanTarget?.tests?.join(", ") || "tube"}</Text><Text style={s.scannerCount}>{scanTarget?.tubeType}</Text></View>
          </View>
          <Camera
            style={{ flex: 1 }}
            cameraType={CameraType.Back}
            scanBarcode
            allowedBarcodeTypes={["code-128"]}
            scanThrottleDelay={800}
            showFrame
            barcodeFrameSize={{ width: 340, height: 180 }}
            laserColor="#16c9b4"
            frameColor="white"
            onReadCode={(event: any) => readTubeCode(event.nativeEvent.codeStringValue)}
            onError={(event: any) => setScanMessage(event.nativeEvent?.errorMessage || "Camera could not start")}
          />
          <View style={s.scannerFoot}>
            <Text style={s.scannerHelp}>{scanMessage}</Text>
          </View>
        </SafeAreaView>
      </Modal>
      <Modal visible={!!otpOrder} transparent animationType="fade" onRequestClose={() => setOtpOrder(null)}>
        <View style={s.modalBackdrop}><View style={s.modalCard}>
          <Text style={s.cardTitle}>Verify customer</Text>
          <Text style={s.cardSub}>Enter the 6-digit OTP received by the customer.</Text>
          <TextInput value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="6-digit OTP" style={s.formInput} />
          <Pressable style={[s.collect, otp.length !== 6 && { opacity: .45 }]} disabled={otp.length !== 6 || submitting === otpOrder?.id} onPress={verifyOtp}><Text style={s.primaryText}>Verify OTP</Text></Pressable>
          <Pressable style={s.toolBtn} onPress={() => setOtpOrder(null)}><Text style={s.toolText}>Cancel</Text></Pressable>
        </View></View>
      </Modal>
      <Modal visible={!!paymentOrder} animationType="slide" onRequestClose={() => setPaymentOrder(null)}>
        <SafeAreaView style={s.listScreen}><View style={s.scannerHeadLight}><Pressable onPress={() => setPaymentOrder(null)}><Ionicons name="arrow-back" size={26} color="#07182A" /></Pressable><Text style={s.cardTitle}>Collect payment</Text></View><ScrollView contentContainerStyle={{ padding: 18 }}>
          <Card style={s.recordCard}><Text style={s.cardTitle}>{paymentOrder?.patient?.name}</Text><Text style={s.cardSub}>{paymentOrder?.testNames}</Text><Text style={[s.amount, { marginTop: 15 }]}>Amount due: ₹{Number(paymentOrder?.amount || 0).toLocaleString("en-IN")}</Text></Card>
          <Text style={s.cardSub}>Payment method</Text><View style={s.segment}>{["CASH", "UPI", "CARD"].map((method) => <Pressable key={method} style={[s.segmentBtn, paymentMethod === method && s.segmentOn]} onPress={() => setPaymentMethod(method)}><Text style={paymentMethod === method ? s.segmentOnText : s.segmentText}>{method}</Text></Pressable>)}</View>
          {paymentMethod !== "CASH" && <TextInput style={s.formInput} value={transactionId} onChangeText={setTransactionId} placeholder="Transaction / reference number" />}
          <Pressable style={s.collect} onPress={() => Alert.alert("Confirm payment?", `Confirm receipt of ₹${Number(paymentOrder?.amount || 0).toLocaleString("en-IN")} by ${paymentMethod}.`, [{ text: "Cancel", style: "cancel" }, { text: "Confirm paid", onPress: submitPayment }])}><Ionicons name="wallet-outline" size={20} color="white" /><Text style={s.primaryText}>Confirm payment collected</Text></Pressable>
        </ScrollView></SafeAreaView>
      </Modal>
    </View>
  );
}
function Patients() {
  const [search, setSearch] = useState(""),
    [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    request("/crm/patients?limit=100")
      .then((d) => setRows(d.items || []))
      .catch(() => {});
  }, []);
  const filtered = useMemo(
    () =>
      rows.filter((x) =>
        JSON.stringify(x).toLowerCase().includes(search.toLowerCase())
      ),
    [rows, search]
  );
  return (
    <View style={s.screen}>
      <Title
        eyebrow="CARE RECORDS"
        title="Patients"
        subtitle={`${rows.length} registered patients`}
      />
      <View style={s.search}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, phone or ID"
          style={{ flex: 1 }}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(x) => x.id}
        ListEmptyComponent={<Empty text="No patients found" />}
        renderItem={({ item }) => (
          <Row
            title={item.name}
            subtitle={`${item.patientNumber}  •  ${item.mobile}`}
            icon="person-outline"
          />
        )}
      />
    </View>
  );
}
function Payments() {
  const [rows, setRows] = useState<any[]>([]),
    [search, setSearch] = useState("");
  useEffect(() => {
    request("/crm/payment-logs")
      .then((d) => setRows(d.items || []))
      .catch(() => {});
  }, []);
  const filtered = rows.filter((item) =>
    JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
  );
  const paid = rows.filter(
    (item) => String(item.status).toUpperCase() === "PAID"
  );
  const total = paid.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return (
    <View style={s.listScreen}>
      <View style={s.pageHeading}>
        <View>
          <Text style={s.pageEyebrow}>FINANCE</Text>
          <Text style={s.pageTitle}>Payment Logs</Text>
          <Text style={s.pageSubtitle}>
            Doctor, lab and radiology transactions
          </Text>
        </View>
        <View style={s.headingArt}>
          <Ionicons name="receipt-outline" size={65} color="#079589" />
          <Text style={s.rupeeArt}>₹</Text>
          <View style={s.artCircle} />
        </View>
      </View>
      <View style={s.paymentSummary}>
        <Summary
          icon="wallet-outline"
          value={`₹${total.toLocaleString("en-IN")}`}
          label="Total Collected"
          color="#078F83"
          tint="#E5F8F5"
        />
        <Summary
          icon="time-outline"
          value={rows.length - paid.length}
          label="Pending"
          color="#D99B00"
          tint="#FFF4D5"
        />
        <Summary
          icon="checkmark-circle-outline"
          value={paid.length}
          label="Paid"
          color="#139A60"
          tint="#E5F8ED"
        />
      </View>
      <View style={s.toolRow}>
        <View style={s.pageSearch}>
          <Ionicons name="search-outline" size={25} color="#617086" />
          <TextInput
            style={{ flex: 1 }}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by patient, doctor or test..."
            placeholderTextColor="#718096"
          />
        </View>
        <Pressable style={s.toolBtn}>
          <Ionicons name="filter-outline" size={22} color="#0B1930" />
          <Text style={s.toolText}>Filter</Text>
        </Pressable>
        <Pressable style={s.toolBtn}>
          <Ionicons name="calendar-outline" size={20} color="#0B1930" />
          <Text style={s.toolText}>Today</Text>
        </Pressable>
      </View>
      <FlatList
        data={filtered}
        contentContainerStyle={{ paddingBottom: 18 }}
        keyExtractor={(x) => x.id}
        ListEmptyComponent={
          <Empty text="No payments found" icon="wallet-outline" />
        }
        renderItem={({ item }) => (
          <Card style={s.paymentCard}>
            <View style={s.cardTop}>
              <Text style={s.cardTitle}>{item.customerName}</Text>
              <Text style={s.amount}>
                ₹{Number(item.amount || 0).toLocaleString("en-IN")}
              </Text>
            </View>
            <Text style={s.cardSub}>
              {item.serviceType} • {item.serviceName}
            </Text>
            <Text style={s.paid}>{item.status}</Text>
          </Card>
        )}
      />
    </View>
  );
}
type MoreMenuItem = {
  label: string;
  icon: any;
  permission?: string;
  tab?: Tab;
  route?: string;
  labTechOnly?: boolean;
};
const moreMenuItems: MoreMenuItem[] = [
  {
    label: "On-the-Spot Lab Order",
    icon: "flask-outline",
    permission: "lab-collection",
    route: "lab-appointments/on-spot",
    labTechOnly: true,
  },
  {
    label: "Dashboard",
    icon: "grid-outline",
    permission: "dashboard",
    tab: "home",
  },
  {
    label: "Leads",
    icon: "funnel-outline",
    permission: "leads",
    route: "leads",
  },
  {
    label: "Interested Leads",
    icon: "heart-outline",
    permission: "leads",
    route: "interested-leads",
  },
  {
    label: "Converted Leads",
    icon: "checkmark-done-outline",
    permission: "leads",
    route: "converted-leads",
  },
  {
    label: "Follow-ups",
    icon: "alarm-outline",
    permission: "followups",
    route: "followups",
  },
  {
    label: "Patients",
    icon: "people-outline",
    permission: "patients",
    tab: "patients",
  },
  {
    label: "Appointments",
    icon: "calendar-outline",
    permission: "appointments",
    tab: "work",
  },
  {
    label: "Book Appointment",
    icon: "add-circle-outline",
    permission: "appointments",
    route: "appointments/new",
  },
  {
    label: "Doctor Appointments",
    icon: "calendar-outline",
    permission: "appointments",
    route: "appointments",
  },
  {
    label: "Calendar",
    icon: "today-outline",
    permission: "calendar",
    route: "calendar",
  },
  {
    label: "Lab Collection",
    icon: "flask-outline",
    permission: "lab-collection",
    tab: "work",
  },
  {
    label: "Radiology",
    icon: "scan-outline",
    permission: "radiology-appointments",
    route: "radiology-appointments",
  },
  {
    label: "Payments",
    icon: "wallet-outline",
    permission: "payments",
    tab: "payments",
  },
  {
    label: "Lab Appointments",
    icon: "beaker-outline",
    permission: "lab-appointments",
    route: "lab-appointments",
  },
  {
    label: "Reports",
    icon: "document-text-outline",
    permission: "reports",
    route: "reports",
  },
  {
    label: "WhatsApp",
    icon: "logo-whatsapp",
    permission: "whatsapp",
    route: "whatsapp",
  },
  {
    label: "Call Logs",
    icon: "call-outline",
    permission: "call-logs",
    route: "call-logs",
  },
  {
    label: "Notifications",
    icon: "notifications-outline",
    permission: "notifications",
    route: "notifications",
  },
  {
    label: "Departments",
    icon: "business-outline",
    permission: "departments",
    route: "departments",
  },
  {
    label: "Branches",
    icon: "git-branch-outline",
    permission: "branches",
    route: "branches",
  },
  {
    label: "Doctors",
    icon: "medkit-outline",
    permission: "doctors",
    route: "doctors",
  },
  {
    label: "Doctor Schedules",
    icon: "time-outline",
    permission: "doctor-schedules",
    route: "doctor-schedules",
  },
  {
    label: "Staff",
    icon: "people-circle-outline",
    permission: "staff",
    route: "staff",
  },
  {
    label: "Roles & Permissions",
    icon: "shield-checkmark-outline",
    permission: "roles-permissions",
    route: "roles-permissions",
  },
  {
    label: "Lab Master",
    icon: "flask-outline",
    permission: "lab",
    route: "lab",
  },
  {
    label: "Radiology Master",
    icon: "scan-circle-outline",
    permission: "radiology",
    route: "radiology",
  },
  {
    label: "Audit Logs",
    icon: "reader-outline",
    permission: "audit-logs",
    route: "audit-logs",
  },
  {
    label: "Integrations",
    icon: "extension-puzzle-outline",
    permission: "settings",
    route: "integrations",
  },
  {
    label: "Razorpay",
    icon: "card-outline",
    permission: "settings",
    route: "razorpay",
  },
  {
    label: "Exotel",
    icon: "call-outline",
    permission: "settings",
    route: "exotel",
  },
  {
    label: "Clinic Settings",
    icon: "settings-outline",
    permission: "settings",
    route: "settings",
  },
];
function More({
  user,
  go,
  logout,
}: {
  user: User;
  go: (tab: Tab) => void;
  logout: () => void;
}) {
  const [showProfile, setShowProfile] = useState(false),
    [webTool, setWebTool] = useState<MoreMenuItem | null>(null),
    admin = user.portal === "ADMIN",
    permissions = new Set(user.permissions || []);
  const canSee = (item: MoreMenuItem) =>
    admin ||
    !item.permission ||
    permissions.has(`${item.permission}.read`) ||
    permissions.has(`${item.permission}.view`) ||
    permissions.has(`${item.permission}.manage`) ||
    (item.permission === "appointments" &&
      [...permissions].some((p) => p.startsWith("appointments."))) ||
    (item.permission === "payments" &&
      permissions.has("appointments.payment_manage")) ||
    (item.permission === "lab-collection" &&
      user.roleCodes?.includes("LAB_TECHNICIAN"));
  const items = moreMenuItems.filter((item) => canSee(item) && (!item.labTechOnly || user.roleCodes?.includes("LAB_TECHNICIAN")));
  if (webTool?.route)
    return <WebWorkspace item={webTool} back={() => setWebTool(null)} />;
  if (showProfile)
    return (
      <ProfilePage
        user={user}
        logout={logout}
        back={() => setShowProfile(false)}
      />
    );
  return (
    <ScrollView
      contentContainerStyle={s.menuScroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.menuHeading}>
        <View>
          <Text style={s.pageEyebrow}>
            {admin ? "ADMIN WORKSPACE" : "STAFF WORKSPACE"}
          </Text>
          <Text style={s.pageTitle}>More</Text>
          <Text style={s.pageSubtitle}>
            {admin
              ? "All clinic tools and settings."
              : "Tools available for your role."}
          </Text>
        </View>
        <View style={s.menuHeadingIcon}>
          <Ionicons name="apps" size={35} color="#078F83" />
        </View>
      </View>
      <Pressable style={s.menuProfile} onPress={() => setShowProfile(true)}>
        <View style={s.menuAvatar}>
          <Text style={s.menuAvatarText}>
            {user.name
              .split(" ")
              .map((x) => x[0])
              .join("")
              .slice(0, 2)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.menuProfileName}>{user.name}</Text>
          <Text style={s.menuProfileRole}>
            {(user.roleCodes?.[0] || user.portal).replaceAll("_", " ")}
          </Text>
        </View>
        <Text style={s.menuViewProfile}>View profile</Text>
        <Ionicons name="chevron-forward" size={18} color="#078F83" />
      </Pressable>
      <Text style={s.menuSectionLabel}>AVAILABLE TOOLS</Text>
      <View style={s.menuGrid}>
        {items.map((item) => (
          <Pressable
            key={item.label}
            style={s.menuItem}
            onPress={() => (item.tab ? go(item.tab) : setWebTool(item))}
          >
            <View style={s.menuItemIcon}>
              <Ionicons name={item.icon} size={23} color="#078F83" />
            </View>
            <Text style={s.menuItemText}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color="#97A3B2" />
          </Pressable>
        ))}
      </View>
      {!items.length && (
        <View style={s.noTools}>
          <Ionicons name="lock-closed-outline" size={28} color="#078F83" />
          <Text style={s.noToolsTitle}>No additional tools assigned</Text>
          <Text style={s.noToolsText}>
            Ask your administrator to update your role permissions.
          </Text>
        </View>
      )}
      <Pressable style={s.menuLogout} onPress={logout}>
        <Ionicons name="log-out-outline" size={20} color="#E4474F" />
        <Text style={s.profileLogoutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
function WebWorkspace({
  item,
  back,
}: {
  item: MoreMenuItem;
  back: () => void;
}) {
  const [sessionScript, setSessionScript] = useState<string>();
  const embeddedStyleScript = `
    (function () {
      var id = 'careflow-mobile-embed-style';
      if (!document.getElementById(id)) {
        var style = document.createElement('style');
        style.id = id;
        style.textContent = [
          '.sidebar,.topbar{display:none!important}',
          '.shell{display:block!important;min-height:100vh!important}',
          '.shell main{width:100%!important;min-width:0!important;margin:0!important}',
          '.content{padding:16px!important}',
          '@media(max-width:760px){.content{padding:14px!important}}'
        ].join('');
        document.head.appendChild(style);
      }
      true;
    })();
  `;
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem("accessToken"),
      AsyncStorage.getItem("refreshToken"),
      AsyncStorage.getItem("user"),
    ]).then(([access, refresh, user]) =>
      setSessionScript(
        `localStorage.setItem('accessToken',${JSON.stringify(
          access || ""
        )});localStorage.setItem('refreshToken',${JSON.stringify(
          refresh || ""
        )});localStorage.setItem('user',${JSON.stringify(user || "{}")});true;`
      )
    );
  }, []);
  return (
    <View style={s.webScreen}>
      <View style={s.webBar}>
        <Pressable style={s.webBack} onPress={back}>
          <Ionicons name="arrow-back" size={22} color="#07182A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.webTitle}>{item.label}</Text>
          <Text style={s.webSubtitle}>CareFlow360 secure workspace</Text>
        </View>
        <Ionicons name="shield-checkmark-outline" size={23} color="#078F83" />
      </View>
      {sessionScript ? (
        <WebView
          source={{
            uri: `${WEB_APP_URL.replace(/\/$/, "")}/app/${
              item.route
            }?embedded=1`,
          }}
          injectedJavaScriptBeforeContentLoaded={sessionScript}
          injectedJavaScript={embeddedStyleScript}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={s.webLoading}>
              <ActivityIndicator color="#078F83" />
              <Text style={s.webLoadingText}>Opening {item.label}…</Text>
            </View>
          )}
          onMessage={async (event) => {
            try {
              const message = JSON.parse(event.nativeEvent.data);
              if (message.type === "PRINT_HTML" && message.html) await RNPrint.print({ html: message.html });
            } catch {
              Alert.alert("Unable to print", "The tube label could not be sent to the printer.");
            }
          }}
          onError={() =>
            Alert.alert(
              "Unable to open workspace",
              "Check your internet connection and web application URL."
            )
          }
        />
      ) : (
        <View style={s.webLoading}>
          <ActivityIndicator color="#078F83" />
        </View>
      )}
    </View>
  );
}
function ProfilePage({
  user,
  logout,
  back,
}: {
  user: User;
  logout: () => void;
  back: () => void;
}) {
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const role = (user.roleCodes?.[0] || user.portal).replaceAll("_", " ");
  return (
    <ScrollView
      contentContainerStyle={s.profileScroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.profileHeading}>
        <Pressable style={s.profileBack} onPress={back}>
          <Ionicons name="arrow-back" size={22} color="#07182A" />
        </Pressable>
        <View>
          <Text style={s.pageEyebrow}>MY ACCOUNT</Text>
          <Text style={s.pageTitle}>Profile</Text>
          <Text style={s.pageSubtitle}>
            Manage your account and preferences.
          </Text>
        </View>
        <View style={s.profileBrand}>
          <Ionicons name="medkit" size={30} color="#079589" />
          <Text style={s.profileBrandText}>CareFlow360</Text>
        </View>
      </View>
      <View style={s.profileHero}>
        <View style={s.profileOrbOne} />
        <View style={s.profileOrbTwo} />
        <View style={s.profileAvatar}>
          <Text style={s.profileAvatarText}>{initials}</Text>
          <View style={s.onlineDot} />
        </View>
        <Text style={s.profileName}>{user.name}</Text>
        <Text style={s.profileRole}>{role}</Text>
        <View style={s.verified}>
          <Ionicons name="checkmark-circle" size={15} color="#DFFAF5" />
          <Text style={s.verifiedText}>Verified staff account</Text>
        </View>
        <Pressable
          style={s.editProfile}
          onPress={() =>
            Alert.alert(
              "Edit profile",
              "Profile editing will be available soon."
            )
          }
        >
          <Ionicons name="create-outline" size={17} color="#078F83" />
          <Text style={s.editProfileText}>Edit Profile</Text>
        </Pressable>
      </View>
      <View style={s.profileStats}>
        <View style={s.profileStat}>
          <Text style={s.profileStatValue}>{user.roleCodes?.length || 1}</Text>
          <Text style={s.profileStatLabel}>Assigned roles</Text>
        </View>
        <View style={s.profileStatDivider} />
        <View style={s.profileStat}>
          <Text style={s.profileStatValue}>
            {user.permissions?.length || 0}
          </Text>
          <Text style={s.profileStatLabel}>Permissions</Text>
        </View>
        <View style={s.profileStatDivider} />
        <View style={s.profileStat}>
          <Text style={s.profileStatValue}>Active</Text>
          <Text style={s.profileStatLabel}>Account status</Text>
        </View>
      </View>
      <Text style={s.profileSectionTitle}>Personal information</Text>
      <View style={s.profileCard}>
        <ProfileInfo
          icon="person-outline"
          label="Full name"
          value={user.name}
        />
        <ProfileInfo
          icon="mail-outline"
          label="Work email"
          value={user.email}
        />
        <ProfileInfo
          icon="shield-checkmark-outline"
          label="Access role"
          value={role}
        />
      </View>
      <Text style={s.profileSectionTitle}>Settings</Text>
      <View style={s.profileCard}>
        <ProfileMenu icon="notifications-outline" label="Notifications" />
        <ProfileMenu icon="lock-closed-outline" label="Privacy & security" />
        <ProfileMenu icon="help-circle-outline" label="Help & support" />
        <ProfileMenu
          icon="information-circle-outline"
          label="About CareFlow360"
          last
        />
      </View>
      <Pressable style={s.profileLogout} onPress={logout}>
        <Ionicons name="log-out-outline" size={21} color="#E4474F" />
        <Text style={s.profileLogoutText}>Sign out</Text>
      </Pressable>
      <Text style={s.profileVersion}>CareFlow360 Staff · Version 1.0.0</Text>
    </ScrollView>
  );
}
function ProfileInfo({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <View style={s.profileInfo}>
      <View style={s.profileIcon}>
        <Ionicons name={icon} size={20} color="#078F83" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.profileInfoLabel}>{label}</Text>
        <Text style={s.profileInfoValue}>{value}</Text>
      </View>
    </View>
  );
}
function ProfileMenu({
  icon,
  label,
  last,
}: {
  icon: any;
  label: string;
  last?: boolean;
}) {
  return (
    <Pressable style={[s.profileMenu, last && { borderBottomWidth: 0 }]}>
      <View style={s.profileIcon}>
        <Ionicons name={icon} size={20} color="#078F83" />
      </View>
      <Text style={s.profileMenuText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#8290A2" />
    </Pressable>
  );
}
function Metric({
  icon,
  value,
  label,
  subtitle,
  color,
  tint,
}: {
  icon: any;
  value: any;
  label: string;
  subtitle: string;
  color: string;
  tint: string;
}) {
  return (
    <Card style={s.metric}>
      <View style={[s.metricIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <View style={s.metricCopy}>
        <Text style={s.metricValue}>{value}</Text>
        <Text style={s.metricLabel}>{label}</Text>
        <Text style={s.metricSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={color} />
    </Card>
  );
}
function Quick({
  icon,
  label,
  color,
  tint,
  onPress,
}: {
  icon: any;
  label: string;
  color: string;
  tint: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={s.quickItem} onPress={onPress}>
      <View style={[s.quickIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={30} color={color} />
      </View>
      <Text style={s.quickText}>{label}</Text>
    </Pressable>
  );
}
function Summary({
  icon,
  value,
  label,
  color,
  tint,
}: {
  icon: any;
  value: string | number;
  label: string;
  color: string;
  tint: string;
}) {
  return (
    <View style={[s.summaryCard, { backgroundColor: tint }]}>
      <Ionicons name={icon} size={27} color={color} />
      <View>
        <Text style={s.summaryValue}>{value}</Text>
        <Text style={s.summaryLabel}>{label}</Text>
      </View>
    </View>
  );
}
const homeStyles = StyleSheet.create({
  header: {
    height: 86,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FBFC",
  },
  headerIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#079589",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#079589",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: { color: "white", fontWeight: "900", fontSize: 16 },
  hello: { fontSize: 18, fontWeight: "900", color: "#07182A" },
  role: {
    fontSize: 11,
    color: "#68778C",
    fontWeight: "600",
    textTransform: "uppercase",
    marginTop: 4,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#466",
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 2,
  },
  dot: {
    position: "absolute",
    right: 7,
    top: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF4B55",
  },
  miniBrand: {
    width: 72,
    height: 62,
    borderRadius: 15,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#466",
    shadowOpacity: 0.06,
    shadowRadius: 7,
    elevation: 2,
  },
  miniBrandText: {
    fontSize: 9,
    color: "#078F83",
    fontWeight: "900",
    marginTop: 1,
  },
  miniBrandSub: { fontSize: 4.5, color: "#768693" },
  homeScroll: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    backgroundColor: "#F8FBFC",
  },
  hero: {
    height: 205,
    backgroundColor: "#07887D",
    borderRadius: 23,
    padding: 23,
    overflow: "hidden",
    position: "relative",
  },
  heroCopy: { width: "58%", zIndex: 3 },
  heroDate: { fontSize: 12, color: "#D9F2EF", marginBottom: 12 },
  heroTitle: {
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "900",
    color: "white",
  },
  heroSub: { fontSize: 12.5, lineHeight: 17, color: "white", marginTop: 8 },
  heroButton: {
    height: 34,
    minWidth: 132,
    alignSelf: "flex-start",
    paddingHorizontal: 17,
    borderRadius: 18,
    backgroundColor: "white",
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 13,
  },
  heroButtonText: { fontSize: 12.5, fontWeight: "900", color: "#07182A" },
  overviewPill: {
    position: "absolute",
    right: 16,
    top: 17,
    height: 29,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,.15)",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    zIndex: 4,
  },
  heroOver: { fontSize: 10, color: "white", fontWeight: "900" },
  microscope: {
    position: "absolute",
    width: 143,
    height: 180,
    right: 8,
    bottom: -7,
    resizeMode: "contain",
    zIndex: 2,
  },
  heroBubble: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 115,
    right: -15,
    top: -5,
    backgroundColor: "rgba(0,108,99,.34)",
  },
  heroBubbleTwo: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -65,
    bottom: -85,
    backgroundColor: "rgba(3,157,144,.35)",
  },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
  metric: {
    width: "48.4%",
    height: 94,
    padding: 10,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "white",
  },
  metricIcon: {
    width: 51,
    height: 51,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  metricCopy: { flex: 1 },
  metricValue: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "900",
    color: "#07182A",
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#07182A",
    marginTop: 1,
  },
  metricSub: { fontSize: 10, color: "#6B7A8E", marginTop: 3 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 25,
    marginBottom: 12,
    paddingHorizontal: 3,
  },
  section: {
    fontSize: 18,
    fontWeight: "900",
    color: "#07182A",
    marginTop: 0,
    marginBottom: 0,
  },
  seeAll: { fontSize: 12, color: "#078F83", fontWeight: "900" },
  quick: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  quickItem: {
    flex: 1,
    height: 103,
    borderRadius: 20,
    backgroundColor: "white",
    alignItems: "center",
    paddingTop: 9,
    shadowColor: "#426",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  quickIcon: {
    width: 57,
    height: 57,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  quickText: {
    fontSize: 10.5,
    textAlign: "center",
    fontWeight: "800",
    color: "#07182A",
    marginTop: 7,
  },
  nextCard: {
    minHeight: 91,
    borderRadius: 21,
    backgroundColor: "white",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#426",
    shadowOpacity: 0.06,
    shadowRadius: 9,
    elevation: 2,
  },
  nextAvatar: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: "#DDF8F5",
    alignItems: "center",
    justifyContent: "center",
  },
  nextAvatarText: { fontSize: 15, color: "#079589", fontWeight: "900" },
  nextName: { fontSize: 13.5, color: "#07182A", fontWeight: "900" },
  nextDoctor: { fontSize: 11.5, color: "#162D43", marginTop: 3 },
  nextTag: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E7F3F3",
    marginTop: 6,
  },
  nextTagText: { fontSize: 9.5, color: "#173D51" },
  nextTime: { fontSize: 11.5, color: "#07182A", fontWeight: "700" },
  tabs: {
    height: 82,
    backgroundColor: "white",
    borderTopWidth: 0,
    flexDirection: "row",
    paddingBottom: 8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#355",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  tabText: { fontSize: 10.5, color: "#667489", fontWeight: "600" },
  active: { color: "#078F83", fontWeight: "900" },
});
const pageStyles = StyleSheet.create({
  listScreen: { flex: 1, paddingHorizontal: 18, backgroundColor: "#F8FBFC" },
  pageHeading: {
    height: 175,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: 24,
  },
  pageEyebrow: {
    fontSize: 11,
    letterSpacing: 4,
    color: "#68758A",
    fontWeight: "800",
  },
  pageTitle: {
    fontSize: 31,
    lineHeight: 38,
    color: "#07182A",
    fontWeight: "900",
    marginTop: 10,
  },
  pageSubtitle: { fontSize: 13, color: "#6B7890", marginTop: 6 },
  headingArt: {
    width: 125,
    height: 125,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  artCircle: {
    position: "absolute",
    width: 125,
    height: 125,
    borderRadius: 63,
    backgroundColor: "#E4F8F5",
    zIndex: -1,
  },
  rupeeArt: {
    position: "absolute",
    fontSize: 25,
    fontWeight: "900",
    color: "#079589",
    bottom: 27,
  },
  segment: {
    height: 52,
    flexDirection: "row",
    borderRadius: 16,
    backgroundColor: "white",
    marginBottom: 19,
    shadowColor: "#244",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  segmentOn: { backgroundColor: "#078F83" },
  segmentText: { fontSize: 14, color: "#07182A", fontWeight: "800" },
  segmentOnText: { fontSize: 14, color: "white", fontWeight: "900" },
  toolRow: { height: 49, flexDirection: "row", gap: 10, marginBottom: 16 },
  pageSearch: {
    flex: 1,
    borderRadius: 15,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E4EAED",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  toolBtn: {
    minWidth: 67,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E4EAED",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  toolText: { fontSize: 12, color: "#07182A", fontWeight: "800" },
  recordCard: {
    marginBottom: 12,
    borderRadius: 20,
    padding: 15,
    borderWidth: 0,
    shadowOpacity: 0.06,
  },
  cardTitle: { fontSize: 15, fontWeight: "900", color: "#07182A", flex: 1 },
  cardSub: { fontSize: 12.5, color: "#64718A", marginTop: 6, lineHeight: 18 },
  pill: {
    fontSize: 9,
    fontWeight: "900",
    color: "#075D59",
    backgroundColor: "#DDF6F2",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    overflow: "hidden",
    textTransform: "uppercase",
  },
  cardMeta: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    marginTop: 11,
  },
  collect: {
    height: 49,
    backgroundColor: "#078F83",
    borderRadius: 14,
    marginTop: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  paymentSummary: {
    height: 72,
    flexDirection: "row",
    gap: 8,
    marginBottom: 17,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 15,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 4,
    borderColor: "white",
  },
  summaryValue: { fontSize: 18, fontWeight: "900", color: "#07182A" },
  summaryLabel: { fontSize: 9.5, color: "#66758B", marginTop: 3 },
  paymentCard: {
    marginBottom: 11,
    borderRadius: 18,
    padding: 14,
    borderWidth: 0,
    shadowOpacity: 0.06,
  },
  amount: { fontSize: 17, fontWeight: "900", color: "#07182A" },
  paid: {
    alignSelf: "flex-end",
    fontSize: 9,
    fontWeight: "900",
    color: "#096646",
    backgroundColor: "#DDF8EA",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    marginTop: 9,
    overflow: "hidden",
    textTransform: "uppercase",
  },
  scannerScreen: { flex: 1, backgroundColor: "#07182A" },
  scannerHead: { minHeight: 82, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 18 },
  scannerHeadLight: { minHeight: 76, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 15, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E6EDF2" },
  scannerTitle: { color: "white", fontSize: 21, fontWeight: "800" },
  scannerCount: { color: "#9BE8DF", marginTop: 3, fontWeight: "700" },
  scannerFoot: { padding: 20, backgroundColor: "#07182A" },
  scannerHelp: { color: "white", textAlign: "center", marginBottom: 14 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(7,24,42,.55)", justifyContent: "center", padding: 22 },
  modalCard: { backgroundColor: "white", borderRadius: 22, padding: 22, gap: 12 },
  formInput: { height: 54, borderWidth: 1, borderColor: "#D6DFE8", borderRadius: 14, paddingHorizontal: 16, fontSize: 18, color: "#07182A" },
});
const profileStyles = StyleSheet.create({
  profileScroll: {
    paddingHorizontal: 18,
    paddingBottom: 30,
    backgroundColor: "#F8FBFC",
  },
  profileHeading: {
    height: 128,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileBrand: {
    width: 86,
    height: 66,
    borderRadius: 18,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#274B4A",
    shadowOpacity: 0.07,
    shadowRadius: 9,
    elevation: 2,
  },
  profileBrandText: {
    fontSize: 9,
    color: "#078F83",
    fontWeight: "900",
    marginTop: 2,
  },
  profileHero: {
    height: 262,
    borderRadius: 28,
    backgroundColor: "#078F83",
    alignItems: "center",
    paddingTop: 24,
    overflow: "hidden",
    shadowColor: "#087A72",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 5,
  },
  profileOrbOne: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    right: -70,
    top: -80,
    backgroundColor: "rgba(255,255,255,.08)",
  },
  profileOrbTwo: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    left: -70,
    bottom: -70,
    backgroundColor: "rgba(0,80,74,.14)",
  },
  profileAvatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#DDF8F4",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,.5)",
  },
  profileAvatarText: { fontSize: 28, color: "#078F83", fontWeight: "900" },
  onlineDot: {
    position: "absolute",
    right: 1,
    bottom: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#45D39A",
    borderWidth: 3,
    borderColor: "white",
  },
  profileName: {
    fontSize: 22,
    color: "white",
    fontWeight: "900",
    marginTop: 11,
  },
  profileRole: {
    fontSize: 11,
    color: "#C8EFEB",
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 4,
  },
  verified: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 7,
  },
  verifiedText: { fontSize: 10, color: "#DFFAF5" },
  editProfile: {
    position: "absolute",
    right: 17,
    top: 17,
    height: 35,
    borderRadius: 18,
    backgroundColor: "white",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  editProfileText: { fontSize: 11, color: "#078F83", fontWeight: "900" },
  profileStats: {
    height: 83,
    marginTop: -27,
    marginHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 9,
    shadowColor: "#274B4A",
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 6,
  },
  profileStat: { flex: 1, alignItems: "center" },
  profileStatValue: {
    fontSize: 16,
    color: "#07182A",
    fontWeight: "900",
    textTransform: "capitalize",
  },
  profileStatLabel: { fontSize: 9, color: "#738197", marginTop: 5 },
  profileStatDivider: { width: 1, height: 34, backgroundColor: "#E4EAED" },
  profileSectionTitle: {
    fontSize: 16,
    color: "#07182A",
    fontWeight: "900",
    marginTop: 25,
    marginBottom: 11,
    marginLeft: 3,
  },
  profileCard: {
    borderRadius: 21,
    backgroundColor: "white",
    paddingHorizontal: 15,
    shadowColor: "#274B4A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  profileInfo: {
    height: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F3",
  },
  profileIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: "#E5F8F5",
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfoLabel: { fontSize: 9.5, color: "#8290A2", marginBottom: 4 },
  profileInfoValue: {
    fontSize: 13,
    color: "#12263A",
    fontWeight: "800",
    textTransform: "capitalize",
  },
  profileMenu: {
    height: 61,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F3",
  },
  profileMenuText: {
    flex: 1,
    fontSize: 13,
    color: "#12263A",
    fontWeight: "700",
  },
  profileLogout: {
    height: 54,
    borderRadius: 17,
    backgroundColor: "#FFF0F1",
    borderWidth: 1,
    borderColor: "#FFDADD",
    marginTop: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  profileLogoutText: { fontSize: 14, color: "#E4474F", fontWeight: "900" },
  profileVersion: {
    fontSize: 9.5,
    color: "#96A1AE",
    textAlign: "center",
    marginTop: 17,
  },
});
const menuStyles = StyleSheet.create({
  menuScroll: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    backgroundColor: "#F8FBFC",
  },
  menuHeading: {
    height: 125,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuHeadingIcon: {
    width: 65,
    height: 65,
    borderRadius: 21,
    backgroundColor: "#E4F8F5",
    alignItems: "center",
    justifyContent: "center",
  },
  menuProfile: {
    minHeight: 84,
    borderRadius: 21,
    backgroundColor: "#078F83",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    shadowColor: "#078F83",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  menuAvatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  menuAvatarText: { fontSize: 18, color: "#078F83", fontWeight: "900" },
  menuProfileName: { fontSize: 15, color: "white", fontWeight: "900" },
  menuProfileRole: {
    fontSize: 9.5,
    color: "#C9EFEB",
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 4,
  },
  menuViewProfile: { fontSize: 10, color: "white", fontWeight: "800" },
  menuSectionLabel: {
    fontSize: 10,
    letterSpacing: 2.2,
    color: "#758399",
    fontWeight: "900",
    marginTop: 24,
    marginBottom: 11,
    marginLeft: 3,
  },
  menuGrid: {
    borderRadius: 21,
    backgroundColor: "white",
    paddingHorizontal: 14,
    shadowColor: "#274B4A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  menuItem: {
    height: 61,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F3",
  },
  menuItemIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: "#E5F8F5",
    alignItems: "center",
    justifyContent: "center",
  },
  menuItemText: { flex: 1, fontSize: 13, color: "#12263A", fontWeight: "700" },
  noTools: {
    alignItems: "center",
    padding: 30,
    borderRadius: 21,
    backgroundColor: "white",
  },
  noToolsTitle: {
    fontSize: 14,
    color: "#12263A",
    fontWeight: "900",
    marginTop: 10,
  },
  noToolsText: {
    fontSize: 11,
    color: "#758399",
    textAlign: "center",
    marginTop: 5,
  },
  menuLogout: {
    height: 52,
    borderRadius: 17,
    backgroundColor: "#FFF0F1",
    borderWidth: 1,
    borderColor: "#FFDADD",
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  profileBack: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    shadowColor: "#274B4A",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  profileHeading: {
    height: 128,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
const webStyles = StyleSheet.create({
  webScreen: { flex: 1, backgroundColor: "#F8FBFC" },
  webBar: {
    height: 62,
    paddingHorizontal: 14,
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EEEF",
  },
  webBack: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#E5F8F5",
    alignItems: "center",
    justifyContent: "center",
  },
  webTitle: { fontSize: 15, color: "#07182A", fontWeight: "900" },
  webSubtitle: { fontSize: 9.5, color: "#718096", marginTop: 3 },
  webLoading: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#F8FBFC",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  webLoadingText: { fontSize: 12, color: "#64748B" },
});
const loginStyles = StyleSheet.create({
  loginSafe: { flex: 1, backgroundColor: "#F8FCFC" },
  loginScroll: {
    minHeight: 920,
    paddingTop: 34,
    paddingBottom: 35,
    overflow: "hidden",
    backgroundColor: "#F8FCFC",
  },
  loginGlowOne: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 170,
    right: -165,
    top: -90,
    backgroundColor: "#DFF6F5",
  },
  loginGlowTwo: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    left: -110,
    bottom: -90,
    backgroundColor: "#DDF6F5",
  },
  brandRow: {
    marginLeft: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    zIndex: 2,
  },
  logo: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: "#068C80",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#006E65",
    shadowOpacity: 0.18,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  brand: {
    fontSize: 25,
    fontWeight: "900",
    color: "#071C2B",
    letterSpacing: -1,
  },
  brand360: { color: "#079B8E" },
  brandSub: { fontSize: 8, letterSpacing: 3.1, color: "#72819A", marginTop: 4 },
  promise: { position: "absolute", right: 22, top: 87, zIndex: 2 },
  promiseText: {
    fontSize: 15,
    lineHeight: 19,
    color: "#9DBDC4",
    fontWeight: "700",
  },
  promiseStrong: {
    fontSize: 16,
    lineHeight: 20,
    color: "#347B7E",
    fontWeight: "900",
  },
  promiseLine: {
    width: 17,
    height: 2,
    borderRadius: 2,
    backgroundColor: "#08A092",
    marginTop: 12,
  },
  intro: { marginLeft: 32, marginTop: 43, zIndex: 2 },
  loginTitle: {
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "900",
    color: "#103C42",
    letterSpacing: -0.5,
  },
  loginSub: { fontSize: 15, color: "#73849C", lineHeight: 22, marginTop: 15 },
  hospitalWrap: {
    position: "absolute",
    right: -76,
    top: 192,
    width: 260,
    height: 260,
    borderRadius: 130,
    overflow: "hidden",
    borderWidth: 11,
    borderColor: "#D6F2F6",
  },
  hospitalImage: { width: "100%", height: "100%", resizeMode: "cover" },
  loginCard: {
    marginHorizontal: 17,
    marginTop: 28,
    backgroundColor: "rgba(255,255,255,.96)",
    borderRadius: 30,
    padding: 19,
    shadowColor: "#246C6A",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    zIndex: 3,
  },
  portal: {
    height: 50,
    flexDirection: "row",
    backgroundColor: "#EFF3F4",
    borderRadius: 15,
    padding: 2,
    marginBottom: 14,
  },
  portalBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  portalActive: {
    backgroundColor: "#078F83",
    shadowColor: "#087B72",
    shadowOpacity: 0.2,
    shadowRadius: 7,
    elevation: 3,
  },
  portalText: { color: "#576A82", fontWeight: "800", fontSize: 15 },
  portalActiveText: { color: "white", fontWeight: "900", fontSize: 15 },
  inputWrap: {
    height: 53,
    borderWidth: 1,
    borderColor: "#D9E0E5",
    borderRadius: 15,
    marginTop: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#FFF",
  },
  loginInput: { flex: 1, fontSize: 15, color: colors.ink },
  loginOptions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  remember: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#A8B7C1",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: "#079589", borderColor: "#079589" },
  optionText: { fontSize: 13, color: "#52667F" },
  forgot: { fontSize: 13, color: "#078F83", fontWeight: "800" },
  primaryBtn: {
    height: 55,
    backgroundColor: "#078F83",
    borderRadius: 16,
    marginTop: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#078F83",
    shadowOpacity: 0.23,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  primaryText: { color: "white", fontSize: 16, fontWeight: "900" },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 18,
  },
  divider: { height: 1, backgroundColor: "#D7DEE3", flex: 1 },
  dividerText: { fontSize: 10, color: "#6E7E94", fontWeight: "800" },
  googleBtn: {
    height: 51,
    borderRadius: 15,
    backgroundColor: "#F2F5F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
  },
  googleText: { fontSize: 15, color: "#12283C", fontWeight: "800" },
  benefits: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 20,
    paddingHorizontal: 12,
  },
  benefit: { width: "31%", alignItems: "center" },
  benefitIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E6F7F5",
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: {
    fontSize: 11,
    color: "#19334B",
    fontWeight: "700",
    textAlign: "center",
    marginTop: 7,
  },
  tagline: {
    fontSize: 9,
    letterSpacing: 2,
    color: "#8595AA",
    textAlign: "center",
    marginTop: 24,
  },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 17,
  },
  pageOn: { width: 15, height: 5, borderRadius: 3, backgroundColor: "#07998C" },
  pageDot: {
    width: 10,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#B9E4E0",
  },
});
const s: any = StyleSheet.create(
  Object.assign(
    {},
    {
      safe: {
        flex: 1,
        backgroundColor: colors.canvas,
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
      },
      center: { flex: 1, alignItems: "center", justifyContent: "center" },
      body: { flex: 1 },
      header: {
        height: 70,
        paddingHorizontal: 20,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.canvas,
      },
      hello: { fontSize: 18, fontWeight: "800", color: colors.ink },
      role: {
        fontSize: 11,
        color: colors.primary,
        fontWeight: "700",
        textTransform: "capitalize",
        marginTop: 3,
      },
      bell: {
        width: 43,
        height: 43,
        borderRadius: 15,
        backgroundColor: "white",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: colors.line,
      },
      dot: {
        position: "absolute",
        right: 10,
        top: 9,
        width: 7,
        height: 7,
        borderRadius: 5,
        backgroundColor: colors.accent,
      },
      tabs: {
        height: 72,
        backgroundColor: "white",
        borderTopWidth: 1,
        borderTopColor: colors.line,
        flexDirection: "row",
        paddingBottom: 5,
      },
      tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
      tabText: { fontSize: 10, color: colors.muted, fontWeight: "600" },
      active: { color: colors.primary, fontWeight: "800" },
      scroll: { padding: 18, paddingBottom: 30 },
      screen: { flex: 1, padding: 18 },
      hero: {
        backgroundColor: colors.primary,
        borderRadius: 24,
        padding: 21,
        flexDirection: "row",
        alignItems: "center",
      },
      heroOver: {
        fontSize: 10,
        letterSpacing: 1.4,
        color: "#BCE5DF",
        fontWeight: "800",
      },
      heroTitle: {
        fontSize: 22,
        fontWeight: "800",
        color: "white",
        marginTop: 7,
        maxWidth: 240,
      },
      heroSub: { fontSize: 12, color: "#D9F1ED", marginTop: 7 },
      heroIcon: {
        width: 58,
        height: 58,
        borderRadius: 19,
        backgroundColor: "#FFFFFF22",
        alignItems: "center",
        justifyContent: "center",
      },
      metrics: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginTop: 14,
      },
      metric: { width: "48.4%", padding: 13 },
      metricIcon: {
        width: 34,
        height: 34,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
      },
      metricValue: {
        fontSize: 20,
        fontWeight: "800",
        color: colors.ink,
        marginTop: 9,
      },
      metricLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
      section: {
        fontSize: 16,
        fontWeight: "800",
        color: colors.ink,
        marginTop: 24,
        marginBottom: 12,
      },
      quick: { flexDirection: "row", justifyContent: "space-between" },
      quickItem: { width: "23%", alignItems: "center", gap: 7 },
      quickIcon: {
        width: 52,
        height: 52,
        borderRadius: 17,
        backgroundColor: colors.softTeal,
        alignItems: "center",
        justifyContent: "center",
      },
      quickText: {
        fontSize: 10,
        textAlign: "center",
        fontWeight: "700",
        color: colors.ink,
      },
      chips: { flexDirection: "row", gap: 8, marginBottom: 16 },
      chip: {
        paddingHorizontal: 15,
        paddingVertical: 9,
        borderRadius: 20,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: colors.line,
      },
      chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
      chipText: { fontSize: 12, fontWeight: "700", color: colors.muted },
      chipOnText: { fontSize: 12, fontWeight: "800", color: "white" },
      cardTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      },
      cardTitle: {
        fontSize: 15,
        fontWeight: "800",
        color: colors.ink,
        flex: 1,
      },
      cardSub: { fontSize: 12, color: colors.muted, marginTop: 6 },
      pill: {
        fontSize: 9,
        fontWeight: "800",
        color: colors.primary,
        backgroundColor: colors.softTeal,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 12,
        overflow: "hidden",
      },
      cardMeta: {
        flexDirection: "row",
        gap: 5,
        alignItems: "center",
        marginTop: 9,
      },
      collect: {
        backgroundColor: colors.primary,
        borderRadius: 12,
        padding: 12,
        marginTop: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
      },
      search: {
        height: 49,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 15,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        gap: 9,
        marginBottom: 12,
      },
      amount: { fontSize: 17, fontWeight: "800", color: colors.ink },
      paid: {
        alignSelf: "flex-start",
        fontSize: 9,
        fontWeight: "800",
        color: colors.success,
        backgroundColor: "#E9F8F0",
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 10,
        marginTop: 10,
        overflow: "hidden",
      },
      logout: {
        flexDirection: "row",
        gap: 10,
        paddingVertical: 17,
        alignItems: "center",
      },
    },
    loginStyles,
    homeStyles,
    pageStyles,
    profileStyles,
    menuStyles,
    webStyles
  ) as any
);
