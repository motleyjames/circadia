"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useCircadia } from "@/context/circadia-store";
import { BubbleGroup } from "@/components/bubbles";
import { StudyPanel } from "@/components/study-panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BringLockedDiaryButton, SaveLockedCopyButton } from "@/components/locked-diary-controls";
import { CrisisLine } from "@/components/crisis-line";
import { ERASE_CONFIRM_WORD } from "@/lib/confirm-word";
import { MEDICAL_DISCLAIMER } from "@/lib/safety-copy";
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
  const [sampleOpen, setSampleOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);

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

  function syncMeasures(from: Profile) {
    const hi = cmToFeetInches(from.heightCm);
    setFeet(String(hi.feet));
    setInches(String(hi.inches));
    setPounds(String(Math.round(kgToLb(from.weightKg))));
    setCm(String(Math.round(from.heightCm)));
    setKg(String(Math.round(from.weightKg)));
  }

  const bmi = bmiKgM(current.weightKg, current.heightCm);
  const windowMin = overnightDuration(profile.targetSleep, profile.targetWake);
  const need = sleepNeedHours(profile.age);
  const loginLabel = prettyContactDisplay(session);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-[max(3.25rem,calc(env(safe-area-inset-top)+2.4rem))] pb-24 md:px-8 md:pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-5xl">
        <p className="text-[11px] tracking-[0.28em] text-violet-300/80 uppercase">You</p>
        <h1 className="font-heading mt-1 text-[2.35rem] leading-none tracking-tight text-zinc-50">
          {profile.name}
        </h1>
        <p className="mt-3 max-w-[44ch] text-[13px] leading-relaxed text-zinc-500">
          The clock, the body file, and how you get back in.
        </p>

        <div className="mt-8 space-y-4">
          <Panel
            kicker="Clock"
            title={formatDuration(windowMin)}
            titleSize="display"
            lede={
              <>
                <p className="mt-2 text-[14px] text-zinc-400">
                  {formatClock(profile.targetSleep, profile.units)}
                  <span className="mx-2 text-zinc-600">→</span>
                  {formatClock(profile.targetWake, profile.units)}
                  <span className="mx-2 text-zinc-700">·</span>
                  {compactScheduledDays(profile.scheduledDays)}
                </p>
                <p className="mt-1 text-[12px] text-zinc-600">{need.label}</p>
              </>
            }
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-[12px] text-zinc-500">Asleep-by</p>
                <BubbleGroup
                  size="compact"
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
                  size="compact"
                  value={profile.targetWake}
                  onChange={(targetWake) => persist({ targetWake })}
                  columns={3}
                  options={WAKE_TARGET_OPTIONS.map((t) => ({
                    value: t,
                    label: formatClock(t, profile.units),
                  }))}
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-[12px] text-zinc-500">Obligated mornings</p>
              <ScheduledDaysPicker
                value={profile.scheduledDays}
                onChange={(scheduledDays) => persist({ scheduledDays })}
              />
            </div>

            <SettingRow
              label="Screen-off reminder"
              hint="One ping an hour before asleep-by."
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

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Panel
              kicker="Body"
              title="What notes may know"
              action={
                <Segmented
                  value={profile.units}
                  onChange={(units: Units) => {
                    persist({ units });
                    syncMeasures(current);
                  }}
                  options={[
                    { value: "imperial", label: "US" },
                    { value: "metric", label: "Metric" },
                  ]}
                />
              }
            >
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
                    <UnitField
                      label="Height"
                      unit="cm"
                      value={cm}
                      inputMode="decimal"
                      onChange={setCm}
                      onBlur={() => persist({ heightCm: Number(cm) || profile.heightCm })}
                    />
                    <UnitField
                      label="Weight"
                      unit="kg"
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
                      <span className="mt-1 flex items-center gap-1.5">
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
                        <span className="text-[11px] text-zinc-600">ft</span>
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
                        <span className="text-[11px] text-zinc-600">in</span>
                      </span>
                    </label>
                    <UnitField
                      label="Weight"
                      unit="lb"
                      value={pounds}
                      inputMode="decimal"
                      onChange={setPounds}
                      onBlur={() => persist({ weightKg: lbToKg(Number(pounds) || 0) })}
                    />
                  </>
                )}
              </div>
              <p className="text-[12px] text-zinc-600">BMI {bmi.toFixed(1)} · notes only, not a diagnosis</p>
              <div>
                <p className="mb-2 text-[12px] text-zinc-500">Activity</p>
                <BubbleGroup
                  size="compact"
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
                <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                  <p className="text-[13px] text-zinc-200">Save a login</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                    Email or phone plus a password lets you sign out and open this diary again.
                    Circadia will not contact you.
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
                  <button
                    type="button"
                    className="mt-4 h-10 w-full rounded-full bg-zinc-50 text-[13px] font-medium text-zinc-950 hover:bg-zinc-200"
                    onClick={() => {
                      void attachLogin(loginDraft, loginPassword, loginConfirm).then((result) => {
                        if (!result.ok) setLoginError(result.error);
                        else setLoginError(null);
                      });
                    }}
                  >
                    Save login
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[12px] text-zinc-500">Login</p>
                      <p className="mt-1 truncate text-[15px] text-zinc-50">{loginLabel || "Signed in"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-[13px]">
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
                      <span className="text-zinc-700" aria-hidden>
                        ·
                      </span>
                      <button type="button" className="text-zinc-500 hover:text-zinc-300" onClick={logOut}>
                        Log out
                      </button>
                    </div>
                  </div>

                  {changingPassword ? (
                    <div className="mt-4 rounded-2xl border border-white/8 bg-black/25 p-4">
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
                      {passwordMsg && passwordMsg !== "Password updated." ? (
                        <p className="mt-2 text-[13px] text-amber-200/90">{passwordMsg}</p>
                      ) : null}
                      <button
                        type="button"
                        className="mt-4 h-10 w-full rounded-full bg-zinc-50 text-[13px] font-medium text-zinc-950 hover:bg-zinc-200"
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
                      </button>
                    </div>
                  ) : passwordMsg === "Password updated." ? (
                    <p className="mt-3 text-[12px] text-zinc-400">Password updated.</p>
                  ) : null}

                  <p className="mt-4 text-[12px] leading-relaxed text-zinc-600">
                    Closing the app does not log you out. Log out here when you want the password gate
                    back. This device still has your diary — the same email or phone, plus the
                    password, opens it.
                  </p>
                </div>
              )}
            </Panel>

            <div className="lg:col-span-2">
              <StudyPanel />
            </div>
          </div>
        </div>

        <section className="mt-8 border-t border-white/[0.06] pt-6">
          <p className="text-[11px] tracking-[0.22em] text-zinc-600 uppercase">This device</p>
          <div className="mt-3 flex flex-col gap-2 text-[13px] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
            <SaveLockedCopyButton className="min-h-11 text-left text-zinc-400 hover:text-zinc-200" />
            <BringLockedDiaryButton
              alwaysConfirm
              className="min-h-11 text-left text-zinc-400 hover:text-zinc-200"
              onInstalled={() => logOut()}
            />
            <button
              type="button"
              className="min-h-11 text-left text-zinc-400 hover:text-zinc-200"
              onClick={() => {
                if (state.reports.length > 0) {
                  setSampleOpen(true);
                  return;
                }
                loadSampleWeek();
              }}
            >
              Load sample week
            </button>
            <button
              type="button"
              className="min-h-11 text-left text-red-300/70 hover:text-red-200"
              onClick={() => setEraseOpen(true)}
            >
              Erase this device
            </button>
          </div>
          <p className="mt-4 max-w-[52ch] text-[12px] leading-relaxed text-zinc-600">
            {MEDICAL_DISCLAIMER}
          </p>
          <CrisisLine className="mt-2 max-w-[52ch] text-[12px] leading-relaxed text-zinc-600" />
        </section>
        <ConfirmDialog
          open={sampleOpen}
          onOpenChange={setSampleOpen}
          title="Load a sample week"
          description="This replaces mornings already on this device with a labeled sample week. It is fake data."
          confirmLabel="Replace mornings"
          onConfirm={loadSampleWeek}
        />
        <ConfirmDialog
          open={eraseOpen}
          onOpenChange={setEraseOpen}
          title="Erase this device"
          description="Mornings, the password, and the stay-signed-in key leave this device. Type erase to confirm."
          confirmLabel="Erase"
          destructive
          confirmWord={ERASE_CONFIRM_WORD}
          onConfirm={resetAll}
        />
      </div>
    </div>
  );
}

function Panel({
  kicker,
  title,
  lede,
  action,
  titleSize = "section",
  children,
}: {
  kicker: string;
  title: string;
  lede?: ReactNode;
  action?: ReactNode;
  titleSize?: "section" | "display";
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-[0.22em] text-zinc-500 uppercase">{kicker}</p>
          <h2
            className={cn(
              "font-heading mt-1 leading-none tracking-tight text-zinc-50",
              titleSize === "display" ? "text-[2.15rem]" : "text-[1.45rem]",
            )}
          >
            {title}
          </h2>
          {lede}
        </div>
        {action ? <div className="shrink-0 pt-1">{action}</div> : null}
      </div>
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

function UnitField({
  label,
  unit,
  value,
  onChange,
  onBlur,
  inputMode,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="text-[12px] text-zinc-500">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <Input
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-label={`${label}, ${unit}`}
          className="h-10 rounded-xl border-white/10 bg-white/5"
        />
        <span className="w-6 shrink-0 text-[11px] text-zinc-600">{unit}</span>
      </span>
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
      <div className="flex items-center gap-3">
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
        <button
          type="button"
          className="shrink-0 text-[13px] text-zinc-300 hover:text-zinc-50"
          onClick={onAdd}
        >
          Add
        </button>
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
