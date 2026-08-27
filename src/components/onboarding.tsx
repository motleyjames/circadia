"use client";

import { useState } from "react";
import { useCircadia } from "@/context/circadia-store";
import { BubbleGroup, YesNo } from "@/components/bubbles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureNotificationPermission } from "@/lib/notifications";
import type { ActivityLevel, Profile, Sex, Struggle } from "@/lib/types";
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg } from "@/lib/time";

const TIMES = [
  "21:00",
  "21:30",
  "22:00",
  "22:30",
  "23:00",
  "23:30",
  "00:00",
  "00:30",
  "01:00",
];

const WAKES = ["05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00"];

export function Onboarding() {
  const { saveProfile } = useCircadia();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [age, setAge] = useState("19");
  const [sex, setSex] = useState<Sex>("unspecified");
  const [feet, setFeet] = useState("5");
  const [inches, setInches] = useState("10");
  const [pounds, setPounds] = useState("165");
  const [activity, setActivity] = useState<ActivityLevel>("light");
  const [falling, setFalling] = useState(true);
  const [staying, setStaying] = useState(true);
  const [targetSleep, setTargetSleep] = useState("23:30");
  const [targetWake, setTargetWake] = useState("07:30");
  const [medDraft, setMedDraft] = useState("");
  const [supDraft, setSupDraft] = useState("");
  const [medications, setMedications] = useState<string[]>([]);
  const [supplements, setSupplements] = useState<string[]>([]);
  const [notify, setNotify] = useState(true);

  const steps = 6;

  function addChip(list: string[], setList: (v: string[]) => void, draft: string, setDraft: (v: string) => void) {
    const next = draft.trim();
    if (!next) return;
    if (!list.some((x) => x.toLowerCase() === next.toLowerCase())) setList([...list, next]);
    setDraft("");
  }

  async function finish() {
    const heightCm = feetInchesToCm(Number(feet) || 0, Number(inches) || 0);
    const weightKg = lbToKg(Number(pounds) || 0);
    const struggles: Struggle[] = [];
    if (falling) struggles.push("falling");
    if (staying) struggles.push("staying");
    if (notify) await ensureNotificationPermission();

    const profile: Profile = {
      name: name.trim() || "you",
      age: Math.min(90, Math.max(13, Number(age) || 18)),
      sex,
      heightCm: heightCm || 170,
      weightKg: weightKg || 70,
      activity,
      medications,
      supplements,
      struggles: struggles.length ? struggles : ["falling"],
      targetSleep,
      targetWake,
      units: "imperial",
      notificationsEnabled: notify,
      onboardingComplete: true,
    };
    saveProfile(profile);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-10 pb-8">
      <p className="text-[11px] tracking-[0.28em] text-violet-300/80 uppercase">Circadia</p>
      <h1 className="font-heading mt-2 text-3xl text-zinc-50">
        {step === 0 && "A clock you can actually train."}
        {step === 1 && "Body, so the notes are yours."}
        {step === 2 && "What is hard right now."}
        {step === 3 && "The window we will defend."}
        {step === 4 && "What you already take."}
        {step === 5 && "The hour before sleep."}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        {step === 0 && "Built for people who cannot fall asleep, cannot stay asleep, or both. Not a wellness feed."}
        {step === 1 && "Age, size, and how much you move change the advice. Stored on this device only."}
        {step === 2 && "Be blunt. The morning interview is short because this part is honest."}
        {step === 3 && "Consistency beats a perfect bedtime. Wake time is the anchor."}
        {step === 4 && "Meds and supplements are context for Circadia — never something it will tell you to stop."}
        {step === 5 && "One hour off screens. Circadia can ping you. It only works if this tab can live on the phone."}
      </p>

      <div className="mt-8 flex flex-1 flex-col gap-5">
        {step === 0 ? (
          <>
            <label className="text-xs text-zinc-400">
              Name
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="James"
                className="mt-1.5 h-11 rounded-2xl border-white/10 bg-white/5 text-base"
              />
            </label>
            <div>
              <p className="mb-2 text-xs text-zinc-400">Age</p>
              <Input
                inputMode="numeric"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="h-11 rounded-2xl border-white/10 bg-white/5"
              />
            </div>
            <div>
              <p className="mb-2 text-xs text-zinc-400">Sex (for context, optional)</p>
              <BubbleGroup
                value={sex}
                onChange={setSex}
                columns={2}
                options={[
                  { value: "female", label: "Female" },
                  { value: "male", label: "Male" },
                  { value: "other", label: "Other" },
                  { value: "unspecified", label: "Skip" },
                ]}
              />
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-400">
                Height, ft
                <Input
                  inputMode="numeric"
                  value={feet}
                  onChange={(e) => setFeet(e.target.value)}
                  className="mt-1.5 h-11 rounded-2xl border-white/10 bg-white/5"
                />
              </label>
              <label className="text-xs text-zinc-400">
                inches
                <Input
                  inputMode="numeric"
                  value={inches}
                  onChange={(e) => setInches(e.target.value)}
                  className="mt-1.5 h-11 rounded-2xl border-white/10 bg-white/5"
                />
              </label>
            </div>
            <label className="text-xs text-zinc-400">
              Weight, lb
              <Input
                inputMode="numeric"
                value={pounds}
                onChange={(e) => setPounds(e.target.value)}
                className="mt-1.5 h-11 rounded-2xl border-white/10 bg-white/5"
              />
            </label>
            <p className="text-[11px] text-zinc-500">
              About {Math.round(feetInchesToCm(Number(feet) || 0, Number(inches) || 0))} cm ·{" "}
              {kgToLb(lbToKg(Number(pounds) || 0)).toFixed(0)} lb stored internally as metric.{" "}
              {cmToFeetInches(feetInchesToCm(Number(feet) || 0, Number(inches) || 0)).feet}&apos;
              {cmToFeetInches(feetInchesToCm(Number(feet) || 0, Number(inches) || 0)).inches}
            </p>
            <div>
              <p className="mb-2 text-xs text-zinc-400">How physically active are you, most weeks?</p>
              <BubbleGroup
                value={activity}
                onChange={setActivity}
                options={[
                  { value: "sedentary", label: "Sedentary", hint: "mostly sitting" },
                  { value: "light", label: "Light", hint: "walks, campus" },
                  { value: "moderate", label: "Moderate", hint: "3–4 sessions" },
                  { value: "high", label: "High", hint: "training block" },
                ]}
              />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div>
              <p className="mb-2 text-xs text-zinc-400">Hard to fall asleep?</p>
              <YesNo value={falling} onChange={setFalling} />
            </div>
            <div>
              <p className="mb-2 text-xs text-zinc-400">Hard to stay asleep?</p>
              <YesNo value={staying} onChange={setStaying} />
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div>
              <p className="mb-2 text-xs text-zinc-400">Target asleep-by</p>
              <BubbleGroup
                value={targetSleep}
                onChange={setTargetSleep}
                columns={3}
                options={TIMES.map((t) => ({ value: t, label: pretty(t) }))}
              />
            </div>
            <div>
              <p className="mb-2 text-xs text-zinc-400">Target wake</p>
              <BubbleGroup
                value={targetWake}
                onChange={setTargetWake}
                columns={3}
                options={WAKES.map((t) => ({ value: t, label: pretty(t) }))}
              />
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <ChipField
              label="Medications"
              draft={medDraft}
              setDraft={setMedDraft}
              items={medications}
              setItems={setMedications}
              placeholder="Adderall, sertraline…"
              onAdd={() => addChip(medications, setMedications, medDraft, setMedDraft)}
            />
            <ChipField
              label="Supplements you already use"
              draft={supDraft}
              setDraft={setSupDraft}
              items={supplements}
              setItems={setSupplements}
              placeholder="Melatonin, magnesium…"
              onAdd={() => addChip(supplements, setSupplements, supDraft, setSupDraft)}
            />
            <p className="text-[11px] leading-relaxed text-zinc-500">
              If you take none, leave it blank. Circadia will wait about a week of mornings before talking melatonin or magnesium.
            </p>
          </>
        ) : null}

        {step === 5 ? (
          <div>
            <p className="mb-2 text-xs text-zinc-400">Ping me when screens should go down?</p>
            <YesNo value={notify} onChange={setNotify} yesLabel="Yes, ping" noLabel="Not now" />
            <p className="mt-4 text-xs leading-relaxed text-zinc-500">
              Phone browsers only notify while they are allowed to. Add Circadia to your home screen for the closest thing to a real app. Native push is the later wrap (Capacitor) — the product is this.
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <span className="text-[11px] tracking-[0.2em] text-zinc-500 uppercase">
          {step + 1} / {steps}
        </span>
        <div className="flex gap-2">
          {step > 0 ? (
            <Button variant="ghost" className="rounded-full text-zinc-300" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : null}
          {step < steps - 1 ? (
            <Button
              className="rounded-full bg-violet-400 px-5 text-zinc-950 hover:bg-violet-300"
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button className="rounded-full bg-violet-400 px-5 text-zinc-950 hover:bg-violet-300" onClick={() => void finish()}>
              Enter Circadia
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function pretty(clock: string) {
  const [h, m] = clock.split(":").map(Number);
  const suffix = h >= 12 && h < 24 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")}`;
}

function ChipField({
  label,
  draft,
  setDraft,
  items,
  setItems,
  placeholder,
  onAdd,
}: {
  label: string;
  draft: string;
  setDraft: (v: string) => void;
  items: string[];
  setItems: (v: string[]) => void;
  placeholder: string;
  onAdd: () => void;
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
          placeholder={placeholder}
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
            className="rounded-full border border-violet-300/30 bg-violet-400/10 px-3 py-1 text-xs text-violet-100"
            onClick={() => setItems(items.filter((x) => x !== item))}
          >
            {item} ×
          </button>
        ))}
      </div>
    </div>
  );
}
