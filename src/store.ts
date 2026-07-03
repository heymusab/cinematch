import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Movie } from './types';

interface AppState {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  toggleFavorite: (movieId: number) => void;
  toggleWatchlist: (movieId: number) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      login: (user) => {
        set({ user });
      },
      logout: () => set({ user: null }),
      toggleFavorite: (movieId) => {
        set((state) => {
          if (!state.user) return state;
          const isFav = state.user.favorites.includes(movieId);
          const updatedFavorites = isFav
            ? state.user.favorites.filter((id) => id !== movieId)
            : [...state.user.favorites, movieId];
          
          const updatedUser = {
            ...state.user,
            favorites: updatedFavorites,
          };

          // Async sync to backend
          fetch('/api/user/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: state.user.email,
              favorites: updatedFavorites,
              watchlist: state.user.watchlist,
            }),
          }).catch((err) => console.error("Failed to sync favorites to backend:", err));

          return { user: updatedUser };
        });
      },
      toggleWatchlist: (movieId) => {
        set((state) => {
          if (!state.user) return state;
          const isWatch = state.user.watchlist.includes(movieId);
          const updatedWatchlist = isWatch
            ? state.user.watchlist.filter((id) => id !== movieId)
            : [...state.user.watchlist, movieId];
          
          const updatedUser = {
            ...state.user,
            watchlist: updatedWatchlist,
          };

          // Async sync to backend
          fetch('/api/user/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: state.user.email,
              favorites: state.user.favorites,
              watchlist: updatedWatchlist,
            }),
          }).catch((err) => console.error("Failed to sync watchlist to backend:", err));

          return { user: updatedUser };
        });
      },
    }),
    {
      name: 'cinematch-storage',
    }
  )
);
