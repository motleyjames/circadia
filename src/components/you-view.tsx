"use client";

import { useState } from "react";
import { useCircadia } from "@/context/circadia-store";
import { BubbleGroup, YesNo } from "@/components/bubbles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureNotificationPermission } from "@/lib/notifications";
import { bmiKgM, cmToFeetInches, feetInchesToCm, formatClock, kgToLb, lbToKg } from "@/lib/time";
import type { ActivityLevel, Profile } from "@/lib/types";
import { SLEEP_TARGET_OPTIONS, WAKE_TARGET_OPTIONS } from "@/lib/windows";

export function YouView() {
  const { state, saveProfile, resetAll, loadSampleWeek } = useCircadia();
  const profile = state.profile!;
  const imperial = cmToFeetInches(profile.heightCm);
  const [feet, setFeet] = useState(String(imperial.feet));
  const [inches, setInches] = useState(String(imperial.inches));
  const [pounds, setPounds] = useState(String(Math.round(kgToLb(profile.weightKg))));
  const [age, setAge] = useState(String(profile.age));
  const [name, setName] = useState(profile.name);
  const [medDraft, setMedDraft] = useState("");
  const [supDraft, setSupDraft] = useState("");

  function persist(patch: Partial<Profile>) {
    saveProfile({ ...profile, ...patch });
  }

  const bmi = bmiKgM(profile.weightKg, profile.heightCm);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-8 pb-8">
      <p className="text-[11px] tracking-[0.28em] text-violet-300/80 uppercase">You</p>
      <h1 className="font-heading mt-1 text-3xl text-zinc-50">{profile.name}</h1>
      <p className="mt-1 text-sm text-zinc-400">
        {profile.age} · BMI {bmi.toFixed(1)} · {profile.activity} · target{" "}
        {formatClock(profile.targetSleep, profile.units)}–{formatClock(profile.targetWake, profile.units)}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        Everything lives in this browser. Circadia uses these fields when it writes notes. It will not
        change a medication for you.
      </p>

      <section className="mt-6 space-y-4">
        <Field
          label="Name"
          value={name}
          onChange={setName}
          onBlur={() => persist({ name: name.trim() || profile.name })}
        />
        <div className="grid grid-cols-3 gap-2">
          <Field label="Age" value={age} onChange={setAge} onBlur={() => persist({ age: Number(age) || profile.age })} />
          <Field label="ft" value={feet} onChange={setFeet} onBlur={() => persist({ heightCm: feetInchesToCm(Number(feet) || 0, Number(inches) || 0) })} />
          <Field label="in" value={inches} onChange={setInches} onBlur={() => persist({ heightCm: feetInchesToCm(Number(feet) || 0, Number(inches) || 0) })} />
        </div>
        <Field
          label="Weight, lb"
          value={pounds}
          onChange={setPounds}
          onBlur={() => persist({ weightKg: lbToKg(Number(pounds) || 0) })}
        />

        <div>
          <p className="mb-2 text-xs text-zinc-400">Activity</p>
          <BubbleGroup
            value={profile.activity}
            onChange={(activity: ActivityLevel) => persist({ activity })}
            options={[
              { value: "sedentary", label: "Sedentary" },
              { value: "light", label: "Light" },
              { value: "moderate", label: "Moderate" },
              { value: "high", label: "High" },
            ]}
          />
        </div>

        <Chips
          label="Medications"
          items={profile.medications}
          draft={medDraft}
          setDraft={setMedDraft}
          onAdd={() => {
            const next = medDraft.trim();
            if (!next) return;
            persist({ medications: [...profile.medications, next] });
            setMedDraft("");
          }}
          onRemove={(item) => persist({ medications: profile.medications.filter((x) => x !== item) })}
        />
        <Chips
          label="Supplements"
          items={profile.supplements}
          draft={supDraft}
          setDraft={setSupDraft}
          onAdd={() => {
            const next = supDraft.trim();
            if (!next) return;
            persist({ supplements: [...profile.supplements, next] });
            setSupDraft("");
          }}
          onRemove={(item) => persist({ supplements: profile.supplements.filter((x) => x !== item) })}
        />

        <div>
          <p className="mb-2 text-xs text-zinc-400">Asleep-by</p>
          <BubbleGroup
            value={profile.targetSleep}
            onChange={(targetSleep) => persist({ targetSleep })}
            columns={3}
            options={SLEEP_TARGET_OPTIONS.map((t) => ({ value: t, label: formatClock(t, profile.units) }))}
          />
        </div>
        <div>
          <p className="mb-2 text-xs text-zinc-400">Wake</p>
          <BubbleGroup
            value={profile.targetWake}
            onChange={(targetWake) => persist({ targetWake })}
            columns={3}
            options={WAKE_TARGET_OPTIONS.map((t) => ({ value: t, label: formatClock(t, profile.units) }))}
          />
        </div>

        <div>
          <p className="mb-2 text-xs text-zinc-400">Screen-off notifications</p>
          <YesNo
            value={profile.notificationsEnabled}
            onChange={(on) => {
              void (async () => {
                if (!on) {
                  persist({ notificationsEnabled: false });
                  return;
                }
                persist({ notificationsEnabled: await ensureNotificationPermission() });
              })();
            }}
            yesLabel="On"
            noLabel="Off"
          />
        </div>
      </section>

      <section className="mt-10 space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full rounded-full border-white/15"
          onClick={() => {
            if (state.reports.length > 0 && !window.confirm("Replace your mornings with a labeled sample week?")) {
              return;
            }
            loadSampleWeek();
          }}
        >
          Load sample week
        </Button>
        <Button
          variant="destructive"
          className="w-full rounded-full"
          onClick={() => {
            if (window.confirm("Erase Circadia on this device?")) resetAll();
          }}
        >
          Erase this device
        </Button>
        <p className="text-[11px] leading-relaxed text-zinc-600">
          Educational tool. Not medical care. If you stop breathing at night, fall asleep while driving,
          or cannot stay awake, that is a clinic, not a chat bar.
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className="text-xs text-zinc-400">
      {label}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="mt-1 h-11 rounded-2xl border-white/10 bg-white/5"
      />
    </label>
  );
}

function Chips({
  label,
  items,
  draft,
  setDraft,
  onAdd,
  onRemove,
}: {
  label: string;
  items: string[];
  draft: string;
  setDraft: (v: string) => void;
  onAdd: () => void;
  onRemove: (item: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-zinc-400">{label}</p>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          className="h-11 rounded-2xl border-white/10 bg-white/5"
        />
        <Button variant="outline" className="h-11 rounded-full border-white/15" onClick={onAdd}>
          Add
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            className="rounded-full border border-violet-300/30 bg-violet-400/10 px-3 py-1 text-xs"
            onClick={() => onRemove(item)}
          >
            {item} ×
          </button>
        ))}
      </div>
    </div>
  );
}
