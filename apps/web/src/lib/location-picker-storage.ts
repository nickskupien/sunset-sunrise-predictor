import { getIndexedDbValue, setIndexedDbValue, type IndexedDbConfig } from "@/lib/indexeddb";

export type StoredLocationPickerState = {
  locationNameSelection: string;
  customLocationNameInput: string;
  lat: number | null;
  lon: number | null;
};

const LOCATION_PICKER_STORAGE_CONFIG: IndexedDbConfig = {
  dbName: "sunset-ui",
  storeName: "location-picker",
  version: 1,
};

const LOCATION_PICKER_STATE_KEY = "selected-location";

function isStoredLocationPickerState(value: unknown): value is StoredLocationPickerState {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<StoredLocationPickerState>;
  const hasValidSelection = typeof candidate.locationNameSelection === "string";
  const hasValidCustomName = typeof candidate.customLocationNameInput === "string";
  const hasValidLat = typeof candidate.lat === "number" || candidate.lat === null;
  const hasValidLon = typeof candidate.lon === "number" || candidate.lon === null;

  return hasValidSelection && hasValidCustomName && hasValidLat && hasValidLon;
}

export function readStoredLocationPickerState() {
  return getIndexedDbValue<StoredLocationPickerState>(
    LOCATION_PICKER_STORAGE_CONFIG,
    LOCATION_PICKER_STATE_KEY,
    isStoredLocationPickerState,
  );
}

export async function writeStoredLocationPickerState(state: StoredLocationPickerState) {
  await setIndexedDbValue(LOCATION_PICKER_STORAGE_CONFIG, LOCATION_PICKER_STATE_KEY, state);
}
