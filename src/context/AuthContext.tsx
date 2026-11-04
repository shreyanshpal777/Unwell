import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, UNAUTHORIZED_EVENT, type ProfileUpdate, type RegistrationPayload, type SessionUser } from "../services/api";

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (payload: RegistrationPayload) => Promise<SessionUser>;
  updateProfile: (payload: ProfileUpdate) => Promise<SessionUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {
    throw new Error("AuthProvider missing");
  },
  register: async () => {
    throw new Error("AuthProvider missing");
  },
  updateProfile: async () => {
    throw new Error("AuthProvider missing");
  },
  logout: async () => {
    throw new Error("AuthProvider missing");
  }
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clearSession = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, clearSession);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, clearSession);
  }, []);

  useEffect(() => {
    let active = true;
    api
      .getCurrentUser()
      .then((session) => {
        if (active) setUser(session);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.loginUser(email, password);
    setUser(session);
    return session;
  }, []);

  const register = useCallback(async (payload: RegistrationPayload) => {
    const session = await api.registerUser(payload);
    setUser(session);
    return session;
  }, []);

  const updateProfile = useCallback(async (payload: ProfileUpdate) => {
    const session = await api.updateProfile(payload);
    setUser(session);
    return session;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logoutUser();
    } finally {
      setUser(null);
    }
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, register, updateProfile, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const homeFor = (role: string) => (role === "admin" ? "/admin" : role === "trainer" ? "/trainer" : "/");
