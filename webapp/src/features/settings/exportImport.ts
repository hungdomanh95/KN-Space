import type { AppState, ExportPayload } from '../../types';

const SCHEMA_VERSION = 1;

export function buildExportPayload(state: AppState): ExportPayload {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    currentSpaceId: state.currentSpaceId,
    spaces: state.spaces,
    settings: state.settings,
  };
}

export function downloadExportFile(payload: ExportPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `kn-space-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Validate tối thiểu khi import: cần có spaces là array không rỗng. Field thiếu sẽ được normalize ở appReducer (IMPORT_DATA). */
export function parseImportFile(raw: string): ExportPayload {
  const data = JSON.parse(raw) as Partial<ExportPayload>;
  if (!Array.isArray(data.spaces) || data.spaces.length === 0) {
    throw new Error('File không đúng định dạng (thiếu spaces).');
  }
  return data as ExportPayload;
}
