export interface AuthUser {
	id: string;
	username: string;
}

export interface AuthState {
	isAuthenticated: boolean;
	user: AuthUser | null;
	setUser: (user: AuthUser) => void;
	clearUser: () => void;
}

type StoreListener = () => void;

export interface AuthStore {
	getState: () => AuthState;
	subscribe: (listener: StoreListener) => () => void;
}

export function createAuthStore(): AuthStore {
	let state: { isAuthenticated: boolean; user: AuthUser | null } = {
		isAuthenticated: false,
		user: null,
	};
	const listeners = new Set<StoreListener>();

	function notify() {
		for (const listener of listeners) {
			listener();
		}
	}

	function setUser(user: AuthUser) {
		state = { isAuthenticated: true, user };
		notify();
	}

	function clearUser() {
		state = { isAuthenticated: false, user: null };
		notify();
	}

	return {
		getState: () => ({ ...state, setUser, clearUser }),
		subscribe: (listener: StoreListener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
