import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_BASE_URL = "https://crm.hosmedai.com/api";
async function request(path: string, options: RequestInit = {}) {
  const token = await AsyncStorage.getItem("patientAccessToken");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.message || "Request failed");
  return json.data;
}
export const patientApi = {
  clinics: () => request("/patient/clinics"),
  requestOtp: (tenantId: string, mobile: string) =>
    request("/patient/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ tenantId, mobile }),
    }),
  verifyOtp: async (tenantId: string, mobile: string, otp: string) => {
    const data = await request("/patient/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ tenantId, mobile, otp }),
    });
    await Promise.all([
      AsyncStorage.setItem("patientAccessToken", data.accessToken),
      AsyncStorage.setItem("patientClinicId", tenantId),
      AsyncStorage.setItem("patientProfile", JSON.stringify(data.patient)),
    ]);
    return data;
  },
  bootstrap: () => request("/patient/bootstrap"),
  bookDoctor: (payload: object) =>
    request("/patient/doctor-bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  bookLab: (payload: object) =>
    request("/patient/lab-bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  session: async () => ({
    token: await AsyncStorage.getItem("patientAccessToken"),
    clinicId: await AsyncStorage.getItem("patientClinicId"),
    profile: JSON.parse(
      (await AsyncStorage.getItem("patientProfile")) || "null"
    ),
  }),
  logout: () =>
    Promise.all(
      ["patientAccessToken", "patientClinicId", "patientProfile"].map((key) =>
        AsyncStorage.removeItem(key)
      )
    ),
};
