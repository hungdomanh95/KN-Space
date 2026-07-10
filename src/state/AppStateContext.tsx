import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import type { AppState, Space } from '../types';
import {
  forceFlush,
  loadAppState,
  scheduleSettingsSave,
  seedAndPersist,
  setFallbackListener,
  setPrivateFallbackActive,
} from '../storage/supabaseStore';
import {
  createPrivateSpace,
  deletePrivateSpace,
  getPrivateSpaceVersion,
  loadPrivateSpaces,
  savePrivateSpace,
  upsertPrivateSpaces,
} from '../storage/privateSpaceStore';
import { deleteSharedSpace, getSharedSpaceVersion, loadSharedSpaces, saveSharedSpace } from '../storage/sharedSpaceStore';
import { writeLocalCurrentSpaceId } from '../storage/localCurrentSpace';
import { writeLocalLastScreen } from '../storage/localLastScreen';
import { buildUiInitialState } from '../storage/normalize';
import { defaultSettings } from './seed';
import type { AppAction } from './appReducer';
import { appReducer } from './appReducer';
import { useAuth } from '../auth/AuthContext';
import { tasksReducer } from './reducers/tasks';
import { notifyTaskAssigned, notifyTaskCompleted } from '../storage/notifySharedTaskEvent';
import { scheduleCompletedNotify, cancelCompletedNotify } from './completeNotifyDebounce';
import {
  computeTaskCreateNotifyEffect,
  computeTaskUpdateNotifyEffect,
  computeTaskToggleDoneNotifyEffect,
} from './sharedTaskNotifyEffects';

interface AppStateContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  isLoading: boolean;
  /**
   * Dispatch action + lưu ngay lập tức lên Supabase, ĐỢI kết quả thật (không debounce).
   * Dùng cho nút "Lưu" trong modal Thêm/Sửa (Task/Note/Reminder/Habit) — nơi user cần biết
   * chắc chắn dữ liệu đã lên server trước khi đóng modal (tránh mất task khi đóng app ngay
   * sau khi thêm, lúc debounce 600ms nền còn đang chờ).
   *
   * KHÔNG dùng cho các thao tác nhỏ (tick checkbox, kéo-thả, đổi theme...) — những chỗ đó
   * vẫn dùng `dispatch` thường + debounce nền như cũ để giữ cảm giác mượt.
   */
  saveNow: (action: AppAction) => Promise<{ ok: boolean; error?: string }>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

function emptyState(): AppState {
  const settings = defaultSettings();
  return {
    spaces: [],
    currentSpaceId: '',
    settings,
    ui: buildUiInitialState(settings.lastScreen),
    storageFallbackActive: false,
  };
}

/** Các field thực sự cần lưu lên `kn_private_spaces` cho 1 Space cá nhân — dùng chung cho cả
 * snapshot baseline (so sánh phát hiện thay đổi) lẫn payload gửi lên `createPrivateSpace`/
 * `savePrivateSpace`. Không gồm `id`/`isShared`/`_privateVersion` (metadata, không phải dữ liệu). */
function privateSnapshot(space: Space) {
  return {
    name: space.name,
    order: space.order,
    enabledBlocks: space.enabledBlocks,
    tasks: space.tasks,
    reminders: space.reminders,
    habits: space.habits,
    notes: space.notes,
    logs: space.logs,
  };
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, emptyState());
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const hydratedRef = useRef(false);
  const { session } = useAuth();

  // Bootstrap: load từ storage hoặc seed nếu rỗng.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loadedState = await loadAppState(); // { currentSpaceId, settings } | null (settings/current_space_id, kn_space_state)

        let currentSpaceId: string;
        let settings: AppState['settings'];
        let privateSpaces: Space[];
        let storageFallbackActive = false;

        if (loadedState) {
          currentSpaceId = loadedState.currentSpaceId;
          settings = loadedState.settings;
          try {
            privateSpaces = await loadPrivateSpaces();
          } catch (err) {
            // Không chặn cả app nếu riêng bảng Space cá nhân lỗi (vd mất mạng giữa chừng) — coi
            // như rỗng, để user vẫn vào được app (dù thiếu Space, còn hơn crash trắng màn hình).
            console.warn('[KN-Space] Không tải được Space cá nhân:', err);
            privateSpaces = [];
          }
        } else {
          // User mới hoàn toàn — chưa có hàng `kn_space_state` nào -> seed cả settings lẫn Space
          // cá nhân demo (INSERT cả 2 đích cùng lúc, xem `seedAndPersist()`).
          const seeded = await seedAndPersist();
          currentSpaceId = seeded.currentSpaceId;
          settings = seeded.settings;
          privateSpaces = seeded.spaces;
          storageFallbackActive = seeded.storageFallbackActive;
        }

        if (cancelled) return;

        // Load shared spaces — không block nếu lỗi (user chưa có shared space là chuyện bình thường).
        let sharedSpaces: AppState['spaces'] = [];
        try {
          sharedSpaces = await loadSharedSpaces();
        } catch (err) {
          console.warn('[KN-Space] Không tải được shared spaces:', err);
        }

        const allSpaces = [...privateSpaces, ...sharedSpaces];
        // Validate sau khi có đủ cả private + shared — localId có thể là shared space
        const validCurrentSpaceId = allSpaces.some((s) => s.id === currentSpaceId)
          ? currentSpaceId
          : allSpaces[0]?.id ?? currentSpaceId;
        writeLocalCurrentSpaceId(validCurrentSpaceId);

        dispatch({
          type: 'HYDRATE',
          payload: {
            spaces: allSpaces,
            currentSpaceId: validCurrentSpaceId,
            settings,
            storageFallbackActive,
          },
        });
        hydratedRef.current = true;
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('[KN-Space] Lỗi tải dữ liệu ban đầu:', err);
        setLoadError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Bật/tắt banner lỗi lưu theo kết quả flushSave (kênh `settings`, kn_space_state).
  useEffect(() => {
    setFallbackListener((active) => {
      dispatch({ type: 'SET_STORAGE_FALLBACK_ACTIVE', payload: { active } });
    });
  }, []);

  // Debounce save khi settings đổi — kênh riêng (kn_space_state), KHÔNG kéo theo ghi lại Space cá
  // nhân (giờ ở bảng `kn_private_spaces` riêng, xem effect debounce-theo-Space bên dưới).
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    scheduleSettingsSave({ settings: state.settings });
  }, [state.settings, isLoading]);

  // ==========================================================================================
  // Debounce save Space CÁ NHÂN — theo TỪNG HÀNG (kn_private_spaces), mirror CHÍNH XÁC cơ chế đã
  // dùng cho Shared Space bên dưới (Map theo spaceId: version/timer/pending/baseline riêng từng
  // Space — sửa Space A không kích hoạt lưu Space B). Xem docs/features/storage-architecture-fix.md
  // mục 4 Bước 3.
  // ==========================================================================================
  const privateVersionsRef = useRef<Map<string, number>>(new Map());
  const privateSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const prevPrivateRef = useRef<Map<string, string>>(new Map()); // spaceId → JSON snapshot (baseline)
  const pendingPrivateSavesRef = useRef<Map<string, ReturnType<typeof privateSnapshot>>>(new Map());
  // spaceId đang có 1 lượt createPrivateSpace() (INSERT) bay dở — chặn effect gọi tạo trùng lặp
  // (vd re-render giữa lúc INSERT chưa kịp trả về) hoặc trong lúc IMPORT_DATA đang xử lý bất đồng bộ.
  const creatingPrivateRef = useRef<Set<string>>(new Set());

  /**
   * Thử lưu 1 Space cá nhân, tự resync + retry nếu bị conflict — mirror CHÍNH XÁC
   * `attemptSaveShared` bên dưới (cùng lý do: conflict bị drop im lặng trước đây từng gây mất
   * đồng bộ CRUD, xem comment ở `attemptSaveShared`).
   */
  async function attemptSavePrivate(sid: string, retriesLeft = 3): Promise<boolean> {
    const data = pendingPrivateSavesRef.current.get(sid);
    if (!data) return true; // không có gì pending — coi như đã lưu xong
    const version = privateVersionsRef.current.get(sid) ?? 1;
    try {
      const result = await savePrivateSpace(sid, data, version);
      if (result.ok) {
        if (result.newVersion !== undefined) privateVersionsRef.current.set(sid, result.newVersion);
        if (pendingPrivateSavesRef.current.get(sid) === data) {
          pendingPrivateSavesRef.current.delete(sid);
        }
        return true;
      }
      if (result.conflict && retriesLeft > 0) {
        const freshVersion = await getPrivateSpaceVersion(sid);
        if (freshVersion !== null) privateVersionsRef.current.set(sid, freshVersion);
        return attemptSavePrivate(sid, retriesLeft - 1);
      }
      console.warn('[KN-Space] savePrivateSpace conflict, hết lượt thử lại — thay đổi CHƯA được lưu:', sid);
      return false;
    } catch (err) {
      console.warn('[KN-Space] savePrivateSpace thất bại:', err);
      return false;
    }
  }

  // Debounce save Space cá nhân khi nội dung thay đổi + tự INSERT Space vừa tạo cục bộ chưa từng
  // lưu (`_privateVersion === undefined` — tín hiệu duy nhất phân biệt "Space mới" với "Space đã
  // có trên DB", xem comment field trong types.ts).
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    const privateSpaces = state.spaces.filter((s) => !s.isShared);
    privateSpaces.forEach((space) => {
      const sid = space.id;

      if (space._privateVersion === undefined) {
        if (creatingPrivateRef.current.has(sid)) return; // đã có 1 lượt INSERT đang bay, đợi nó xong
        creatingPrivateRef.current.add(sid);
        // Chụp lại đúng dữ liệu tại THỜI ĐIỂM bắn INSERT — dùng làm baseline sau khi tạo xong, để
        // nếu Space bị sửa tiếp trong lúc INSERT còn đang bay (vd đổi tên ngay sau khi tạo), lượt
        // diff kế tiếp (sau khi version về) tự phát hiện lệch baseline-vs-hiện-tại và bắn UPDATE bù
        // — không bị "nuốt" mất thay đổi đó (xem docs/features/storage-architecture-fix-progress.md,
        // mục Bước 3, quyết định xử lý race create-vs-edit).
        const snapshotAtCreate = JSON.stringify(privateSnapshot(space));
        void (async () => {
          const result = await createPrivateSpace(space);
          creatingPrivateRef.current.delete(sid);
          if (!result.ok) {
            console.warn('[KN-Space] Tạo Space cá nhân trên Supabase thất bại:', result.error);
            setPrivateFallbackActive(true);
            return; // lần render sau (nếu spaces vẫn đổi) tự retry vì _privateVersion vẫn undefined
          }
          setPrivateFallbackActive(false);
          privateVersionsRef.current.set(sid, result.version ?? 1);
          prevPrivateRef.current.set(sid, snapshotAtCreate);
          dispatch({ type: 'SPACE_SET_PRIVATE_VERSION', payload: { id: sid, version: result.version ?? 1 } });
        })();
        return;
      }

      // Space đã có hàng trên DB — diff theo baseline, debounce update giống Shared Space.
      if (!privateVersionsRef.current.has(sid)) {
        privateVersionsRef.current.set(sid, space._privateVersion);
      }
      const snapshot = JSON.stringify(privateSnapshot(space));
      // Lần đầu thấy space này (vừa hydrate/load) → chỉ ghi nhận baseline, KHÔNG save (tránh 1 lượt
      // save thừa ngay khi mở app do Map rỗng làm snapshot cũ luôn "khác" snapshot hiện tại).
      if (!prevPrivateRef.current.has(sid)) {
        prevPrivateRef.current.set(sid, snapshot);
        return;
      }
      if (prevPrivateRef.current.get(sid) === snapshot) return;
      prevPrivateRef.current.set(sid, snapshot);
      pendingPrivateSavesRef.current.set(sid, privateSnapshot(space));
      const existing = privateSaveTimersRef.current.get(sid);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        privateSaveTimersRef.current.delete(sid);
        void attemptSavePrivate(sid);
      }, 600);
      privateSaveTimersRef.current.set(sid, timer);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.spaces]);

  // Theo dõi version của từng shared space — cập nhật sau mỗi lần save thành công.
  const sharedVersionsRef = useRef<Map<string, number>>(new Map());
  const sharedSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const prevSharedRef = useRef<Map<string, string>>(new Map()); // spaceId → JSON snapshot
  // Track data pending flush — cập nhật NGAY khi có thay đổi, trước debounce timer
  // Dùng để flush ngay khi tab ẩn (F5/đóng tab) tránh mất data trong cửa sổ debounce 800ms
  const pendingSharedSavesRef = useRef<Map<string, {
    tasks: Space['tasks']; notes: Space['notes']; reminders: Space['reminders']; logs: Space['logs']; name: string;
    enabledBlocks: Space['enabledBlocks'];
  }>>(new Map());

  /**
   * Thử lưu 1 shared space, tự resync + retry nếu bị conflict (version đã đổi trên DB
   * do client khác — hoặc chính tab này — vừa ghi trước đó).
   *
   * Trước đây conflict bị drop im lặng (chỉ console.warn, không retry) khiến thay đổi
   * (vd: xoá task) tưởng đã lưu ở UI nhưng thực ra KHÔNG BAO GIỜ tới được DB — client
   * khác F5 vẫn thấy data cũ vì DB chưa từng đổi. Đây là nguyên nhân chính gây mất
   * đồng bộ CRUD giữa các member của shared space.
   */
  async function attemptSaveShared(sid: string, retriesLeft = 3): Promise<boolean> {
    const data = pendingSharedSavesRef.current.get(sid);
    if (!data) return true; // không có gì pending — coi như đã lưu xong
    const version = sharedVersionsRef.current.get(sid) ?? 1;
    try {
      const result = await saveSharedSpace(sid, data, version);
      if (result.ok) {
        if (result.newVersion !== undefined) sharedVersionsRef.current.set(sid, result.newVersion);
        // Chỉ xoá pending nếu không có thay đổi mới hơn ghi đè trong lúc đang save
        if (pendingSharedSavesRef.current.get(sid) === data) {
          pendingSharedSavesRef.current.delete(sid);
        }
        return true;
      }
      if (result.conflict && retriesLeft > 0) {
        const freshVersion = await getSharedSpaceVersion(sid);
        if (freshVersion !== null) sharedVersionsRef.current.set(sid, freshVersion);
        return attemptSaveShared(sid, retriesLeft - 1);
      }
      console.warn('[KN-Space] saveSharedSpace conflict, hết lượt thử lại — thay đổi CHƯA được lưu:', sid);
      return false;
    } catch (err) {
      console.warn('[KN-Space] saveSharedSpace thất bại:', err);
      return false;
    }
  }

  // Debounce save shared spaces khi nội dung thay đổi.
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    const sharedSpaces = state.spaces.filter((s) => s.isShared && s.sharedSpaceId);
    sharedSpaces.forEach((space) => {
      const sid = space.sharedSpaceId!;
      // Khởi tạo version lần đầu từ _sharedVersion trong Space
      if (!sharedVersionsRef.current.has(sid) && space._sharedVersion !== undefined) {
        sharedVersionsRef.current.set(sid, space._sharedVersion);
      }
      const snapshot = JSON.stringify({ tasks: space.tasks, notes: space.notes, reminders: space.reminders, logs: space.logs, name: space.name, enabledBlocks: space.enabledBlocks });
      // Lần đầu thấy space này (vừa hydrate/load) → chỉ ghi nhận baseline, KHÔNG save.
      // Trước đây thiếu bước này khiến lần render đầu tiên luôn bị coi là "có thay đổi"
      // (Map rỗng nên snapshot cũ luôn undefined !== snapshot hiện tại) → tự bắn 1 save
      // thừa ngay khi mở app, dễ đụng version với client khác đang mở cùng space → conflict.
      if (!prevSharedRef.current.has(sid)) {
        prevSharedRef.current.set(sid, snapshot);
        return;
      }
      // So sánh snapshot để tránh save khi không có thay đổi
      if (prevSharedRef.current.get(sid) === snapshot) return;
      prevSharedRef.current.set(sid, snapshot);
      // Cập nhật pending data ngay — dùng để flush khi visibilitychange
      pendingSharedSavesRef.current.set(sid, { tasks: space.tasks, notes: space.notes, reminders: space.reminders, logs: space.logs, name: space.name, enabledBlocks: space.enabledBlocks });
      // Debounce 800ms
      const existing = sharedSaveTimersRef.current.get(sid);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        sharedSaveTimersRef.current.delete(sid);
        void attemptSaveShared(sid);
      }, 800);
      sharedSaveTimersRef.current.set(sid, timer);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.spaces]);

  // Lưu "Space đang mở" riêng cho máy này (localStorage).
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    writeLocalCurrentSpaceId(state.currentSpaceId);
  }, [state.currentSpaceId, isLoading]);

  // Lưu "màn đang mở" riêng cho máy này (localStorage).
  useEffect(() => {
    if (!hydratedRef.current || isLoading) return;
    writeLocalLastScreen(state.settings.lastScreen);
  }, [state.settings.lastScreen, isLoading]);

  // Flush ngay khi tab ẩn đi — tránh mất thay đổi cuối nếu đóng tab trong cửa sổ debounce.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        void forceFlush(); // kênh `settings` (kn_space_state)
        // Flush Space cá nhân còn pending (F5/đóng tab trong cửa sổ 600ms debounce)
        if (pendingPrivateSavesRef.current.size > 0) {
          const pendingIds = Array.from(pendingPrivateSavesRef.current.keys());
          pendingIds.forEach((sid) => void attemptSavePrivate(sid));
          privateSaveTimersRef.current.forEach((t) => clearTimeout(t));
          privateSaveTimersRef.current.clear();
        }
        // Flush shared spaces còn pending (F5/đóng tab trong cửa sổ 800ms debounce)
        if (pendingSharedSavesRef.current.size > 0) {
          const pendingIds = Array.from(pendingSharedSavesRef.current.keys());
          pendingIds.forEach((sid) => void attemptSaveShared(sid));
          // Clear timers — đã flush rồi, không cần debounce nữa
          sharedSaveTimersRef.current.forEach((t) => clearTimeout(t));
          sharedSaveTimersRef.current.clear();
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  if (loadError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
        Không tải được dữ liệu từ Supabase: {loadError}
        <br />
        Kiểm tra: đã chạy schema.sql tạo bảng "kn_space_state" chưa? URL/anon key trong .env.local đúng chưa?
      </div>
    );
  }

  // Wrap dispatch để intercept SPACE_DELETE (Space cá nhân lẫn shared) và IMPORT_DATA: reducer xoá/
  // thay dữ liệu khỏi local state ngay, đồng thời gọi Supabase xoá/ghi lại trên DB.
  /**
   * Ngoài việc dispatch bình thường, chặn thêm 1 số action để bắn notify sự kiện Shared Space
   * (assign/hoàn thành task — xem docs/features/shared-space-task-assign-notify.md). Tính effect
   * TRƯỚC khi gọi dispatch() thật (dựa trên state hiện tại) vì cần biết giá trị "trước đó" để
   * so sánh (assigneeIds cũ, done cũ) — sau dispatch() thì state cũ đã mất.
   */
  const smartDispatch = React.useCallback((action: AppAction) => {
    if (action.type === 'SPACE_DELETE') {
      const space = state.spaces.find((s) => s.id === action.payload.id);
      if (space?.isShared && space.sharedSpaceId) {
        void deleteSharedSpace(space.sharedSpaceId).catch((err) =>
          console.warn('[KN-Space] Xoá shared space trên DB thất bại:', err),
        );
      } else if (space && !space.isShared) {
        // Huỷ debounce/creating pending của Space này trước — tránh 1 lượt save/tạo trễ bắn ra
        // SAU khi đã xoá (vô hại về dữ liệu vì không còn ai trỏ tới id này, nhưng dễ log warning
        // thừa nếu chạy xong mới phát hiện version/id không còn khớp).
        const existingTimer = privateSaveTimersRef.current.get(space.id);
        if (existingTimer) {
          clearTimeout(existingTimer);
          privateSaveTimersRef.current.delete(space.id);
        }
        pendingPrivateSavesRef.current.delete(space.id);
        if (space._privateVersion !== undefined) {
          // Chỉ có hàng thật trên DB để xoá khi đã từng lưu thành công (_privateVersion xác định).
          // Nếu Space vừa tạo, còn đang trong lúc INSERT bay dở (creatingPrivateRef đang giữ id
          // này) — không có hàng nào để DELETE ở đây; INSERT vẫn hoàn tất sau đó (tạo ra 1 hàng
          // "mồ côi" không còn Space nào trong state trỏ tới). Rủi ro rất nhỏ (cửa sổ vài trăm ms,
          // tình huống hiếm: tạo Space rồi xoá ngay lập tức) — chấp nhận theo tinh thần dự án nhỏ,
          // ghi rõ ở đây để biết nếu cần xử lý kỹ hơn sau (vd dọn định kỳ hàng mồ côi).
          void deletePrivateSpace(space.id).catch((err) =>
            console.warn('[KN-Space] Xoá Space cá nhân trên DB thất bại:', err),
          );
        }
      }
    }

    if (action.type === 'IMPORT_DATA') {
      // Import THAY THẾ HOÀN TOÀN Space cá nhân hiện có (không merge — đúng ngữ nghĩa IMPORT_DATA
      // sẵn có ở appReducer). Tính state kế tiếp bằng appReducer thuần để biết chính xác Space cá
      // nhân nào bị xoá/còn lại/mới thêm, TRƯỚC khi dispatch() thật (giống cách saveNow() làm bên
      // dưới) — dispatch() chỉ enqueue update, chưa có state mới ngay trong lượt gọi này.
      const nextState = appReducer(state, action);
      if (nextState !== state) {
        const oldPrivateIds = state.spaces.filter((s) => !s.isShared).map((s) => s.id);
        const newPrivateSpaces = nextState.spaces.filter((s) => !s.isShared);
        const newIdSet = new Set(newPrivateSpaces.map((s) => s.id));
        const idsToDelete = oldPrivateIds.filter((id) => !newIdSet.has(id));

        // Dọn sạch mọi debounce/baseline cũ liên quan Space cá nhân — import thay thế hoàn toàn.
        privateSaveTimersRef.current.forEach((t) => clearTimeout(t));
        privateSaveTimersRef.current.clear();
        pendingPrivateSavesRef.current.clear();
        prevPrivateRef.current.clear();
        privateVersionsRef.current.clear();
        // Chặn effect debounce tự ý tạo/update các Space này trong lúc import đang xử lý bất đồng
        // bộ bên dưới — gỡ chặn ngay khi có kết quả.
        newPrivateSpaces.forEach((s) => creatingPrivateRef.current.add(s.id));

        void (async () => {
          // File export giữ NGUYÊN id gốc của Space -> re-import dữ liệu đã từng export trước đó có
          // thể trùng id với hàng đang có sẵn. Xoá trước các id KHÔNG còn trong file import, sau đó
          // upsert toàn bộ Space mới (upsert tự xử lý đúng cả 2 nhánh: id mới -> insert, id trùng ->
          // update tại chỗ) — xem giải thích đầy đủ ở `upsertPrivateSpaces()`.
          await Promise.all(
            idsToDelete.map((id) =>
              deletePrivateSpace(id).catch((err) => console.warn('[KN-Space] Xoá Space cũ khi import thất bại:', err)),
            ),
          );
          const result = await upsertPrivateSpaces(newPrivateSpaces);
          newPrivateSpaces.forEach((s) => creatingPrivateRef.current.delete(s.id));
          if (!result.ok || !result.spaces) {
            console.warn('[KN-Space] Import Space cá nhân lên Supabase thất bại:', result.error);
            setPrivateFallbackActive(true);
            return;
          }
          setPrivateFallbackActive(false);
          result.spaces.forEach((s) => {
            const version = s._privateVersion ?? 1;
            privateVersionsRef.current.set(s.id, version);
            prevPrivateRef.current.set(s.id, JSON.stringify(privateSnapshot(s)));
            dispatch({ type: 'SPACE_SET_PRIVATE_VERSION', payload: { id: s.id, version } });
          });
        })();
      }
    }

    let actionToDispatch = action;
    const currentUserId = session?.user?.id;
    const currentSpace = state.spaces.find((s) => s.id === state.currentSpaceId);

    if (currentSpace?.isShared && currentSpace.sharedSpaceId && currentUserId) {
      const sharedSpaceId = currentSpace.sharedSpaceId;

      if (action.type === 'TASK_CREATE') {
        // tasksReducer tự sinh id bằng crypto.randomUUID() bên trong — gọi 2 lần cho cùng 1 lượt
        // tạo (1 lần "dự đoán" ở đây để lấy assigneeIds/title thật, 1 lần thật qua dispatch() cuối
        // hàm) sẽ ra 2 id NGẪU NHIÊN KHÁC NHAU nếu không cố định trước. Sinh sẵn id ở đây, gắn vào
        // action, dùng chung cho cả 2 lượt gọi để id gửi trong notify khớp đúng id task thật.
        const actionWithId: typeof action = { ...action, payload: { ...action.payload, id: crypto.randomUUID() } };
        actionToDispatch = actionWithId;
        const nextTasks = tasksReducer(currentSpace, actionWithId).tasks;
        const prevIds = new Set(currentSpace.tasks.map((t) => t.id));
        const created = nextTasks.find((t) => !prevIds.has(t.id));
        if (created) {
          const effect = computeTaskCreateNotifyEffect(created, currentUserId);
          if (effect?.kind === 'assigned') notifyTaskAssigned(sharedSpaceId, currentSpace.name, effect.taskId, effect.taskTitle, effect.recipientUserIds);
        }
      }

      if (action.type === 'TASK_UPDATE') {
        const effect = computeTaskUpdateNotifyEffect(currentSpace, action, currentUserId);
        if (effect?.kind === 'assigned') notifyTaskAssigned(sharedSpaceId, currentSpace.name, effect.taskId, effect.taskTitle, effect.recipientUserIds);
      }

      if (action.type === 'TASK_TOGGLE_DONE') {
        const effect = computeTaskToggleDoneNotifyEffect(currentSpace, action);
        if (effect?.kind === 'completed-schedule') {
          const { taskId, taskTitle } = effect;
          scheduleCompletedNotify(taskId, () => notifyTaskCompleted(sharedSpaceId, currentSpace.name, taskId, taskTitle, currentUserId));
        } else if (effect?.kind === 'completed-cancel') {
          cancelCompletedNotify(effect.taskId);
        }
      }

      if (action.type === 'TASK_DELETE') {
        // Task bị xoá trước khi debounce 15s kịp chạy — huỷ lịch, tránh notify về task không còn tồn tại.
        cancelCompletedNotify(action.payload.id);
      }
    }

    dispatch(actionToDispatch);
  }, [state.spaces, state.currentSpaceId, session?.user?.id]);

  /**
   * Dispatch + lưu ngay lập tức, đợi kết quả thật — xem giải thích ở khai báo type phía trên.
   *
   * Tính `nextState` bằng chính `appReducer` (pure function) thay vì đọc `state.spaces` sau
   * `dispatch()`, vì `dispatch()` chỉ enqueue update — state React chưa cập nhật đồng bộ ngay
   * trong cùng lượt gọi này. Nhờ vậy không phải chờ effect debounce (vốn chỉ chạy sau khi
   * React commit re-render) mới biết chính xác dữ liệu cần lưu là gì.
   */
  const saveNow = React.useCallback(async (action: AppAction): Promise<{ ok: boolean; error?: string }> => {
    const nextState = appReducer(state, action);
    dispatch(action);

    const targetSpace = nextState.spaces.find((s) => s.id === nextState.currentSpaceId);

    if (targetSpace?.isShared && targetSpace.sharedSpaceId) {
      const sid = targetSpace.sharedSpaceId;
      const data = {
        tasks: targetSpace.tasks,
        notes: targetSpace.notes,
        reminders: targetSpace.reminders,
        logs: targetSpace.logs,
        name: targetSpace.name,
        enabledBlocks: targetSpace.enabledBlocks,
      };

      // Huỷ debounce timer đang chờ của space này — data mới nhất được gửi thẳng ngay bây giờ,
      // đồng thời cập nhật baseline để effect debounce không tưởng nhầm là "còn thay đổi mới"
      // rồi bắn thêm 1 lần save trùng lặp ngay sau đó.
      const existingTimer = sharedSaveTimersRef.current.get(sid);
      if (existingTimer) {
        clearTimeout(existingTimer);
        sharedSaveTimersRef.current.delete(sid);
      }
      pendingSharedSavesRef.current.set(sid, data);
      prevSharedRef.current.set(sid, JSON.stringify(data));
      if (!sharedVersionsRef.current.has(sid) && targetSpace._sharedVersion !== undefined) {
        sharedVersionsRef.current.set(sid, targetSpace._sharedVersion);
      }

      const ok = await attemptSaveShared(sid);
      return ok
        ? { ok: true }
        : { ok: false, error: 'Không lưu được lên Space chung — kiểm tra kết nối mạng và thử lại.' };
    }

    // Space cá nhân — modal Thêm/Sửa (Task/Note/Reminder/Habit) chỉ sửa dữ liệu của ĐÚNG Space
    // đang mở, không sửa settings/Space khác — chỉ lưu ngay 1 hàng `kn_private_spaces` này.
    if (targetSpace && !targetSpace.isShared) {
      const sid = targetSpace.id;

      if (targetSpace._privateVersion === undefined) {
        // Hiếm khi xảy ra (vd bấm "Lưu" ở modal gần như ngay lập tức sau khi vừa tạo Space, trước
        // khi effect debounce kịp INSERT) — tự INSERT ngay tại đây, KHÔNG debounce, vì saveNow()
        // cần biết kết quả thật ngay để quyết định đóng modal hay báo lỗi cho user thử lại.
        if (creatingPrivateRef.current.has(sid)) {
          // Effect debounce đang tự INSERT song song — tránh bắn thêm 1 lượt INSERT trùng (vi phạm
          // khoá chính `id`). Coi như dữ liệu vừa dispatch() đã nằm trong action đang chờ xử lý qua
          // đường effect đó — trả về lạc quan, UI không cần chặn user.
          return { ok: true };
        }
        creatingPrivateRef.current.add(sid);
        const snapshotAtCreate = JSON.stringify(privateSnapshot(targetSpace));
        const result = await createPrivateSpace(targetSpace);
        creatingPrivateRef.current.delete(sid);
        if (!result.ok) {
          return { ok: false, error: result.error ?? 'Không lưu được dữ liệu — kiểm tra kết nối mạng và thử lại.' };
        }
        privateVersionsRef.current.set(sid, result.version ?? 1);
        prevPrivateRef.current.set(sid, snapshotAtCreate);
        dispatch({ type: 'SPACE_SET_PRIVATE_VERSION', payload: { id: sid, version: result.version ?? 1 } });
        return { ok: true };
      }

      const data = privateSnapshot(targetSpace);
      const existingTimer = privateSaveTimersRef.current.get(sid);
      if (existingTimer) {
        clearTimeout(existingTimer);
        privateSaveTimersRef.current.delete(sid);
      }
      pendingPrivateSavesRef.current.set(sid, data);
      prevPrivateRef.current.set(sid, JSON.stringify(data));
      if (!privateVersionsRef.current.has(sid)) {
        privateVersionsRef.current.set(sid, targetSpace._privateVersion);
      }

      const ok = await attemptSavePrivate(sid);
      return ok
        ? { ok: true }
        : { ok: false, error: 'Không lưu được dữ liệu — kiểm tra kết nối mạng và thử lại.' };
    }

    return { ok: false, error: 'Không tìm thấy Space hiện tại để lưu.' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <AppStateContext.Provider value={{ state, dispatch: smartDispatch, isLoading, saveNow }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}

/**
 * Ném lỗi nếu không tìm thấy Space hiện tại. AN TOÀN dùng ở MỌI component KHÁC ngoài
 * `HomeScreen`/`AppLayout` (2 điểm entry cấp cao nhất) — toàn bộ 6 khối dữ liệu (TasksBlock,
 * NotesBlock, HabitsBlock, RemindersBlock, LogsBlock, NotificationsBlock), các modal Thêm/Sửa
 * (TaskFormModal, NoteFormModal), SettingsModal, MobileChatScreen... đều CHỈ được React mount
 * làm con của `AppLayout`, SAU khi `AppLayout` đã tự kiểm tra `useCurrentSpaceOrNull()` khác
 * `null` (xem AppLayout.tsx) — nên tại các nơi đó, "có Space hiện tại" là 1 invariant kiến trúc
 * luôn đúng, không cần lặp lại `if (!space)` ở từng file. Nếu invariant này bị vi phạm (bug ở
 * đâu đó khiến 1 trong các component trên mount ngoài cây `AppLayout`), thà throw rõ ràng ở đây
 * còn hơn âm thầm crash mơ hồ hơn ở nơi dùng `space.tasks`/`space.notes`... phía sau.
 */
export function useCurrentSpace() {
  const { state } = useAppState();
  const space = state.spaces.find((s) => s.id === state.currentSpaceId);
  if (!space) throw new Error('Current space not found');
  return space;
}

/**
 * Biến thể KHÔNG throw — trả `null` nếu `state.spaces` rỗng hoặc không có Space nào khớp
 * `currentSpaceId` (vd: user cũ có hàng `kn_space_state` nhưng chưa migrate dữ liệu sang
 * `kn_private_spaces`, hoặc user lỡ xoá hết Space của mình — xem
 * docs/features/storage-architecture-fix-progress.md mục Bước 3b). CHỈ dùng ở 2 điểm entry cấp
 * cao nhất mount trực tiếp dưới `<Shell>` (`HomeScreen`, `AppLayout`) — nơi PHẢI tự xử lý mềm
 * trường hợp chưa có Space nào thay vì để throw làm crash trắng màn hình cả app. Xem
 * `useCurrentSpace()` (throw) ở trên cho mọi nơi khác.
 */
export function useCurrentSpaceOrNull() {
  const { state } = useAppState();
  return state.spaces.find((s) => s.id === state.currentSpaceId) ?? null;
}
