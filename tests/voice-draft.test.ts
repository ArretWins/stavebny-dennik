import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyStructuredVoiceDraft,
  appendVoiceTranscript,
  createStructuredVoiceDraft,
  voiceErrorKey,
} from "../src/domain/voiceDraft";

describe("voice diary draft", () => {
  it("appends normalized speech without overwriting manual text", () => {
    expect(
      appendVoiceTranscript(
        "Pripravené debnenie",
        "  betónovanie   základovej dosky  ",
      ),
    ).toBe("Pripravené debnenie. betónovanie základovej dosky");
    expect(appendVoiceTranscript("Práce ukončené.", "Bez závad")).toBe(
      "Práce ukončené. Bez závad",
    );
  });

  it("keeps the generated draft inside the diary field limit", () => {
    const result = appendVoiceTranscript("A".repeat(495), "ďalší text", 500);
    expect(result).toHaveLength(500);
    expect(result.startsWith("A".repeat(495))).toBe(true);
  });

  it("maps actionable recognizer failures to specific guidance", () => {
    expect(voiceErrorKey("not-allowed")).toBe("voice.permissionDenied");
    expect(voiceErrorKey("language-not-supported")).toBe("voice.unavailable");
    expect(voiceErrorKey("network")).toBe("voice.network");
    expect(voiceErrorKey("speech-timeout")).toBe("voice.noSpeech");
    expect(voiceErrorKey("unknown")).toBe("voice.failed");
  });

  it("extracts worker count and site signals from natural Slovak speech", () => {
    expect(
      createStructuredVoiceDraft(
        "Dnes pracovalo šesť pracovníkov. Dokončili sme debnenie. Čakali sme na dodávku betónu kvôli meškaniu.",
      ),
    ).toEqual({
      transcript:
        "Dnes pracovalo šesť pracovníkov. Dokončili sme debnenie. Čakali sme na dodávku betónu kvôli meškaniu.",
      workDescription:
        "Dnes pracovalo šesť pracovníkov. Dokončili sme debnenie. Čakali sme na dodávku betónu kvôli meškaniu.",
      workerCount: 6,
      note: "Čakali sme na dodávku betónu kvôli meškaniu.",
      signals: ["delay", "material"],
    });
    expect(
      createStructuredVoiceDraft("Osadili sme okná, robili 4 ľudia.")
        ?.workerCount,
    ).toBe(4);
  });

  it("marks extra work and safety statements for manual review", () => {
    const draft = createStructuredVoiceDraft(
      "Urobili sme dodatočné práce mimo rozpočtu. Bezpečnostný incident bez úrazu.",
    );
    expect(draft?.signals).toEqual(["extraWork", "safety"]);
    expect(draft?.note).toBe(
      "Urobili sme dodatočné práce mimo rozpočtu. Bezpečnostný incident bez úrazu.",
    );
    expect(createStructuredVoiceDraft("   ")).toBeUndefined();
  });

  it("applies a confirmed draft without erasing manually entered fields", () => {
    const draft = createStructuredVoiceDraft(
      "Dokončené murivo. Pracovali traja murári.",
    );
    expect(draft).toBeDefined();
    expect(
      applyStructuredVoiceDraft(
        {
          workDescription: "Pripravené lešenie",
          workerCount: 2,
          note: "Kontrola ráno",
        },
        draft!,
      ),
    ).toEqual({
      workDescription:
        "Pripravené lešenie. Dokončené murivo. Pracovali traja murári.",
      workerCount: 3,
      note: "Kontrola ráno",
    });
  });

  it("requests microphone access only on demand and preserves manual confirmation", () => {
    const component = readFileSync(
      "src/components/VoiceDraftControl.tsx",
      "utf8",
    );
    const diary = readFileSync("src/screens/DiaryScreen.tsx", "utf8");
    const config = JSON.parse(readFileSync("app.json", "utf8"));
    const manifest = readFileSync(
      "android/app/src/main/AndroidManifest.xml",
      "utf8",
    );

    expect(component).toContain("requestPermissionsAsync()");
    expect(component).toContain("lang: 'sk-SK'");
    expect(component).toContain("interimResults: true");
    expect(component).toContain("createStructuredVoiceDraft(nextTranscript)");
    expect(component).toContain("onApply(draft)");
    expect(component).not.toContain("recordingOptions");
    expect(component).not.toContain("onChange(appendVoiceTranscript");
    expect(diary).toMatch(
      /<VoiceDraftControl[\s\S]*?onApply=\{applyVoiceDraft\}/,
    );
    expect(diary).toContain("applyStructuredVoiceDraft(");
    expect(diary).toMatch(
      /<TextArea[\s\S]*?label=\{t\(["']diary\.workDone["']\)\}/,
    );
    expect(diary).toMatch(/title=\{t\(["']diary\.save["']\)\}/);
    expect(config.expo.plugins.flat(Infinity)).toContain(
      "expo-speech-recognition",
    );
    expect(config.expo.android.permissions).toContain("RECORD_AUDIO");
    expect(config.expo.android.blockedPermissions).not.toContain(
      "android.permission.RECORD_AUDIO",
    );
    expect(manifest).toContain(
      '<uses-permission android:name="android.permission.RECORD_AUDIO"/>',
    );
    expect(manifest).not.toContain(
      'android.permission.RECORD_AUDIO" tools:node="remove"',
    );
  });
});
