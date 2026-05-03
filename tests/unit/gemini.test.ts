import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@google/generative-ai", () => {
  const generateContent = vi.fn(async () => ({
    response: {
      text: () =>
        JSON.stringify({
          title: "How to: Mocked SOP",
          summary: "Mocked summary returned by the fake Gemini client.",
          steps: ["Step 1: Do A", "Step 2: Do B"],
          tags: ["logistics", "mock"],
          relatedLinks: [],
        }),
    },
  }));

  class GoogleGenerativeAI {
    constructor(_key: string) {}
    getGenerativeModel() {
      return { generateContent };
    }
  }

  return { GoogleGenerativeAI, __generateContent: generateContent };
});

describe("gemini.processTextInput", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("falls back to heuristic processor when no API key is set", async () => {
    delete process.env.GEMINI_API_KEY;
    const { processTextInput } = await import("../../src/lib/gemini");

    const result = await processTextInput(
      "note",
      "Pick the package. Scan the barcode. Hand to driver."
    );

    expect(result.title).toMatch(/^How to:/);
    expect(Array.isArray(result.steps)).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.tags).toContain("logistics");
    expect(result.tags).toContain("note");
  });

  it("uses the mocked Gemini client when an API key is provided", async () => {
    process.env.GEMINI_API_KEY = "fake-test-key-1234567890";
    const { processTextInput } = await import("../../src/lib/gemini");

    const result = await processTextInput("email", "Some email body content.");

    expect(result.title).toBe("How to: Mocked SOP");
    expect(result.steps).toEqual(["Step 1: Do A", "Step 2: Do B"]);
    expect(result.tags).toEqual(["logistics", "mock"]);
  });
});
