import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import type { AppState } from '../types';
import {
  buildUiInitialState,
  loadAppState,
  scheduleSave,
  seedAndPersist,
  setFallbackListener,
  subscribeStorageChanges,
} from '../storage/chromeStorage';
import type { AppAction } from './appReducer';
import { appReducer } from './appReducer';

interface AppStateContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  isLoading: boolean;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

function emptyState(): AppState {
  return {
    spaces: [],
    currentSpaceId: '',
    settings: {
      theme: 'light',
      accent: '#5b6cff',
      background: 'plain',
      layoutSizes: { combined: 45, notes: 35, tasks: 45, reminder: 50 },
      mainBlockOrder: ['combined', 'notes', 'reminders'],
      collapsedBlocks: { tasks: false, reminder: false, habits: false, notes: false, reminders: false },
    },
    ui: buildUiInitialState(),
    storageFallbackActive: false,
  };
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, emptyState());
  const [isLoading, setIsLoading] = React.useState(true);
  const hydratedRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Bootstrap: load từ storage hoặc seed nếu rỗng.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadAppState();
      const result = loaded ?? (await seedAndPersist());
      if (cancelled) return;
      dispatch({
        type: 'HYDRATE',
        payload: {
          spaces: result.spaces,
          currentSpaceId: result.currentSpaceId,
          settings: result.settings,
          storageFallbackActive: result.storageFallbackActive,
        },
      });
      hydratedRef.current = true;
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Lắng nghe cảnh báo fallback khi flushSave debounce phát hiện quota vượt.
  useEffect(() => {
    setFallbackListener((active) => {
      if (active) dispatch({ type: 'SET_STORAGE_FALLBACK_ACTIVE', payload: { active: true } });
    });
  }, []);

  // Đồng bộ UI giữa các máy: khi storage.onChanged bắn (đổi từ máy khác qua sync),
  // reload lại toàn bộ state. So sánh JSON với state hiện tại để tránh re-hydrate
  // vô nghĩa ngay sau khi chính tab này vừa tự ghi (areaName vẫn bắn dù do mình ghi).
  useEffect(() => {
    const unsubscribe = subscribeStorageChanges(() => {
      if (!hydratedRef.current) return;
      void (async () => {
        const loaded = await loadAppState();
        if (!loaded) return;
        const currentSnapshot = JSON.stringify({
          spaces: stateRef.current.spaces,
          currentSpaceId: stateRef.current.currentSpaceId,
          settings: stateRef.current.settings,
        });
        const loadedSnapshot = JSON.stringify({
          spaces: loaded.spaces,
          currentSpaceId: loaded.currentSpaceId,
          settings: loaded.settings,
        });
        if (currentSnapshot === loadedSnapshot) return;
        dispatch({
          type: 'HYDRATE',
          payload: {
            spaces: loaded.spaces,
            currentSpaceId: loaded.currentSpaceId,
            settings: loaded.settings,
            storageFallbackActive: loaded.storageFallbackActive,
          },
        });
      })();
    });
    return unsubscribe;
  }, []);

  // Debounce save khi spaces/currentSpaceId/settings đổi (KHÔNG theo dõi state.ui).
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    scheduleSave({ spaces: state.spaces, currentSpaceId: state.currentSpaceId, settings: state.settings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.spaces, state.currentSpaceId, state.settings]);

  return (
    <AppStateContext.Provider value={{ state, dispatch, isLoading }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}

export function useCurrentSpace() {
  const { state } = useAppState();
  const space = state.spaces.find((s) => s.id === state.currentSpaceId);
  if (!space) throw new Error('Current space not found');
  return space;
}
