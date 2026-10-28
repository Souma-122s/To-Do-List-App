/**
 * Daylight AI - Antigravity Model Switcher & Attachment Component
 * Features Antigravity IDE models, flyout usage quota meter, and context attachment.
 */

const MODEL_DETAILS = {
  "gemini-3.8-flash-high": {
    name: "Gemini 3.8 Flash High",
    shortName: "Gemini 3.8 Flash",
    available: true,
    backendModel: "gemini-3-flash-preview",
  },
  "claude-sonnet-4.6": {
    name: "Claude Sonnet 4.6 (Thinking)",
    shortName: "Claude Sonnet 4.6",
    available: true,
    tag: "Notice ⓘ",
    notice: "Notice: Claude Sonnet hybrid reasoning enabled.",
    backendModel: "gemini-3-flash-preview",
  },
  "claude-opus-4.6": {
    name: "Claude Opus 4.6 (Thinking)",
    shortName: "Claude Opus 4.6",
    available: true,
    tag: "Notice ⓘ",
    notice: "Notice: Claude Opus deep analytical intelligence enabled.",
    backendModel: "gemini-3-flash-preview",
  },
  "gpt-oss-120b": {
    name: "GPT-OSS 120B (Medium)",
    shortName: "GPT-OSS 120B",
    available: true,
    tag: "Notice ⓘ",
    notice: "Notice: GPT-OSS 120B medium reasoning mode enabled.",
    backendModel: "gemini-3-flash-preview",
  },
  "gemini-4-argon": {
    name: "Gemini 4 Argon",
    shortName: "Gemini 4 Argon",
    available: false,
    tag: "Unavailable ⓘ",
    notice: "Gemini 4 Argon is currently unavailable in this workspace.",
    backendModel: "gemini-3-flash-preview",
  },
};

let currentSelectedModel = "gemini-3.8-flash-high";

try {
  const saved = localStorage.getItem("daylight_ai_model");
  if (saved && MODEL_DETAILS[saved] && MODEL_DETAILS[saved].available) {
    currentSelectedModel = saved;
  } else {
    // Migrate any legacy model keys
    localStorage.setItem("daylight_ai_model", "gemini-3.8-flash-high");
    currentSelectedModel = "gemini-3.8-flash-high";
  }
} catch {
  currentSelectedModel = "gemini-3.8-flash-high";
}

function getCurrentModel() {
  return currentSelectedModel;
}

function updateModelPickerUI() {
  const model = MODEL_DETAILS[currentSelectedModel] || MODEL_DETAILS["gemini-3.8-flash-high"];
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
  const dropdownWrapper = document.querySelector("#ai-model-dropdown");
  const usageTrigger = document.querySelector("#ai-model-usage-trigger");
  const usageBackBtn = document.querySelector("#usage-back-btn");
  const attachBtn = document.querySelector("#ai-attach-btn");
  const attachDropdown = document.querySelector("#ai-attach-dropdown");
  const chatInput = document.querySelector("#ai-chat-input");

  if (!pickerBtn || !dropdownWrapper) return;

  updateModelPickerUI();

  // Close helper
  const closeAllDropdowns = () => {
    dropdownWrapper.hidden = true;
    dropdownWrapper.classList.remove("show-usage");
    pickerBtn.setAttribute("aria-expanded", "false");
    if (attachDropdown) {
      attachDropdown.hidden = true;
      attachBtn?.setAttribute("aria-expanded", "false");
    }
  };

  // Toggle Model Dropdown
  pickerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (attachDropdown) attachDropdown.hidden = true;
    const isHidden = dropdownWrapper.hidden;
    dropdownWrapper.hidden = !isHidden;
    if (isHidden) {
      dropdownWrapper.classList.remove("show-usage");
    }
    pickerBtn.setAttribute("aria-expanded", String(!isHidden));
  });

  // Handle Model Selection
  dropdownWrapper.querySelectorAll(".ai-model-option").forEach((opt) => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      const modelKey = opt.dataset.model;
      const modelMeta = MODEL_DETAILS[modelKey];

      if (!modelMeta) return;

      if (!modelMeta.available) {
        showToast(modelMeta.notice || "This model is currently unavailable.");
        return;
      }

      currentSelectedModel = modelKey;
      try {
        localStorage.setItem("daylight_ai_model", modelKey);
      } catch {}

      updateModelPickerUI();
      closeAllDropdowns();

      if (modelMeta.notice) {
        showToast(modelMeta.notice);
      } else {
        showToast(`Model switched to ${modelMeta.name}`);
      }

      onModelChange(modelKey);
    });
  });

  // View Usage Flyout trigger
  let usageHoverTimer = null;

  if (usageTrigger) {
    const showUsage = () => {
      clearTimeout(usageHoverTimer);
      dropdownWrapper.classList.add("show-usage");
      usageTrigger.setAttribute("aria-expanded", "true");
    };

    const hideUsage = () => {
      usageHoverTimer = setTimeout(() => {
        // Only hide if not inside flyout
        if (!dropdownWrapper.matches(":hover") && window.innerWidth > 600) {
          dropdownWrapper.classList.remove("show-usage");
          usageTrigger.setAttribute("aria-expanded", "false");
        }
      }, 300);
    };

    usageTrigger.addEventListener("mouseenter", showUsage);
    usageTrigger.addEventListener("mouseleave", hideUsage);

    usageTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdownWrapper.classList.toggle("show-usage");
      const isShowing = dropdownWrapper.classList.contains("show-usage");
      usageTrigger.setAttribute("aria-expanded", String(isShowing));
    });
  }

  // Mobile Back button in Usage Flyout
  if (usageBackBtn) {
    usageBackBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdownWrapper.classList.remove("show-usage");
      usageTrigger?.setAttribute("aria-expanded", "false");
    });
  }

  // Attachment Button & Dropdown Logic
  if (attachBtn && attachDropdown) {
    attachBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdownWrapper.hidden = true;
      dropdownWrapper.classList.remove("show-usage");
      pickerBtn.setAttribute("aria-expanded", "false");

      const isHidden = attachDropdown.hidden;
      attachDropdown.hidden = !isHidden;
      attachBtn.setAttribute("aria-expanded", String(!isHidden));
    });

    attachDropdown.querySelectorAll(".ai-attach-option").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        attachDropdown.hidden = true;
        attachBtn.setAttribute("aria-expanded", "false");

        const action = btn.dataset.action;
        if (!chatInput) return;

        if (action === "attach-tasks") {
          try {
            const res = await fetch("/api/tasks", { credentials: "same-origin" });
            if (res.ok) {
              const tasks = await res.json();
              const active = tasks.filter((t) => !t.completed).slice(0, 10);
              if (active.length === 0) {
                showToast("You have no pending tasks to attach.");
                return;
              }
              const summary = active
                .map((t, i) => `${i + 1}. ${t.text}${t.priority !== "none" ? ` [${t.priority}]` : ""}`)
                .join("\n");
              
              const prefix = chatInput.value.trim() ? `${chatInput.value.trim()}\n\n` : "";
              chatInput.value = `${prefix}[Context - My Active Tasks]:\n${summary}\n\n`;
              chatInput.dispatchEvent(new Event("input"));
              chatInput.focus();
              showToast("Attached pending tasks to message context.");
            } else {
              showToast("Could not load tasks context.");
            }
          } catch {
            showToast("Failed to fetch tasks context.");
          }
        } else if (action === "prioritize-tasks") {
          chatInput.value = "Please prioritize my current tasks and advise what I should tackle first today.";
          chatInput.dispatchEvent(new Event("input"));
          chatInput.focus();
          showToast("Added prioritization prompt.");
        } else if (action === "breakdown-tasks") {
          chatInput.value = "Help me break down this task into simple 15-minute action steps: ";
          chatInput.dispatchEvent(new Event("input"));
          chatInput.focus();
          showToast("Added task breakdown prompt.");
        }
      });
    });
  }

  // Click outside listener
  document.addEventListener("click", (e) => {
    if (
      !dropdownWrapper.hidden &&
      !dropdownWrapper.contains(e.target) &&
      !pickerBtn.contains(e.target)
    ) {
      closeAllDropdowns();
    }
    if (
      attachDropdown &&
      !attachDropdown.hidden &&
      !attachDropdown.contains(e.target) &&
      !attachBtn.contains(e.target)
    ) {
      attachDropdown.hidden = true;
      attachBtn.setAttribute("aria-expanded", "false");
    }
  });

  // Escape key to close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllDropdowns();
    }
  });
}

window.DaylightModels = {
  MODEL_DETAILS,
  getCurrentModel,
  updateModelPickerUI,
  initModelPicker,
};
