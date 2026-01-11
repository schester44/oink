import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getSettingsServerFn,
  saveSettingsServerFn,
} from "@/lib/settings";

export const Route = createFileRoute("/_authed/config/preferences")({
  component: PreferencesPage,
  loader: async () => {
    const settings = await getSettingsServerFn();
    return { settings };
  },
});

const timezones = Intl.supportedValuesOf("timeZone").map((tz) => ({
  value: tz,
  label: tz.replace(/_/g, " "),
}));

function PreferencesPage() {
  const route = getRouteApi("/_authed/config/preferences");
  const { settings } = route.useLoaderData();
  const [timezone, setTimezone] = useState(settings.timezone);
  const [open, setOpen] = useState(false);

  const handleTimezoneChange = async (value: string) => {
    setTimezone(value);
    setOpen(false);
    await saveSettingsServerFn({ data: { timezone: value } });
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Preferences</h1>

      <div className="space-y-6">
        <div className="flex items-center justify-between max-w-md">
          <div>
            <label className="text-sm font-medium">Timezone</label>
            <p className="text-sm text-muted-foreground">
              Select your preferred timezone
            </p>
          </div>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-[220px] justify-between"
              >
                {timezone
                  ? timezones.find((tz) => tz.value === timezone)?.label
                  : "Select timezone..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0">
              <Command>
                <CommandInput placeholder="Search timezone..." />
                <CommandList>
                  <CommandEmpty>No timezone found.</CommandEmpty>
                  <CommandGroup>
                    {timezones.map((tz) => (
                      <CommandItem
                        key={tz.value}
                        value={tz.label}
                        onSelect={() => handleTimezoneChange(tz.value)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            timezone === tz.value ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {tz.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
