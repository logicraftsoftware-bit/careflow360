import axios from "axios";

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

api.interceptors.request.use((request) => {
  const token = localStorage.getItem("accessToken");
  const isAuthenticationRequest = String(request.url || "").includes("/auth/login") || String(request.url || "").includes("/auth/refresh");
  if (token && !isAuthenticationRequest) request.headers.Authorization = `Bearer ${token}`;
  return request;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) throw new Error("No refresh token");
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken })
      .then(({ data }) => {
        localStorage.setItem("accessToken", data.data.accessToken);
        localStorage.setItem("refreshToken", data.data.refreshToken);
        return data.data.accessToken as string;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const responseBody = typeof error.response?.data === "string" ? error.response.data : "";
    if (error.response?.status === 400 && /request header or cookie too large/i.test(responseBody)) {
      localStorage.clear();
      location.href = "/login?reason=session-reset";
      return Promise.reject(error);
    }
    if (error.response?.status === 401 && request && !request._retry) {
      request._retry = true;
      try {
        request.headers.Authorization = `Bearer ${await refreshAccessToken()}`;
        return api(request);
      } catch {
        localStorage.clear();
        location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export const unwrap = (response: any) => response.data.data;
