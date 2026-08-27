"use client";

import { useState, type ReactNode } from "react";
import { useCircadia } from "@/context/circadia-store";
import { BubbleGroup, YesNo } from "@/components/bubbles";
import { StudyPanel } from "@/components/study-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureNotificationPermission } from "@/lib/notifications";
import { displayName, formatLoginForDisplay } from "@/lib/login";
import { bmiKgM, cmToFeetInches, feetInchesToCm, formatClock, kgToLb, lbToKg } from "@/lib/time";
import type { ActivityLevel, Profile } from "@/lib/types";
import { SLEEP_TARGET_OPTIONS, WAKE_TARGET_OPTIONS } from "@/lib/windows";

export function YouView() {
  const { state, saveProfile, resetAll, loadSampleWeek, session, logOut, attachLogin, canLogOut } = useCircadia();
  const profile = state.profile;
  const imperial = cmToFeetInches(profile?.heightCm ?? 170);
  const [feet, setFeet] = useState(String(imperial.feet));
  const [inches, setInches] = useState(String(imperial.inches));
  const [pounds, setPounds] = useState(String(Math.round(kgToLb(profile?.weightKg ?? 70))));
  const [age, setAge] = useState(String(profile?.age ?? 18));
  const [firstName, setFirstName] = useState(profile?.firstName ?? "");
  const [lastName, setLastName] = useState(profile?.lastName ?? "");
  const [loginDraft, setLoginDraft] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [medDraft, setMedDraft] = useState("");
  const [supDraft, setSupDraft] = useState("");

  if (!profile) return null;
  const current = profile;

  function persist(patch: Partial<Profile>) {
    saveProfile({ ...current, ...patch });
  }

  const bmi = bmiKgM(current.weightKg, current.heightCm);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-8 pb-16 xl:px-10">
      <div className="mx-auto max-w-xl">
        <p className="text-[11px] tracking-[0.28em] text-violet-300/80 uppercase">You</p>
        <h1 className="font-heading mt-1 text-3xl text-zinc-50">{profile.name}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {profile.age} · BMI {bmi.toFixed(1)} · {profile.activity} ·{" "}
          {formatClock(profile.targetSleep, profile.units)}–{formatClock(profile.targetWake, profile.units)}
        </p>
        <p className="mt-3 max-w-[46ch] text-xs leading-relaxed text-zinc-500">
          Circadia uses this file when it writes notes. It will not change a medication for you.
          Dreams and chat stay on this computer even if the study pipeline is on.
        </p>

        <Section kicker="File" title="Who this diary belongs to">
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="First name"
              value={firstName}
              onChange={setFirstName}
              onBlur={() =>
                persist({
                  firstName: firstName.trim(),
                  lastName: lastName.trim(),
                  name: displayName(firstName, lastName),
                })
              }
            />
            <Field
              label="Last name"
              value={lastName}
              onChange={setLastName}
              onBlur={() =>
                persist({
                  firstName: firstName.trim(),
                  lastName: lastName.trim(),
                  name: displayName(firstName, lastName),
                })
              }
            />
          </div>
          {!canLogOut ? (
            <div>
              <p className="text-xs text-zinc-400">Save a login</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
                An email or phone lets you sign out and open this file again. Circadia will not
                contact you.
              </p>
              <Input
                value={loginDraft}
                onChange={(e) => setLoginDraft(e.target.value)}
                placeholder="you@school.edu or a phone number"
                className="mt-3 h-11 rounded-2xl border-white/10 bg-white/5"
              />
              {loginError ? <p className="mt-2 text-[13px] text-amber-200/90">{loginError}</p> : null}
              <Button
                type="button"
                className="mt-3 h-11 w-full cursor-pointer rounded-full bg-zinc-50 text-zinc-950"
                onClick={() => {
                  const result = attachLogin(loginDraft);
                  if (!result.ok) setLoginError(result.error);
                  else setLoginError(null);
                }}
              >
                Save login
              </Button>
            </div>
          ) : (
            <div>
              <p className="text-xs text-zinc-400">How you log in</p>
              <p className="mt-1 font-heading text-lg text-zinc-50">{formatLoginForDisplay(session)}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
                This stays on this computer. Circadia will not email or text you. There is no
                password — anyone at this laptop who knows this identifier can open the file.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 h-11 w-full cursor-pointer rounded-full border-white/15"
                onClick={logOut}
              >
                Log out
              </Button>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-600">
                This computer still has your file. The same email or phone opens it.
              </p>
            </div>
          )}
        </Section>

        <Section kicker="Body" title="What the notes are allowed to know">
          <div className="grid grid-cols-3 gap-2">
            <Field
              label="Age"
              value={age}
              onChange={setAge}
              onBlur={() => persist({ age: Number(age) || profile.age })}
            />
            <Field
              label="ft"
              value={feet}
              onChange={setFeet}
              onBlur={() => persist({ heightCm: feetInchesToCm(Number(feet) || 0, Number(inches) || 0) })}
            />
            <Field
              label="in"
              value={inches}
              onChange={setInches}
              onBlur={() => persist({ heightCm: feetInchesToCm(Number(feet) || 0, Number(inches) || 0) })}
            />
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
        </Section>

        <Section kicker="Clock" title="The window we are protecting">
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
        </Section>

        <div className="mt-8">
          <StudyPanel />
        </div>

        <section className="mt-10 space-y-2">
          <p className="text-[11px] tracking-[0.22em] text-zinc-600 uppercase">This device</p>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full cursor-pointer rounded-full border-white/15"
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
            className="h-11 w-full cursor-pointer rounded-full"
            onClick={() => {
              if (window.confirm("Erase Circadia on this device?")) resetAll();
            }}
          >
            Erase this device
          </Button>
          <p className="text-[11px] leading-relaxed text-zinc-600">
            Educational tool. Not medical care. If you stop breathing at night, fall asleep while
            driving, or cannot stay awake, that is a clinic, not a chat bar.
          </p>
        </section>
      </div>
    </div>
  );
}

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <p className="text-[11px] tracking-[0.22em] text-zinc-500 uppercase">{kicker}</p>
      <h2 className="font-heading mt-1 text-xl text-zinc-50">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  type?: string;
}) {
  return (
    <label className="text-xs text-zinc-400">
      {label}
      <Input
        type={type}
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
        <Button variant="outline" className="h-11 cursor-pointer rounded-full border-white/15" onClick={onAdd}>
          Add
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            className="cursor-pointer rounded-full border border-violet-300/30 bg-violet-400/10 px-3 py-1 text-xs"
            onClick={() => onRemove(item)}
          >
            {item} ×
          </button>
        ))}
      </div>
    </div>
  );
}
