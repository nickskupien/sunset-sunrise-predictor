"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ForecastLocationPickerProps = {
  options: Array<{ id: number; label: string }>;
  selectedId: number;
};

export function ForecastLocationPicker({ options, selectedId }: ForecastLocationPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(nextIdRaw: string) {
    const nextId = Number(nextIdRaw);
    if (!Number.isSafeInteger(nextId) || nextId <= 0) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("locationId", String(nextId));
    router.replace(`${pathname}?${params.toString()}`);
    router.refresh();
  }

  return (
    <div className="max-w-sm space-y-2">
      <label htmlFor="locationId" className="text-sm font-medium">
        Location
      </label>
      <Select
        value={String(selectedId)}
        onValueChange={(value) => {
          handleChange(value);
        }}
      >
        <SelectTrigger id="locationId" className="w-full">
          <SelectValue placeholder="Select a location" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Locations</SelectLabel>
            {options.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
