/* CookiList voice-add prototype — stdlib-only parser tests. */
import test from "node:test";
import assert from "node:assert/strict";
import { splitVoiceTranscript, buildVoiceVocabulary } from "../js/voice.js";

test("voice: explicit French separators", () => {
  assert.deepEqual(splitVoiceTranscript("lait, œufs et tomates"), ["lait", "œufs", "tomates"]);
  assert.deepEqual(splitVoiceTranscript("lait puis œufs ensuite café"), ["lait", "œufs", "café"]);
});

test("voice: natural lead-in and determiners", () => {
  assert.deepEqual(splitVoiceTranscript("Ajoute du lait, des œufs et du café"), ["lait", "œufs", "café"]);
  assert.deepEqual(splitVoiceTranscript("il me faut du papier toilette et une lessive"), ["papier toilette", "lessive"]);
});

test("voice: catalogue vocabulary segments punctuation-free dictation", () => {
  const vocab = ["lait", "œufs", "tomates", "papier toilette"];
  assert.deepEqual(splitVoiceTranscript("lait oeufs papier toilette", vocab), ["lait", "œufs", "papier toilette"]);
});

test("voice: unknown uninterrupted phrase stays one item rather than guessing", () => {
  assert.deepEqual(splitVoiceTranscript("truc bizarre", ["lait", "œufs"]), ["truc bizarre"]);
  assert.deepEqual(splitVoiceTranscript(""), []);
});

test("voice: vocabulary collects names and aliases once", () => {
  const index = [
    { entry: { name: "Essuie-tout", aliases: ["sopalin", "essuie tout"] } },
    { entry: { name: "Lait", aliases: ["lait"] } },
  ];
  assert.deepEqual(buildVoiceVocabulary(index), ["Essuie-tout", "sopalin", "Lait"]);
});
