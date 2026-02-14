import {
  readStoredLocationPickerState,
  writeStoredLocationPickerState,
  type StoredLocationPickerState,
} from "@/lib/location-picker-storage";

const EMPTY_LOCATION_PICKER_STATE: StoredLocationPickerState = {
  locationNameSelection: "",
  customLocationNameInput: "",
  lat: null,
  lon: null,
};

export async function readStoredForecastLocationId() {
  const stored = await readStoredLocationPickerState();
  if (!stored) return null;

  const locationId = Number(stored.locationNameSelection);
  if (!Number.isSafeInteger(locationId) || locationId <= 0) return null;
  return locationId;
}

export async function writeStoredForecastLocationId(locationId: number) {
  if (!Number.isSafeInteger(locationId) || locationId <= 0) return false;

  const existing = (await readStoredLocationPickerState()) ?? EMPTY_LOCATION_PICKER_STATE;
  await writeStoredLocationPickerState({
    ...existing,
    locationNameSelection: String(locationId),
  });
  return true;
}
