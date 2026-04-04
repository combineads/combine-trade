import { create } from "zustand";
import { apiGet, apiPost, setOnUnauthorized } from "../lib/api.ts";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (password: string): Promise<boolean> => {
    if (!password.trim()) {
      set({ error: "비밀번호를 입력해 주세요.", isLoading: false });
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      await apiPost("/login", { password });
      set({ isAuthenticated: true, isLoading: false, error: null });
      return true;
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "비밀번호가 일치하지 않습니다. 다시 입력해 주세요.";
      set({
        isAuthenticated: false,
        isLoading: false,
        error: message,
      });
      return false;
    }
  },

  logout: () => {
    // Fire-and-forget — best effort
    apiPost("/logout").catch(() => {});
    set({ isAuthenticated: false, isLoading: false, error: null });
  },

  checkAuth: async () => {
    try {
      await apiGet("/me");
      set({ isAuthenticated: true });
    } catch {
      set({ isAuthenticated: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));

// Wire up 401 interceptor: api module calls this on unauthorized responses
setOnUnauthorized(() => {
  useAuthStore.getState().logout();
  window.location.href = "/login";
});
