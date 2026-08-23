"use client"

import { useEffect, useMemo, useState } from "react"
import { RotateCcw, Save, SlidersHorizontal, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ExportDialog } from "@/components/export-dialog"
import { SettingsImportDialog } from "@/components/settings-import-dialog"
import { loadPresets, loadTweaks, savePresets, saveTweaks } from "@/lib/storage"
import {
  TWEAKS,
  buildSettings,
  defaultTweakState,
  deletePreset,
  savePreset,
  tweakSettingsJson,
  type TweakDef,
  type TweakPreset,
  type TweakState,
  type TweakValue,
} from "@/lib/tweaks"

function TweakControl({
  tweak,
  value,
  onChange,
}: {
  tweak: TweakDef
  value: TweakValue
  onChange: (value: TweakValue) => void
}) {
  if (tweak.type === "boolean") {
    return (
      <Switch
        aria-label={tweak.label}
        checked={value === true}
        onCheckedChange={(checked) => onChange(checked)}
      />
    )
  }

  if (tweak.type === "enum") {
    const [off, on] = tweak.options
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{value === on ? on : off}</span>
        <Switch
          aria-label={tweak.label}
          checked={value === on}
          onCheckedChange={(checked) => onChange(checked ? on : off)}
        />
      </div>
    )
  }

  const numeric = typeof value === "number" ? value : tweak.recommended
  return (
    <div className="flex w-40 items-center gap-2">
      <Slider
        aria-label={tweak.label}
        min={tweak.min}
        max={tweak.max}
        step={tweak.step}
        value={[numeric]}
        onValueChange={(next) => {
          const resolved = Array.isArray(next) ? next[0] : next
          if (typeof resolved === "number" && Number.isFinite(resolved)) {
            onChange(resolved)
          }
        }}
      />
      <Input
        type="number"
        min={tweak.min}
        max={tweak.max}
        step={tweak.step}
        value={numeric}
        onChange={(event) => {
          const parsed = Number(event.target.value)
          if (Number.isFinite(parsed)) {
            onChange(parsed)
          }
        }}
        className="h-7 w-16 text-right font-mono text-xs"
      />
    </div>
  )
}

export function CursorTweaks() {
  const [hydrated, setHydrated] = useState(false)
  const [tweaks, setTweaks] = useState<TweakState>(defaultTweakState)
  const [presets, setPresets] = useState<TweakPreset[]>([])
  const [presetName, setPresetName] = useState("")

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore localStorage after mount */
    setTweaks(loadTweaks())
    setPresets(loadPresets())
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    saveTweaks(tweaks)
  }, [hydrated, tweaks])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    savePresets(presets)
  }, [hydrated, presets])

  const includedCount = useMemo(
    () => Object.keys(buildSettings(tweaks)).length,
    [tweaks],
  )
  const json = useMemo(() => tweakSettingsJson(tweaks), [tweaks])

  function setValue(key: string, value: TweakValue) {
    setTweaks((current) => ({ ...current, values: { ...current.values, [key]: value } }))
  }

  function setEnabled(key: string, enabled: boolean) {
    setTweaks((current) => ({ ...current, enabled: { ...current.enabled, [key]: enabled } }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" />
          Cursor tweaks
        </CardTitle>
        <CardDescription>
          Verified <span className="font-mono">settings.json</span> keys the Settings UI hides. Toggle
          the ones you want, adjust values, then export the merge for{" "}
          <span className="font-mono">Preferences: Open User Settings (JSON)</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {TWEAKS.map((tweak) => {
          const included = tweaks.enabled[tweak.key] ?? false
          return (
            <div
              key={tweak.key}
              className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
                included ? "border-border" : "border-dashed opacity-60"
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="font-mono text-sm">{tweak.key}</Label>
                  <Badge variant="outline">{tweak.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{tweak.description}</p>
              </div>
              <div className="flex items-center gap-4">
                <TweakControl
                  tweak={tweak}
                  value={tweaks.values[tweak.key]}
                  onChange={(value) => setValue(tweak.key, value)}
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Include</span>
                  <Switch
                    aria-label={`Include ${tweak.key}`}
                    checked={included}
                    onCheckedChange={(checked) => setEnabled(tweak.key, checked)}
                  />
                </div>
              </div>
            </div>
          )
        })}

        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Presets</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={presetName}
              placeholder="Name this profile"
              onChange={(event) => setPresetName(event.target.value)}
            />
            <Button
              variant="secondary"
              disabled={presetName.trim().length === 0}
              onClick={() => {
                setPresets((current) => savePreset(current, presetName, tweaks))
                setPresetName("")
              }}
            >
              <Save />
              Save preset
            </Button>
          </div>
          {presets.length === 0 ? (
            <p className="text-xs text-muted-foreground">No saved profiles yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <div
                  key={preset.name}
                  className="flex items-center gap-1 rounded-lg border py-1 pr-1 pl-2"
                >
                  <button
                    type="button"
                    className="text-sm hover:underline"
                    onClick={() => setTweaks(preset.state)}
                  >
                    {preset.name}
                  </button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Delete preset ${preset.name}`}
                    onClick={() => setPresets((current) => deletePreset(current, preset.name))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {includedCount} of {TWEAKS.length} keys will be written.
          </p>
          <div className="flex flex-wrap gap-2">
            <SettingsImportDialog current={tweaks} onApply={(next) => setTweaks(next)} />
            <Button variant="ghost" onClick={() => setTweaks(defaultTweakState())}>
              <RotateCcw />
              Reset to recommended
            </Button>
            <ExportDialog
              content={json}
              copyLabel="Copy JSON"
              title="Cursor settings.json"
              description={
                <>
                  Merge these into User Settings JSON via{" "}
                  <span className="font-mono">Preferences: Open User Settings (JSON)</span>, then run{" "}
                  <span className="font-mono">Developer: Reload Window</span>.
                </>
              }
              trigger={
                <>
                  <SlidersHorizontal />
                  Export settings.json
                </>
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
