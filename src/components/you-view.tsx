"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useCircadia } from "@/context/circadia-store";
import { BubbleGroup } from "@/components/bubbles";
import { StudyPanel } from "@/components/study-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ensureNotificationPermission } from "@/lib/notifications";
import { displayName, prettyContactDisplay } from "@/lib/login";
import { compactScheduledDays } from "@/lib/schedule";
import {
  bmiKgM,
  cmToFeetInches,
  feetInchesToCm,
  formatClock,
  formatDuration,
  kgToLb,
  lbToKg,
  overnightDuration,
  sleepNeedHours,
} from "@/lib/time";
import type { ActivityLevel, Profile, Units } from "@/lib/types";
import { SLEEP_TARGET_OPTIONS, WAKE_TARGET_OPTIONS } from "@/lib/windows";
import { ScheduledDaysPicker } from "@/components/scheduled-days-picker";
import { cn } from "@/lib/utils";

const ACTIVITY: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
];

export function YouView() {
  const { state, saveProfile, resetAll, loadSampleWeek, session, logOut, attachLogin, canLogOut, changePassword } =
    useCircadia();
  const profile = state.profile;
  const imperial = cmToFeetInches(profile?.heightCm ?? 170);
  const [feet, setFeet] = useState(String(imperial.feet));
  const [inches, setInches] = useState(String(imperial.inches));
  const [pounds, setPounds] = useState(String(Math.round(kgToLb(profile?.weightKg ?? 70))));
  const [cm, setCm] = useState(String(Math.round(profile?.heightCm ?? 170)));
  const [kg, setKg] = useState(String(Math.round(profile?.weightKg ?? 70)));
  const [age, setAge] = useState(String(profile?.age ?? 18));
  const [firstName, setFirstName] = useState(profile?.firstName ?? "");
  const [lastName, setLastName] = useState(profile?.lastName ?? "");
  const [loginDraft, setLoginDraft] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginConfirm, setLoginConfirm] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [nextConfirm, setNextConfirm] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [medDraft, setMedDraft] = useState("");
  const [supDraft, setSupDraft] = useState("");

  if (!profile) return null;
  const current = profile;
  const metric = profile.units === "metric";

  function persist(patch: Partial<Profile>) {
    saveProfile({ ...current, ...patch });
  }

  function persistName() {
    persist({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name: displayName(firstName, lastName),
    });
  }

  const bmi = bmiKgM(current.weightKg, current.heightCm);
  const windowMin = overnightDuration(profile.targetSleep, profile.targetWake);
  const need = sleepNeedHours(profile.age);
  const loginLabel = prettyContactDisplay(session);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-8 pb-24 md:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <p className="text-[11px] tracking-[0.28em] text-violet-300/80 uppercase">You</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-heading text-[2.35rem] leading-none tracking-tight text-zinc-50">
              {profile.name}
            </h1>
            <p className="mt-3 text-[14px] text-zinc-400">
              {formatClock(profile.targetSleep, profile.units)}
              <span className="mx-2 text-zinc-600">→</span>
              {formatClock(profile.targetWake, profile.units)}
              <span className="mx-2 text-zinc-700">·</span>
              {compactScheduledDays(profile.scheduledDays)}
            </p>
          </div>
          <p className="max-w-[34ch] text-[12px] leading-relaxed text-zinc-600 sm:text-right">
            Notes read this file. Circadia will not change a medication.
          </p>
        </div>

        <div className="mt-8 grid items-start gap-4 lg:grid-cols-2">
          <Panel
            kicker="Clock"
            title="The window we protect"
            hint={`${formatDuration(windowMin)} window. ${need.label}.`}
          >
            <div>
              <p className="mb-2 text-[12px] text-zinc-500">Asleep-by</p>
              <BubbleGroup
                value={profile.targetSleep}
                onChange={(targetSleep) => persist({ targetSleep })}
                columns={3}
                options={SLEEP_TARGET_OPTIONS.map((t) => ({
                  value: t,
                  label: formatClock(t, profile.units),
                }))}
              />
            </div>
            <div>
              <p className="mb-2 text-[12px] text-zinc-500">Wake</p>
              <BubbleGroup
                value={profile.targetWake}
                onChange={(targetWake) => persist({ targetWake })}
                columns={3}
                options={WAKE_TARGET_OPTIONS.map((t) => ({
                  value: t,
                  label: formatClock(t, profile.units),
                }))}
              />
            </div>
            <div>
              <p className="mb-1 text-[12px] text-zinc-500">Obligated mornings</p>
              <p className="mb-3 text-[13px] leading-relaxed text-zinc-500">
                Class, a shift, a bus. Not inferred from the calendar.
              </p>
              <ScheduledDaysPicker
                value={profile.scheduledDays}
                onChange={(scheduledDays) => persist({ scheduledDays })}
              />
            </div>
            <SettingRow
              label="Screen-off reminder"
              hint="One ping an hour before asleep-by. Off until you allow it."
            >
              <Switch
                checked={profile.notificationsEnabled}
                aria-label="Screen-off reminder"
                onCheckedChange={(on) => {
                  void (async () => {
                    if (!on) {
                      persist({ notificationsEnabled: false });
                      return;
                    }
                    persist({ notificationsEnabled: await ensureNotificationPermission() });
                  })();
                }}
              />
            </SettingRow>
          </Panel>

          <Panel
            kicker="Body"
            title="What notes may know"
            hint="Used when Circadia writes. Not a medical chart."
          >
            <SettingRow label="Units">
              <Segmented
                value={profile.units}
                onChange={(units: Units) => persist({ units })}
                options={[
                  { value: "imperial", label: "US" },
                  { value: "metric", label: "Metric" },
                ]}
              />
            </SettingRow>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field
                label="Age"
                value={age}
                inputMode="numeric"
                onChange={setAge}
                onBlur={() => persist({ age: Number(age) || profile.age })}
              />
              {metric ? (
                <>
                  <Field
                    label="Height, cm"
                    value={cm}
                    inputMode="decimal"
                    onChange={setCm}
                    onBlur={() => persist({ heightCm: Number(cm) || profile.heightCm })}
                  />
                  <Field
                    label="Weight, kg"
                    value={kg}
                    inputMode="decimal"
                    onChange={setKg}
                    onBlur={() => persist({ weightKg: Number(kg) || profile.weightKg })}
                  />
                </>
              ) : (
                <>
                  <label className="text-[12px] text-zinc-500">
                    Height
                    <span className="mt-1 flex gap-2">
                      <Input
                        inputMode="numeric"
                        value={feet}
                        onChange={(e) => setFeet(e.target.value)}
                        onBlur={() =>
                          persist({ heightCm: feetInchesToCm(Number(feet) || 0, Number(inches) || 0) })
                        }
                        aria-label="Height, feet"
                        className="h-10 rounded-xl border-white/10 bg-white/5"
                      />
                      <Input
                        inputMode="numeric"
                        value={inches}
                        onChange={(e) => setInches(e.target.value)}
                        onBlur={() =>
                          persist({ heightCm: feetInchesToCm(Number(feet) || 0, Number(inches) || 0) })
                        }
                        aria-label="Height, inches"
                        className="h-10 rounded-xl border-white/10 bg-white/5"
                      />
                    </span>
                    <span className="mt-1 block text-[11px] text-zinc-600">ft · in</span>
                  </label>
                  <Field
                    label="Weight, lb"
                    value={pounds}
                    inputMode="decimal"
                    onChange={setPounds}
                    onBlur={() => persist({ weightKg: lbToKg(Number(pounds) || 0) })}
                  />
                </>
              )}
            </div>
            <p className="text-[12px] text-zinc-600">
              BMI {bmi.toFixed(1)}
              <span className="text-zinc-700"> · </span>
              used in notes, not a diagnosis
            </p>
            <div>
              <p className="mb-2 text-[12px] text-zinc-500">Activity</p>
              <BubbleGroup
                value={profile.activity}
                onChange={(activity: ActivityLevel) => persist({ activity })}
                columns={2}
                options={ACTIVITY}
              />
            </div>
            <Chips
              label="Medications"
              empty="None on file. Circadia will not change a prescription."
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
              empty="None on file."
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
          </Panel>

          <Panel kicker="Account" title="This diary">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="First name"
                value={firstName}
                autoComplete="given-name"
                onChange={setFirstName}
                onBlur={persistName}
              />
              <Field
                label="Last name"
                value={lastName}
                autoComplete="family-name"
                onChange={setLastName}
                onBlur={persistName}
              />
            </div>

            {!canLogOut ? (
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="text-[13px] text-zinc-200">Save a login</p>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                  Email or phone plus a password lets you sign out and open this diary again. Circadia
                  will not contact you.
                </p>
                <Input
                  value={loginDraft}
                  onChange={(e) => setLoginDraft(e.target.value)}
                  placeholder="you@school.edu or a phone number"
                  autoComplete="username"
                  className="mt-3 h-10 rounded-xl border-white/10 bg-white/5"
                />
                <YouSecret
                  label="Password"
                  value={loginPassword}
                  onChange={setLoginPassword}
                  autoComplete="new-password"
                />
                <YouSecret
                  label="Confirm password"
                  value={loginConfirm}
                  onChange={setLoginConfirm}
                  autoComplete="new-password"
                />
                {loginError ? <p className="mt-2 text-[13px] text-amber-200/90">{loginError}</p> : null}
                <Button
                  type="button"
                  className="mt-3 h-10 w-full cursor-pointer rounded-full bg-zinc-50 text-zinc-950"
                  onClick={() => {
                    void attachLogin(loginDraft, loginPassword, loginConfirm).then((result) => {
                      if (!result.ok) setLoginError(result.error);
                      else setLoginError(null);
                    });
                  }}
                >
                  Save login
                </Button>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[12px] text-zinc-500">Login</p>
                    <p className="mt-1 truncate text-[15px] text-zinc-50">{loginLabel || "Signed in"}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-zinc-600">
                      Stays signed in on this computer. Encrypted here. No reset email.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 text-[13px]">
                    <button
                      type="button"
                      className="text-zinc-300 hover:text-zinc-50"
                      aria-expanded={changingPassword}
                      onClick={() => {
                        setChangingPassword((open) => !open);
                        setPasswordMsg(null);
                      }}
                    >
                      {changingPassword ? "Cancel" : "Change password"}
                    </button>
                    <button type="button" className="text-zinc-500 hover:text-zinc-300" onClick={logOut}>
                      Log out
                    </button>
                  </div>
                </div>

                {changingPassword ? (
                  <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-4">
                    <YouSecret
                      label="Current password"
                      value={currentPassword}
                      onChange={setCurrentPassword}
                      autoComplete="current-password"
                    />
                    <YouSecret
                      label="New password"
                      value={nextPassword}
                      onChange={setNextPassword}
                      autoComplete="new-password"
                    />
                    <YouSecret
                      label="Confirm new password"
                      value={nextConfirm}
                      onChange={setNextConfirm}
                      autoComplete="new-password"
                    />
                    {passwordMsg ? (
                      <p className="mt-2 text-[13px] text-amber-200/90">{passwordMsg}</p>
                    ) : null}
                    <Button
                      type="button"
                      className="mt-3 h-10 w-full cursor-pointer rounded-full bg-zinc-50 text-zinc-950"
                      onClick={() => {
                        void changePassword(currentPassword, nextPassword, nextConfirm).then((result) => {
                          if (!result.ok) setPasswordMsg(result.error);
                          else {
                            setPasswordMsg("Password updated.");
                            setCurrentPassword("");
                            setNextPassword("");
                            setNextConfirm("");
                            setChangingPassword(false);
                          }
                        });
                      }}
                    >
                      Save password
                    </Button>
                  </div>
                ) : null}

                <p className="mt-3 text-[12px] leading-relaxed text-zinc-600">
                  Closing the app does not log you out. Log out here when you want the password gate
                  back. This computer still has your diary — the same email or phone, plus the
                  password, opens it.
                </p>
              </div>
            )}
          </Panel>

          <StudyPanel />
        </div>

        <section className="mt-8 border-t border-white/[0.06] pt-6">
          <p className="text-[11px] tracking-[0.22em] text-zinc-600 uppercase">This device</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              type="button"
              className="text-[13px] text-zinc-400 hover:text-zinc-200"
              onClick={() => {
                if (state.reports.length > 0 && !window.confirm("Replace your mornings with a labeled sample week?")) {
                  return;
                }
                loadSampleWeek();
              }}
            >
              Load sample week
            </button>
            <button
              type="button"
              className="text-[13px] text-red-300/75 hover:text-red-200"
              onClick={() => {
                if (window.confirm("Erase Circadia on this device?")) resetAll();
              }}
            >
              Erase this device
            </button>
          </div>
          <p className="mt-4 max-w-[52ch] text-[12px] leading-relaxed text-zinc-600">
            Educational tool. Not medical care. If you stop breathing at night, fall asleep while
            driving, or cannot stay awake, that is a clinic, not a chat bar.
          </p>
        </section>
      </div>
    </div>
  );
}

function Panel({
  kicker,
  title,
  hint,
  children,
}: {
  kicker: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
      <p className="text-[10px] font-medium tracking-[0.22em] text-zinc-500 uppercase">{kicker}</p>
      <h2 className="font-heading mt-1 text-[1.35rem] leading-tight text-zinc-50">{title}</h2>
      {hint ? <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">{hint}</p> : null}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-4">
      <div className="min-w-0">
        <p className="text-[13px] text-zinc-200">{label}</p>
        {hint ? <p className="mt-0.5 max-w-[36ch] text-[12px] leading-relaxed text-zinc-500">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="grid grid-cols-2 rounded-full border border-white/12 p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] transition-colors",
              active ? "bg-white/12 text-zinc-50" : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function YouSecret({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="mt-3 block text-[12px] text-zinc-500">
      {label}
      <span className="relative mt-1 block">
        <Input
          type={show ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value.slice(0, 128))}
          className="h-10 rounded-xl border-white/10 bg-white/5 pr-11"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  type = "text",
  inputMode,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  type?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}) {
  return (
    <label className="text-[12px] text-zinc-500">
      {label}
      <Input
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="mt-1 h-10 rounded-xl border-white/10 bg-white/5"
      />
    </label>
  );
}

function Chips({
  label,
  empty,
  items,
  draft,
  setDraft,
  onAdd,
  onRemove,
}: {
  label: string;
  empty: string;
  items: string[];
  draft: string;
  setDraft: (v: string) => void;
  onAdd: () => void;
  onRemove: (item: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[12px] text-zinc-500">{label}</p>
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
          className="h-10 rounded-xl border-white/10 bg-white/5"
        />
        <Button
          type="button"
          variant="outline"
          className="h-10 cursor-pointer rounded-full border-white/15 px-4"
          onClick={onAdd}
        >
          Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-[12px] text-zinc-600">{empty}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <button
              key={item}
              type="button"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] text-zinc-300 hover:border-white/20 hover:text-zinc-50"
              onClick={() => onRemove(item)}
            >
              {item} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
