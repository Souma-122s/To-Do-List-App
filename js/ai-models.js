/**
 * Daylight AI - Model Switcher Component
 * Handles selection between Gemini 3.1 Flash Lite, 3.5 Flash Lite, and 3.5 Flash.
 */

const MODEL_DETAILS = {
  "gemini-3.1-flash-lite": { name: "Gemini 3.1 Flash Lite", icon: "⚡" },
  "gemini-3.5-flash-lite": { name: "Gemini 3.5 Flash Lite", icon: "⚖️" },
  "gemini-3.5-flash": { name: "Gemini 3.5 Flash", icon: "🧠" }
};

let currentSelectedModel = localStorage.getItem("daylight_ai_model") || "gemini-3.5-flash-lite";
if (!MODEL_DETAILS[currentSelectedModel] || currentSelectedModel === "gemini-3.1-flash-lite") {
  currentSelectedModel = "gemini-3.5-flash-lite";
}

function getCurrentModel() {
  return currentSelectedModel;
}

function updateModelPickerUI() {
  const model = MODEL_DETAILS[currentSelectedModel] || MODEL_DETAILS["gemini-3.1-flash-lite"];
  const iconEl = document.querySelector("#selected-model-icon");
  const nameEl = document.querySelector("#selected-model-name");
  if (iconEl) iconEl.textContent = model.icon;
  if (nameEl) nameEl.textContent = model.name;

  document.querySelectorAll(".ai-model-option").forEach((opt) => {
    const isSelected = opt.dataset.model === currentSelectedModel;
    opt.classList.toggle("active", isSelected);
    opt.setAttribute("aria-selected", String(isSelected));
  });
}

function initModelPicker({ showToast = () => {}, onModelChange = () => {} } = {}) {
  const pickerBtn = document.querySelector("#ai-model-btn");
  const dropdown = document.querySelector("#ai-model-dropdown");
  if (!pickerBtn || !dropdown) return;

  updateModelPickerUI();

  pickerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = dropdown.hidden;
    dropdown.hidden = !isHidden;
    pickerBtn.setAttribute("aria-expanded", String(!isHidden));
  });

  dropdown.querySelectorAll(".ai-model-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      const model = opt.dataset.model;
      if (model && MODEL_DETAILS[model]) {
        currentSelectedModel = model;
        localStorage.setItem("daylight_ai_model", model);
        updateModelPickerUI();
        dropdown.hidden = true;
        pickerBtn.setAttribute("aria-expanded", "false");
        showToast(`Model switched to ${MODEL_DETAILS[model].name}`);
        onModelChange(model);
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.hidden && !dropdown.contains(e.target) && !pickerBtn.contains(e.target)) {
      dropdown.hidden = true;
      pickerBtn.setAttribute("aria-expanded", "false");
    }
  });
}

window.DaylightModels = {
  MODEL_DETAILS,
  getCurrentModel,
  updateModelPickerUI,
  initModelPicker
};
