import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import {
  useSettings,
  useTranslation,
  type PluginSurfaceProps,
  type SettingsState,
} from "@getpaseo/plugin/client";
import {
  Markdown,
  SettingsAction,
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  TextInput as KitTextInput,
} from "@getpaseo/plugin/client/ui";
import {
  applyPreset,
  buildMarkdownCss,
  BUILTIN_PRESETS,
  COLOR_PATTERN,
  defaultStyleValues,
  deletePreset,
  HEADING_SIZE_PRESETS,
  isUserPreset,
  lookOf,
  MAX_PRESETS,
  preferences,
  renamePreset,
  savePresetAs,
  SOLID_COLORS,
  STYLE_ELEMENTS,
  STYLE_ELEMENT_GROUPS,
  syncActivePreset,
  TINT_COLORS,
  uniquePresetName,
  type MarkdownLook,
  type MarkdownStyleValues,
  type StyleElement,
} from "../shared/style";
import { messages } from "./messages";
import { applyMarkdownCss, countDescendantMarks, pickColor } from "./web";

type ReadySettings = Extract<SettingsState<typeof preferences.schema>, { status: "ready" }>;

const SIZE_PRESET_ORDER = ["small", "medium", "large", "extraLarge"] as const;

const SIZE_LABEL_KEYS = {
  small: "heading.small",
  medium: "heading.medium",
  large: "heading.large",
  extraLarge: "heading.extraLarge",
} as const;

const HEADING_SELECTS: Array<{
  key: "h1Size" | "h2Size" | "h3Size";
  sizeKey: "h1" | "h2" | "h3";
  labelKey: "heading.h1" | "heading.h2" | "heading.h3";
}> = [
  { key: "h1Size", sizeKey: "h1", labelKey: "heading.h1" },
  { key: "h2Size", sizeKey: "h2", labelKey: "heading.h2" },
  { key: "h3Size", sizeKey: "h3", labelKey: "heading.h3" },
];

interface Draft {
  elementColors: Record<string, string>;
  elementBackgrounds: Record<string, string>;
  customCss: string;
}

function toDraft(values: MarkdownStyleValues): Draft {
  return {
    elementColors: { ...values.elementColors },
    elementBackgrounds: { ...values.elementBackgrounds },
    customCss: values.customCss,
  };
}

type HighlightSupport = "probing" | "supported" | "unsupported";

/**
 * The ==highlight== parser only ships in the Moyf build. Probe the live preview
 * for a real <mark> element: the sample text renders through the host Markdown
 * pipeline, so a parsed mark is a behavioral test, not an API check.
 */
function useHighlightSupport(previewRef: RefObject<View | null>, isWeb: boolean): HighlightSupport {
  const [support, setSupport] = useState<HighlightSupport>(isWeb ? "probing" : "unsupported");
  useEffect(() => {
    if (!isWeb) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 2000;
    const tick = () => {
      if (cancelled) return;
      if (countDescendantMarks(previewRef.current) > 0) {
        setSupport("supported");
        return;
      }
      if (Date.now() >= deadline) {
        setSupport("unsupported");
        return;
      }
      timer = setTimeout(tick, 150);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isWeb, previewRef]);
  return support;
}

function SwatchRow({
  label,
  value,
  swatches,
  onSelect,
  theme,
}: {
  label: string;
  value: string;
  swatches: readonly string[];
  onSelect(color: string): void;
  theme: PluginSurfaceProps["theme"];
}) {
  const { t } = useTranslation(messages);
  const [picking, setPicking] = useState(false);
  const cancelPick = useRef<(() => void) | null>(null);
  const selectedBorder = useMemo(() => ({ borderColor: theme.colors.foreground }), [theme]);
  const idleBorder = useMemo(() => ({ borderColor: theme.colors.border }), [theme]);
  const emptyLabelStyle = useMemo(
    () => [styles.swatchEmptyLabel, { color: theme.colors.foreground }],
    [theme],
  );
  const pickerLabelStyle = useMemo(
    () => [styles.swatchPickerLabel, { color: theme.colors.foreground }],
    [theme],
  );

  // A picker left open would call back into a dead row after the user navigates
  // away, so the cancel function is held here and run on unmount.
  useEffect(() => () => cancelPick.current?.(), []);

  const openPicker = () => {
    if (picking) return;
    setPicking(true);
    const cancel = pickColor(value, (color) => {
      setPicking(false);
      cancelPick.current = null;
      onSelect(color);
    });
    // Without a picker the button would look broken; fall back to the hex input.
    if (!cancel) {
      setPicking(false);
      return;
    }
    cancelPick.current = cancel;
  };

  return (
    <View style={styles.swatchRow}>
      {swatches.map((color) => {
        const selected = value.toLowerCase() === color.toLowerCase();
        return (
          <Pressable
            key={color}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${color}`}
            onPress={() => onSelect(color)}
            style={[
              styles.swatch,
              { backgroundColor: color },
              selected ? selectedBorder : idleBorder,
            ]}
          />
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${t("color.pick")}`}
        onPress={openPicker}
        style={[styles.swatch, styles.swatchPicker, idleBorder]}
      >
        <Text style={pickerLabelStyle}>{t("color.pickShort")}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${t("color.followTheme")}`}
        onPress={() => onSelect("")}
        style={[styles.swatch, styles.swatchEmpty, value === "" ? selectedBorder : idleBorder]}
      >
        <Text style={emptyLabelStyle}>{t("color.emptySwatch")}</Text>
      </Pressable>
    </View>
  );
}

function StyleControls({
  settings,
  theme,
  isWeb,
}: {
  settings: ReadySettings;
  theme: PluginSurfaceProps["theme"];
  isWeb: boolean;
}) {
  const { t } = useTranslation(messages);
  const [draft, setDraft] = useState(() => toDraft(settings.values));
  const [draftError, setDraftError] = useState("");
  const [cssHeight, setCssHeight] = useState(120);
  const [presetName, setPresetName] = useState("");
  const dragStart = useRef<{ y: number; height: number } | null>(null);
  const previewRef = useRef<View | null>(null);
  /**
   * Values this panel intends to persist, plus the revision they came from.
   * Refs, not state, because a burst of taps happens inside one render.
   */
  const intent = useRef<MarkdownStyleValues>(settings.values);
  const revisionRef = useRef(settings.revision);
  const dirty = useRef(false);
  const saving = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const muted = useMemo(() => ({ color: theme.colors.foregroundMuted }), [theme]);
  const reminderBoldStyle = useMemo(
    () => ({ color: theme.colors.foreground, fontWeight: "600" as const }),
    [theme],
  );
  const fieldLabelStyle = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  const fieldHintStyle = useMemo(
    () => ({ color: theme.colors.foregroundMuted, fontSize: 12 }),
    [theme],
  );
  const previewBoxStyle = useMemo(
    () => ({
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      backgroundColor: theme.colors.surface1,
      padding: 12,
    }),
    [theme],
  );
  const inputStyle = useMemo(
    () => ({
      color: theme.colors.foreground,
      backgroundColor: theme.colors.surface0,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 8,
    }),
    [theme],
  );
  const cssInputStyle = useMemo(
    () => [styles.cssInput, inputStyle, { height: cssHeight }],
    [inputStyle, cssHeight],
  );
  const resizeGripStyle = useMemo(
    () => [styles.resizeGrip, { backgroundColor: theme.colors.border }],
    [theme],
  );

  // Settings can change under the panel, for example from another client.
  useEffect(() => {
    revisionRef.current = settings.revision;
    if (!dirty.current) {
      intent.current = settings.values;
      setDraft(toDraft(settings.values));
    }
  }, [settings.values, settings.revision]);

  /**
   * Immediate controls fire faster than the daemon round-trip, so every tap used
   * to write from the render closure's stale values and revision and only the
   * last one survived the compare-and-swap. Accumulate into `intent` instead and
   * keep one save in flight; the effect above advances `revisionRef` once the
   * acknowledged revision arrives, so a follow-up save reschedules rather than
   * retrying inline against a revision that is already spent.
   */
  const flush = async () => {
    if (saving.current || !dirty.current) return;
    saving.current = true;
    const snapshot = intent.current;
    let saved = false;
    try {
      saved = await settings.save(snapshot, revisionRef.current);
    } finally {
      saving.current = false;
    }
    if (!saved) {
      dirty.current = false;
      setDraftError(t("save.failed"));
      return;
    }
    setDraftError("");
    if (intent.current === snapshot) dirty.current = false;
    else scheduleSave();
  };

  const scheduleSave = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 150);
  };

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  /**
   * The single write path for anything that changes the look. When an active
   * preset exists the change also lands in it, so switching away and back keeps
   * the edit instead of restoring the values the preset was saved with.
   */
  const merge = (patch: Partial<MarkdownStyleValues>) => {
    const merged = { ...intent.current, ...patch };
    const next = { ...syncActivePreset(merged), ...patch };
    intent.current = next;
    dirty.current = true;
    applyMarkdownCss(buildMarkdownCss(next));
    scheduleSave();
  };

  /** Replace the whole look, used by preset switching and reset. */
  const replaceAll = (next: MarkdownStyleValues) => {
    intent.current = next;
    dirty.current = true;
    setDraft(toDraft(next));
    applyMarkdownCss(buildMarkdownCss(next));
    scheduleSave();
  };

  const changeColor = (elementId: string, color: string) => {
    const elementColors = { ...intent.current.elementColors, [elementId]: color };
    setDraft((current) => ({ ...current, elementColors }));
    merge({ elementColors });
  };

  const changeBackground = (elementId: string, color: string) => {
    const elementBackgrounds = { ...intent.current.elementBackgrounds, [elementId]: color };
    setDraft((current) => ({ ...current, elementBackgrounds }));
    merge({ elementBackgrounds });
  };

  const changeSize = (field: "h1Size" | "h2Size" | "h3Size", px: string) => {
    merge({ [field]: Number.parseInt(px, 10) });
  };

  const saveDraft = () => {
    for (const element of STYLE_ELEMENTS) {
      for (const [kind, map] of [
        ["color", draft.elementColors],
        ["background", draft.elementBackgrounds],
      ] as const) {
        const value = (map[element.id] ?? "").trim();
        if (value && !COLOR_PATTERN.test(value)) {
          setDraftError(
            t("color.errorElement", {
              label: t(`element.${element.id}`),
              kind: t(`color.kind.${kind}`),
            }),
          );
          return;
        }
      }
    }
    if (draft.customCss.length > 8000) {
      setDraftError(t("customCss.tooLong"));
      return;
    }
    const elementColors: Record<string, string> = {};
    const elementBackgrounds: Record<string, string> = {};
    for (const element of STYLE_ELEMENTS) {
      const color = (draft.elementColors[element.id] ?? "").trim();
      const background = (draft.elementBackgrounds[element.id] ?? "").trim();
      if (color) elementColors[element.id] = color;
      if (background && element.background) elementBackgrounds[element.id] = background;
    }
    setDraftError("");
    merge({ elementColors, elementBackgrounds, customCss: draft.customCss });
  };

  const resetAll = () => {
    const next = defaultStyleValues();
    setDraft(toDraft(next));
    replaceAll({ ...next, presets: intent.current.presets, activePresetId: "" });
  };

  const userPresets = useMemo(
    () =>
      Object.entries(settings.values.presets)
        .map(([id, preset]) => ({ id, name: preset.name }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [settings.values.presets],
  );
  const activeName = isUserPreset(settings.values, settings.values.activePresetId)
    ? settings.values.presets[settings.values.activePresetId]?.name
    : undefined;

  /** Load a look without saving it as the user's own. */
  const loadLook = (id: string, look: MarkdownLook) => {
    replaceAll(applyPreset(intent.current, id, look));
  };

  const saveAsPreset = () => {
    const name = presetName.trim();
    if (!name) {
      setDraftError(t("presets.nameRequired"));
      return;
    }
    if (Object.keys(intent.current.presets).length >= MAX_PRESETS) {
      setDraftError(t("presets.tooMany", { max: MAX_PRESETS }));
      return;
    }
    const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const finalName = uniquePresetName(intent.current, name);
    setDraftError("");
    setPresetName("");
    replaceAll(savePresetAs(intent.current, id, finalName));
  };

  const overwriteActive = () => {
    if (!activeName) return;
    replaceAll(syncActivePreset(intent.current));
  };

  const renameActive = () => {
    const id = intent.current.activePresetId;
    const name = presetName.trim();
    if (!isUserPreset(intent.current, id) || !name) return;
    setDraftError("");
    setPresetName("");
    replaceAll(renamePreset(syncActivePreset(intent.current), id, uniquePresetName(intent.current, name)));
  };

  const removeActive = () => {
    const id = intent.current.activePresetId;
    if (!isUserPreset(intent.current, id)) return;
    // Keep the current look on screen; only the stored copy goes away.
    replaceAll({ ...deletePreset(intent.current, id), activePresetId: "" });
  };

  const sizeOptions = (current: number, presets: Record<string, number>) => {
    const options = [
      { label: t("heading.followTheme"), value: "0" },
      ...SIZE_PRESET_ORDER.map((labelKey) => ({
        label: t("heading.sizeOption", {
          label: t(SIZE_LABEL_KEYS[labelKey]),
          px: presets[labelKey],
        }),
        value: String(presets[labelKey]),
      })),
    ];
    if (!options.some((option) => option.value === String(current))) {
      options.push({ label: t("heading.customPx", { px: current }), value: String(current) });
    }
    return options;
  };

  const highlightSupport = useHighlightSupport(previewRef, isWeb);
  const visibleElements = useMemo(
    () =>
      highlightSupport === "supported"
        ? STYLE_ELEMENTS
        : STYLE_ELEMENTS.filter((element) => element.id !== "highlight"),
    [highlightSupport],
  );
  const grouped = useMemo(
    () =>
      STYLE_ELEMENT_GROUPS.map((group) => ({
        group,
        elements: visibleElements.filter((element) => element.group === group),
      })).filter((entry) => entry.elements.length > 0),
    [visibleElements],
  );
  const previewSample = useMemo(
    () =>
      [
        `# ${t("preview.h1")}`,
        `## ${t("preview.h2")}`,
        t("preview.body"),
        `### ${t("preview.h3")}`,
        `> ${t("preview.quote")}`,
        t("preview.list"),
        `\`${t("preview.inlineCode")}\``,
        t("preview.codeBlock"),
        t("preview.table"),
      ].join("\n\n"),
    [t],
  );

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  // Measure the pane, not the window: the settings screen is inset by the app
  // sidebar and capped at 720px, so a 1500px window holds a ~690px pane. Until
  // the first layout pass reports, the window width stands in and the layout
  // settles one frame later.
  const paneWidth = measuredWidth || windowWidth;
  const twoColumn = paneWidth >= 560;

  const colorColumn = (
    <>
      <SettingsSection title={t("title")}>
        <SettingsCard>
          <SettingsSwitch
            label={t("enable.label")}
            hint={t("enable.hint")}
            value={settings.values.enabled}
            onValueChange={(enabled) => merge({ enabled })}
          />
          <SettingsSwitch
            label={t("indicator.label")}
            hint={t("indicator.hint")}
            value={settings.values.headingLevelIndicators}
            onValueChange={(headingLevelIndicators) => merge({ headingLevelIndicators })}
          />
        </SettingsCard>
        <SettingsCard>
          {HEADING_SELECTS.map((select) => (
            <SettingsSelect
              key={select.key}
              label={t(select.labelKey)}
              value={String(settings.values[select.key])}
              options={sizeOptions(
                settings.values[select.key],
                HEADING_SIZE_PRESETS[select.sizeKey],
              )}
              onValueChange={(px) => changeSize(select.key, px)}
            />
          ))}
        </SettingsCard>
        {grouped.map(({ group, elements }) => (
          <SettingsSection key={group} title={t(`group.${group}`)}>
            <SettingsCard>
              {elements.map((element: StyleElement) => (
                <View
                  key={element.id}
                  style={[styles.elementRow, { borderBottomColor: theme.colors.border }]}
                >
                  <Text style={[styles.elementLabel, fieldLabelStyle]}>
                    {t(`element.${element.id}`)}
                  </Text>
                  <View style={styles.elementControls}>
                    <SwatchRow
                      label={t(`element.${element.id}`)}
                      value={settings.values.elementColors[element.id] ?? ""}
                      swatches={SOLID_COLORS}
                      onSelect={(color) => changeColor(element.id, color)}
                      theme={theme}
                    />
                    <KitTextInput
                      value={draft.elementColors[element.id] ?? ""}
                      onChangeText={(text) =>
                        setDraft((current) => ({
                          ...current,
                          elementColors: { ...current.elementColors, [element.id]: text },
                        }))
                      }
                      placeholder={t("color.textPlaceholder")}
                      placeholderTextColor={theme.colors.foregroundMuted}
                      style={inputStyle}
                    />
                    {element.background ? (
                      <>
                        <Text style={fieldHintStyle}>{t("color.backgroundHint")}</Text>
                        <SwatchRow
                          label={`${t(`element.${element.id}`)} ${t("color.backgroundHint")}`}
                          value={settings.values.elementBackgrounds[element.id] ?? ""}
                          swatches={element.tintable ? TINT_COLORS : SOLID_COLORS}
                          onSelect={(color) => changeBackground(element.id, color)}
                          theme={theme}
                        />
                        <KitTextInput
                          value={draft.elementBackgrounds[element.id] ?? ""}
                          onChangeText={(text) =>
                            setDraft((current) => ({
                              ...current,
                              elementBackgrounds: {
                                ...current.elementBackgrounds,
                                [element.id]: text,
                              },
                            }))
                          }
                          placeholder={t("color.backgroundPlaceholder")}
                          placeholderTextColor={theme.colors.foregroundMuted}
                          style={inputStyle}
                        />
                      </>
                    ) : null}
                  </View>
                </View>
              ))}
            </SettingsCard>
          </SettingsSection>
        ))}
        <SettingsCard>
          <View style={styles.cssField}>
            <Text style={fieldLabelStyle}>{t("customCss.label")}</Text>
            <Text style={fieldHintStyle}>{t("customCss.hint")}</Text>
            <KitTextInput
              value={draft.customCss}
              onChangeText={(customCss) => setDraft((current) => ({ ...current, customCss }))}
              placeholder=".enrm-text blockquote { border-color: #b078d0; }"
              placeholderTextColor={theme.colors.foregroundMuted}
              multiline
              textAlignVertical="top"
              style={cssInputStyle}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("customCss.resizeHandle")}
              style={styles.resizeHandle}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(event) => {
                dragStart.current = { y: event.nativeEvent.pageY, height: cssHeight };
              }}
              onResponderMove={(event) => {
                if (!dragStart.current) return;
                const next =
                  dragStart.current.height + (event.nativeEvent.pageY - dragStart.current.y);
                setCssHeight(Math.min(600, Math.max(72, Math.round(next))));
              }}
              onResponderRelease={() => {
                dragStart.current = null;
              }}
            >
              <View style={resizeGripStyle} />
            </Pressable>
          </View>
          <SettingsAction
            label={t("save.label")}
            actionLabel={t("save.action")}
            onPress={saveDraft}
          />
          <SettingsAction
            label={t("resetAll.label")}
            actionLabel={t("resetAll.action")}
            onPress={resetAll}
          />
        </SettingsCard>
        {draftError ? (
          <Text accessibilityRole="alert" style={muted}>
            {draftError}
          </Text>
        ) : null}
        {!isWeb ? <Text style={muted}>{t("platformHint")}</Text> : null}
      </SettingsSection>
    </>
  );

  const previewPane = (
    <SettingsSection title={t("preview.title")}>
      <SettingsCard>
        <View ref={previewRef} style={previewBoxStyle}>
          <Markdown>{previewSample}</Markdown>
          <View style={styles.previewHints}>
            <Text style={muted}>{t("preview.tryHint")}</Text>
            <Text style={muted}>
              {t("preview.reminderBefore")}
              <Text style={reminderBoldStyle}>{t("preview.reminderBold")}</Text>
              {t("preview.reminderAfter")}
            </Text>
          </View>
        </View>
        {isWeb && highlightSupport === "unsupported" ? (
          <Text style={muted}>{t("preview.unsupported")}</Text>
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );

  // Presets sit above the preview so a long user list never pushes them out of
  // reach; each pane scrolls on its own.
  const presetPane = (
    <SettingsSection title={t("presets.title")}>
      <SettingsCard>
        <View style={styles.presetCurrent}>
          <Text style={fieldHintStyle}>{t("presets.current")}</Text>
          <Text style={fieldLabelStyle}>
            {activeName ? t("presets.editsInPlace", { name: activeName }) : t("presets.unsaved")}
          </Text>
        </View>
      </SettingsCard>
      <SettingsCard>
        <View style={styles.cssField}>
          <Text style={fieldLabelStyle}>{t("presets.saveAs")}</Text>
          <Text style={fieldHintStyle}>{t("presets.saveAsHint")}</Text>
          <KitTextInput
            value={presetName}
            onChangeText={setPresetName}
            placeholder={t("presets.namePlaceholder")}
            placeholderTextColor={theme.colors.foregroundMuted}
            style={inputStyle}
          />
        </View>
        <View style={styles.presetActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("presets.save")}
            onPress={saveAsPreset}
            style={[
              styles.presetButton,
              styles.presetPrimary,
              { borderColor: theme.colors.accent, backgroundColor: theme.colors.surface2 },
            ]}
          >
            <Text style={fieldLabelStyle}>{t("presets.save")}</Text>
          </Pressable>
          {activeName ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("presets.overwrite")}
                onPress={overwriteActive}
                style={[styles.presetButton, { borderColor: theme.colors.border }]}
              >
                <Text style={fieldLabelStyle}>{t("presets.overwrite")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("presets.rename")}
                onPress={renameActive}
                style={[styles.presetButton, { borderColor: theme.colors.border }]}
              >
                <Text style={fieldLabelStyle}>{t("presets.rename")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("presets.delete")}
                onPress={removeActive}
                style={[styles.presetButton, { borderColor: theme.colors.border }]}
              >
                <Text style={fieldLabelStyle}>{t("presets.delete")}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </SettingsCard>
      <SettingsCard>
        <View style={styles.presetChips}>
          {BUILTIN_PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              accessibilityRole="button"
              accessibilityLabel={`${t("presets.load")} ${preset.name}`}
              onPress={() => loadLook(preset.id, preset.look)}
              style={[styles.presetButton, { borderColor: theme.colors.border }]}
            >
              <Text style={fieldLabelStyle} numberOfLines={1}>
                {preset.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </SettingsCard>
      <SettingsCard>
        {userPresets.length === 0 ? (
          <View style={styles.presetCurrent}>
            <Text style={fieldHintStyle}>{t("presets.none")}</Text>
            <Text style={fieldHintStyle}>{t("presets.noneHint")}</Text>
          </View>
        ) : (
          userPresets.map((preset) => {
            const active = preset.id === settings.values.activePresetId;
            return (
              <View
                key={preset.id}
                style={[styles.presetRow, { borderBottomColor: theme.colors.border }]}
              >
                <Text style={[styles.presetName, fieldLabelStyle]} numberOfLines={1}>
                  {preset.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("presets.load")} ${preset.name}`}
                  onPress={() => loadLook(preset.id, settings.values.presets[preset.id].look)}
                  style={[
                    styles.presetButton,
                    {
                      borderColor: active ? theme.colors.accent : theme.colors.border,
                      backgroundColor: active ? theme.colors.surface2 : "transparent",
                    },
                  ]}
                >
                  <Text style={fieldLabelStyle}>
                    {active ? t("presets.activeAction") : t("presets.load")}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}
      </SettingsCard>
    </SettingsSection>
  );

  // The measured width drives the breakpoint, so the probe has to render before
  // the layout it decides. Its first pass reports 0, which falls back to the
  // window width and settles one frame later.
  const measure = (event: { nativeEvent: { layout: { width: number } } }) => {
    setMeasuredWidth(Math.round(event.nativeEvent.layout.width));
  };

  if (!twoColumn) {
    return (
      <View style={styles.probe} onLayout={measure}>
        {previewPane}
        {presetPane}
        {colorColumn}
      </View>
    );
  }

  /**
   * The settings page is itself a scroll view, so a column only scrolls when it
   * has a definite height. This is the viewport minus the page header and
   * padding, with a floor so a short window still shows content.
   */
  const columnHeight = Math.max(320, Math.round(windowHeight - 180));

  /**
   * The settings page caps its content column at 720px, which is right for a
   * form and too narrow for two columns. The cap sits on an ancestor, so it
   * cannot be raised from here; symmetric negative margins on the element inside
   * it request the extra width without moving the centred column.
   *
   * The room comes from the window, not the measured pane: the pane is measured
   * inside the capped column, so it can never report the space the cap hides.
   * The sidebar and the page's own gutters are subtracted first.
   */
  const availableWidth = Math.max(0, Math.round(windowWidth - 340));
  const room = Math.max(0, availableWidth - 720);
  const inset = Math.round(room / 2);
  const widen = inset > 0 ? { marginLeft: -inset, marginRight: -inset } : undefined;

  /**
   * Presets sit above the preview, each in its own scroll view, so a long user
   * list can never push the load controls below the fold the way one shared
   * column did.
   *
   * Presets take their natural height, capped at most of the column, and only
   * scroll once they exceed it; the preview then fills whatever is left. A fixed
   * split wasted half the column on six rows and forced a scroll for a list that
   * already fit.
   */
  const previewFloor = Math.max(160, Math.round(columnHeight * 0.35));
  const presetCap = Math.max(160, columnHeight - previewFloor);

  return (
    <View style={[styles.probe, widen]} onLayout={measure}>
      <View style={styles.columns}>
        <ScrollView
          style={[styles.colorColumn, { height: columnHeight }]}
          contentContainerStyle={styles.columnContent}
          showsVerticalScrollIndicator
        >
          {colorColumn}
        </ScrollView>
        <View style={[styles.previewColumn, { height: columnHeight }]}>
          <ScrollView
            style={[styles.rightPane, { maxHeight: presetCap }]}
            contentContainerStyle={styles.columnContent}
            showsVerticalScrollIndicator
          >
            {presetPane}
          </ScrollView>
          <ScrollView
            style={[styles.rightPane, styles.previewPane]}
            contentContainerStyle={styles.columnContent}
            showsVerticalScrollIndicator
          >
            {previewPane}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = {
  /**
   * No fixed width: the negative margins below only widen the box when the width
   * is auto, since `width: 100%` resolves against the capped parent and pins it
   * to the very width the margins are meant to reclaim.
   */
  probe: { flexShrink: 1 as const, minWidth: 0 },
  /**
   * The stock settings row pins its label to a fixed column, which left the
   * swatches too narrow to stay on one line. This row keeps the label on the
   * left when there is room and stacks it above the controls when there is not,
   * so the swatch row always gets the full column width.
   */
  elementRow: {
    flexDirection: "column" as const,
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  elementLabel: { paddingTop: 2 },
  elementControls: { minWidth: 0, gap: 4 },
  /** Preset rows keep the name flexible and the button at its natural size. */
  presetRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  presetName: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  presetButton: {
    flexShrink: 0 as const,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center" as const,
  },
  presetPrimary: { alignSelf: "stretch" as const },
  presetActions: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  presetCurrent: { gap: 2, paddingHorizontal: 16, paddingVertical: 10 },
  columns: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 20,
    width: "100%" as const,
  },
  // Each column scrolls on its own, which needs a definite height: the parent
  // scroll view would otherwise grow to fit the taller column and neither would
  // scroll. `columnHeight` is applied inline from the measured viewport.
  // A settings row puts its label beside the controls, and a swatch row needs
  // about 306px to stay on one line, so the colour column has to be wide enough
  // for label + swatches + input. `flexBasis: 0` is what makes the ratio apply.
  colorColumn: { flexGrow: 3, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  /**
   * The right column holds two independent scroll views, so it is a plain
   * container with a definite height rather than a scroller itself. `flexBasis:
   * 0` is what makes the 3:2 ratio apply; without it both columns keep their
   * content width.
   */
  previewColumn: { flexGrow: 2, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 12 },
  /** Presets size to content; `flexShrink: 0` keeps the preview from squeezing them. */
  rightPane: { flexShrink: 0 as const, width: "100%" as const },
  /** The preview takes the space the preset pane leaves, and scrolls inside it. */
  previewPane: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
  presetChips: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  columnContent: { paddingBottom: 16 },
  swatchRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
    paddingVertical: 6,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  swatchEmpty: { alignItems: "center" as const, justifyContent: "center" as const },
  swatchEmptyLabel: { fontSize: 9 },
  /** Opens the OS colour picker; sized like a swatch so the row stays even. */
  swatchPicker: { alignItems: "center" as const, justifyContent: "center" as const },
  swatchPickerLabel: { fontSize: 12, fontWeight: "600" as const },
  cssInput: { width: "100%" as const },
  cssField: { gap: 6, paddingHorizontal: 16 },
  previewHints: { marginTop: 8, gap: 2 },
  resizeHandle: { alignItems: "center" as const, paddingVertical: 6 },
  resizeGrip: { width: 36, height: 4, borderRadius: 2 },
};

export function MarkdownStyleSettings({ theme, layout }: PluginSurfaceProps) {
  const { t } = useTranslation(messages);
  const settings = useSettings(preferences);
  const style = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  if (settings.status === "loading") return <Text style={style}>{t("loading")}</Text>;
  if (settings.status !== "ready") {
    return (
      <SettingsSection title={t("title")}>
        <Text style={style}>{settings.error}</Text>
        <SettingsAction
          label={t("reloadLabel")}
          actionLabel={t("reloadAction")}
          onPress={settings.reload}
        />
        {settings.status === "invalid" ? (
          <SettingsAction
            label={t("resetLabel")}
            actionLabel={t("resetAction")}
            onPress={settings.reset}
          />
        ) : null}
      </SettingsSection>
    );
  }
  return (
    <StyleControls
      settings={settings}
      theme={theme}
      isWeb={layout.platform === "web"}
    />
  );
}
