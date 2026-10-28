/**
 * Daylight AI - Gemini Models Switcher
 * Handles switching between Gemini 3.5 Flash Lite, Gemini 3.8 Flash, and Gemini 3.1 Pro.
 * All models are 100% free with the same GEMINI_API_KEY from Google AI Studio.
 */

const MODEL_DETAILS = {
  "gemini-3.5-flash-lite": {
    name: "Gemini 3.5 Flash Lite",
    shortName: "Gemini 3.5 Lite",
    badge: "Balanced",
    badgeClass: "balanced",
  },
  "gemini-3.8-flash": {
    name: "Gemini 3.8 Flash",
    shortName: "Gemini 3.8 Flash",
    badge: "Ultra Fast · ~1s",
    badgeClass: "fast",
  },
  "gemini-3.1-pro": {
    name: "Gemini 3.1 Pro",
    shortName: "Gemini 3.1 Pro",
    badge: "Deep Intelligence",
    badgeClass: "thinking",
  },
};

let currentSelectedModel = "gemini-3.8-flash";

try {
  const saved = localStorage.getItem("daylight_ai_model");
  if (saved && MODEL_DETAILS[saved]) {
    currentSelectedModel = saved;
  } else {
    // Default to Gemini 3.8 Flash (fastest ~1.3s response)
    localStorage.setItem("daylight_ai_model", "gemini-3.8-flash");
    currentSelectedModel = "gemini-3.8-flash";
  }
} catch {
  currentSelectedModel = "gemini-3.8-flash";
}

function getCurrentModel() {
  return currentSelectedModel;
}

function updateModelPickerUI() {
  const model = MODEL_DETAILS[currentSelectedModel] || MODEL_DETAILS["gemini-3.8-flash"];
  const nameEl = document.querySelector("#selected-model-name");
  if (nameEl) {
    nameEl.textContent = model.name;
    nameEl.setAttribute("title", model.name);
  }

  document.querySelectorAll(".ai-model-option").forEach((opt) => {
    const isSelected = opt.dataset.model === currentSelectedModel;
    opt.classList.toggle("active", isSelected);
    opt.setAttribute("aria-selected", String(isSelected));

    const checkEl = opt.querySelector(".ai-model-check");
    if (checkEl) {
      checkEl.textContent = isSelected ? "✓" : "";
    }
  });
}

function initModelPicker({ showToast = () => {}, onModelChange = () => {} } = {}) {
  const pickerBtn = document.querySelector("#ai-model-btn");
  const dropdown = document.querySelector("#ai-model-dropdown");

  if (!pickerBtn || !dropdown) return;

  updateModelPickerUI();

  // Toggle dropdown on button click
  pickerBtn.onclick = (e) => {
    e.stopPropagation();
    const isHidden = dropdown.hidden;
    dropdown.hidden = !isHidden;
    pickerBtn.setAttribute("aria-expanded", String(!isHidden));
  };

  // Option selection
  dropdown.querySelectorAll(".ai-model-option").forEach((opt) => {
    opt.onclick = (e) => {
      e.stopPropagation();
      const modelKey = opt.dataset.model;
      const modelMeta = MODEL_DETAILS[modelKey];

      if (!modelMeta) return;

      currentSelectedModel = modelKey;
      try {
        localStorage.setItem("daylight_ai_model", modelKey);
      } catch {}

      updateModelPickerUI();
      dropdown.hidden = true;
      pickerBtn.setAttribute("aria-expanded", "false");

      showToast(`Switched model to ${modelMeta.name}`);
      onModelChange(modelKey);
    };
  });

  // Click outside to close
  document.addEventListener("click", (e) => {
    if (!dropdown.hidden && !dropdown.contains(e.target) && !pickerBtn.contains(e.target)) {
      dropdown.hidden = true;
      pickerBtn.setAttribute("aria-expanded", "false");
    }
  });

  // Escape key to close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dropdown.hidden) {
      dropdown.hidden = true;
      pickerBtn.setAttribute("aria-expanded", "false");
    }
  });
}

// Ensure it binds as soon as the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initModelPicker());
} else {
  initModelPicker();
}

window.DaylightModels = {
  MODEL_DETAILS,
  getCurrentModel,
  updateModelPickerUI,
  initModelPicker,
};
